import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { cp, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { parseEnv } from "node:util";
import { createRequire } from "node:module";
import {
  startWorker,
  stopWorker,
  waitReady,
  withVariable,
  workerCommand,
} from "../cloudflare-consumer-acceptance.mjs";
import { digest, inspectCutover, seedPendingWork } from "./upgrade-state.mjs";
import { siteProbe } from "./upgrade-site.mjs";
import { verifySdkDeclarations } from "./sdk-upgrade-compatibility.mjs";

const originVersion = "1.0.0";
const targetVersion = "1.1.0";
const env = { CI: "true", WRANGLER_SEND_METRICS: "false" };
const copyProject = (from, to) =>
  cp(from, to, { recursive: true, filter: (file) => basename(file) !== "node_modules" });

async function dbPackage(project) {
  const cli = await realpath(join(project, "node_modules/@lacecms/cli"));
  const platform = await realpath(join(cli, "../platform-node"));
  return realpath(join(platform, "../db"));
}

export async function stableUpgrade(parent, kind, ops) {
  const { run, workspace, secretValues, installPackedConsumer } = ops;
  const edge = kind === "cloudflare";
  const root = join(await realpath(parent), "stable-upgrade-" + kind);
  const project = (phase) => join(root, phase, "acceptance-site");
  const original = project("original"),
    stable = project("stable"),
    target = project("target"),
    restored = project("restored");
  const provenance = JSON.parse(await readFile(join(workspace, "release/upgrade-origin.json")));
  assert.equal(provenance.generator, "create-lace@" + originVersion);
  const recorded = JSON.parse(await readFile(join(workspace, "release/published-1.0.0.json")));
  assert.equal(recorded.sourceRevision, provenance.sourceRevision);
  assert.equal(recorded.generatorSha256, provenance.archiveSha256);
  const images = Object.fromEntries(
    Object.entries(recorded.images).map(([name, { index }]) => [
      name,
      `ghcr.io/lacecms/${name}@${index}`,
    ]),
  );
  const fixture = JSON.parse(
    await readFile(
      join(
        workspace,
        `tests/fixtures/template-${provenance.templateVersion}`,
        edge ? "cloudflare.json" : "default.json",
      ),
    ),
  );
  assert.deepEqual(fixture.provenance, provenance);
  for (const [file, bytes] of Object.entries(fixture.files)) {
    await mkdir(dirname(join(original, file)), { recursive: true });
    await writeFile(join(original, file), bytes);
  }
  const port = await ops.freePort();
  const base = "http://127.0.0.1:" + port + "/";
  const sharp = createRequire(join(workspace, "packages/platform-node/package.json"))("sharp");
  const png = (background) =>
    sharp({ create: { width: 2, height: 2, channels: 3, background } })
      .png()
      .toBuffer();
  const originalPng = await png("#1188ee");
  const probe = siteProbe(base, secretValues, originalPng);
  const localWebp = (await sharp(originalPng).webp().toBuffer()).toString("base64");
  const configPath = join(original, "lace.config.ts");
  const config = await readFile(configPath, "utf8");
  const reference = 'relatedEntry: field.reference({ models: ["home"] })';
  const seededConfig = config.replace(
    'relatedUrl: field.url({ label: "Related page" })',
    'relatedUrl: field.url({ label: "Related page" }), ' + reference,
  );
  assert.notEqual(seededConfig, config);
  await writeFile(configPath, seededConfig);
  const label = "stable-upgrade-" + kind + "-";
  const invoke = (stage, cmd, args, cwd, extra = {}) =>
    run(label + stage, cmd, args, { cwd, env, ...extra });
  const script = (dir, name, args = [], extra = {}) =>
    invoke(name, "pnpm", [name, ...args], dir, extra);
  const migrate = (dir) => script(dir, edge ? "cf:db:migrate" : "db:migrate", ["--json"]);
  const sync = (dir) => script(dir, edge ? "cf:content:sync" : "content:sync", ["--json"]);
  const groups = new Map([
    [original, "lace-origin-" + randomUUID()],
    [stable, "lace-stable-" + randomUUID()],
    [restored, "lace-restored-" + randomUUID()],
  ]);
  const compose = (dir, ...args) =>
    invoke(
      "compose",
      "docker",
      ["compose", "-p", groups.get(dir), "-f", "docker-compose.yml", ...args],
      dir,
    );
  const docker = (...args) => invoke("docker", "docker", args, original);
  let worker;
  const started = new Set();
  async function start(dir, useImages = false) {
    started.add(dir);
    if (edge) {
      const manifest = JSON.parse(await readFile(join(dir, "package.json")));
      const args = workerCommand(manifest.scripts["cf:dev"], port);
      if (useImages) args.splice(1, 0, "worker/upgrade-images-probe.ts");
      worker = startWorker(dir, args);
      await waitReady(worker, base, label + "ready", ops.sanitize);
    } else {
      await compose(dir, "up", "-d", "--wait", "--wait-timeout", "120", "web");
    }
  }
  async function stop(dir) {
    if (edge) {
      await stopWorker(worker);
      worker = undefined;
    } else await compose(dir, "down");
  }
  async function configure(dir, values, file = ".env") {
    const path = join(dir, file);
    let text = await readFile(path, "utf8");
    for (const [name, value] of Object.entries(values)) text = withVariable(text, name, value);
    await writeFile(path, text, { mode: 0o600 });
  }
  // Each recovery target has its own Compose project and a previously empty volume.
  async function cloneMedia(from, to) {
    const src = groups.get(from) + "_minio-data",
      dst = groups.get(to) + "_minio-data";
    await docker("volume", "inspect", src);
    await docker(
      "volume",
      "create",
      "--label",
      "com.docker.compose.project=" + groups.get(to),
      "--label",
      "com.docker.compose.volume=minio-data",
      dst,
    );
    started.add(to);
    await docker(
      "run",
      "--rm",
      "--network",
      "none",
      "--user",
      "0:0",
      "--entrypoint",
      "sh",
      "--mount",
      "type=volume,source=" + src + ",target=/src,readonly",
      "--mount",
      "type=volume,source=" + dst + ",target=/dst",
      images.api,
      "-ec",
      'test -z "$(ls -A /dst)" && cp -a /src/. /dst/',
    );
  }
  try {
    await script(original, "install", ["--no-frozen-lockfile"]);
    await script(original, "install", ["--frozen-lockfile"]);
    const originalDb = JSON.parse(await readFile(join(await dbPackage(original), "package.json")));
    assert.equal(originalDb.version, originVersion);
    const originalDatabasePackage = await dbPackage(original);
    await script(original, "env:prepare");
    const settings = parseEnv(await readFile(join(original, ".env"), "utf8"));
    for (const [name, value] of Object.entries(settings))
      if (value && /SECRET|ACCESS_KEY/u.test(name)) secretValues.add(value);
    await configure(original, {
      LACE_PUBLIC_BASE_URL: base,
      LACE_API_BASE_URL: base,
      LACE_HTTP_PORT: String(port),
      LACE_API_IMAGE: images.api,
      LACE_BUILDER_IMAGE: images.builder,
    });
    if (edge) {
      await script(original, "cf:env:prepare");
      await configure(original, { LACE_PUBLIC_BASE_URL: base }, "worker/.dev.vars");
    } else {
      for (const image of Object.values(images)) await docker("pull", image);
      await compose(original, "pull", "minio");
    }
    await migrate(original);
    await sync(original);
    const bootstrap = JSON.parse(
      await script(original, edge ? "cf:auth:bootstrap" : "auth:bootstrap", ["--json"], {
        intentionalReveal: true,
      }),
    ).data.token;
    assert.ok(bootstrap);
    secretValues.add(bootstrap);
    await start(original);
    await probe.seed(bootstrap);
    await probe.verify(originVersion);
    const priorOutput = await probe.rebuild(original, run, label + "original-build");
    await stop(original);
    await seedPendingWork(original, kind);
    const before = await inspectCutover(original, kind);
    assert.ok(before.ledger.length > 0);
    await copyProject(original, stable);
    await copyProject(original, restored);
    if (!edge) {
      await cloneMedia(original, stable);
      await cloneMedia(original, restored);
    }
    await mkdir(dirname(target), { recursive: true });
    await invoke(
      "target",
      "node",
      [ops.generator, "create", target, "--starter", ...(edge ? ["--cloudflare"] : [])],
      root,
    );
    const upgrade = async (apply) =>
      JSON.parse(
        await invoke(
          "template",
          "node",
          [
            ops.cli,
            "upgrade",
            "--project",
            stable,
            "--template",
            target,
            "--json",
            ...(apply ? ["--apply"] : []),
          ],
          root,
        ),
      );
    assert.equal((await upgrade(false)).data.conflicts, 0);
    assert.equal((await upgrade(true)).code, "UPGRADE_APPLIED");
    assert.equal((await upgrade(false)).data.changes, 0);
    // The generated site's package.json is operator-owned. Adopt the reviewed
    // first-party coordinates while keeping the application's sources intact.
    const siteFile = join(stable, "site/package.json");
    const site = JSON.parse(await readFile(siteFile));
    const next = JSON.parse(await readFile(join(target, "site/package.json")));
    for (const name of Object.keys(site.dependencies))
      if (name.startsWith("@lacecms/")) site.dependencies[name] = next.dependencies[name];
    await writeFile(siteFile, JSON.stringify(site, null, 2) + "\n");
    await installPackedConsumer(stable);
    if (!edge)
      await configure(stable, {
        LACE_API_IMAGE: ops.images.api.imageId,
        LACE_BUILDER_IMAGE: ops.images.builder.imageId,
      });
    await verifySdkDeclarations(original, stable, ops);
    await migrate(stable);
    const after = await inspectCutover(stable, kind);
    assert.deepEqual(after, before);
    const installedDb = await dbPackage(stable);
    const chain = async (root) => {
      const journal = await readFile(join(root, "drizzle/meta/_journal.json"));
      const scripts = await Promise.all(
        JSON.parse(journal).entries.map(({ tag }) => readFile(join(root, "drizzle", tag + ".sql"))),
      );
      return digest(Buffer.concat([journal, ...scripts]));
    };
    assert.equal(await chain(installedDb), await chain(originalDatabasePackage));
    assert.equal(await chain(installedDb), await chain(join(workspace, "packages/db")));
    await migrate(stable);
    assert.deepEqual(await inspectCutover(stable, kind), after);
    await sync(stable);
    await start(stable);
    await probe.verify(targetVersion);
    await probe.verifyLegacySdk(original);
    await probe.verifyThumbnail(!edge);
    const replacement = await probe.upload("stable", await png("#ee5511"));
    if (edge) {
      await writeFile(
        join(stable, "worker/upgrade-images-probe.ts"),
        `
import worker from "./index";
const images = {
  input: (stream: ReadableStream<Uint8Array>) => ({
    transform: () => ({
      output: async () => {
        await new Response(stream).arrayBuffer();
        const bytes = Uint8Array.from(atob(${JSON.stringify(localWebp)}), char => char.charCodeAt(0));
        return { response: () => new Response(bytes, { headers: { "content-type": "image/webp" } }) };
      },
    }),
  }),
};
export default {
  ...worker,
  fetch: (request: Request, env: Parameters<typeof worker.fetch>[1], ctx: Parameters<typeof worker.fetch>[2]) =>
    worker.fetch(request, { ...env, IMAGES: images }, ctx),
};
`,
      );
    }
    await stop(stable);
    await start(stable, edge);
    await probe.verify(targetVersion);
    await probe.mediaRead(replacement);
    await probe.verifyThumbnail(true);
    const stableOutput = await probe.rebuild(stable, run, label + "stable-build");
    await stop(stable);
    const restoredState = await inspectCutover(restored, kind);
    assert.deepEqual(restoredState, before);
    await script(restored, "install", ["--frozen-lockfile"]);
    await start(restored);
    await probe.verify(originVersion);
    await probe.verifyMissing(replacement.id);
    const restoredOutput = await probe.served(restored);
    assert.equal(restoredOutput, priorOutput);
    return {
      sourceRevision: provenance.sourceRevision,
      generatorSha256: provenance.archiveSha256,
      beforeFingerprint: before.state,
      upgradedFingerprint: after.state,
      restoredFingerprint: restoredState.state,
      originalOutput: priorOutput,
      stableOutput,
      restoredOutput,
      newMediaSha256: replacement.sha256,
      originalMediaSha256: probe.originalMediaSha256(),
      migrationsApplied: after.ledger.length - before.ledger.length,
      ledgerFingerprint: digest(JSON.stringify(before.ledger)),
      upgradedLedgerFingerprint: digest(JSON.stringify(after.ledger)),
      restoredLedgerFingerprint: digest(JSON.stringify(restoredState.ledger)),
      schemaFingerprint: before.schema,
      upgradedSchemaFingerprint: after.schema,
      restoredSchemaFingerprint: restoredState.schema,
      originImages: recorded.images,
      oldSdkReads: true,
      thumbnailChecks: true,
    };
  } finally {
    if (edge) await stopWorker(worker);
    else for (const dir of started) await compose(dir, "down", "--volumes", "--remove-orphans");
  }
}
