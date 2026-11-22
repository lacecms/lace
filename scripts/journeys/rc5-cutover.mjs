import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { cp, mkdir, readFile, realpath, rename, writeFile } from "node:fs/promises";
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
import { inspectCutover, seedPendingWork } from "./rc5-state.mjs";
import { siteProbe } from "./rc5-site.mjs";

const rc5 = "0.1.0-rc5";
const images = {
  api: "ghcr.io/lacecms/api@sha256:0359eae1c62cdde3b71a201588a332b3fdbcc9746b8f3caec5a3ac64bdfabc5a",
  builder:
    "ghcr.io/lacecms/builder@sha256:2c9aeb850f75801e43236893d635cc3eb19e9c2ffd1d323f26b760dc2b4dcfd0",
};
const env = { CI: "true", WRANGLER_SEND_METRICS: "false" };
const copyProject = (from, to) =>
  cp(from, to, { recursive: true, filter: (file) => basename(file) !== "node_modules" });

async function dbPackage(project) {
  const cli = await realpath(join(project, "node_modules/@lacecms/cli"));
  const platform = await realpath(join(cli, "../platform-node"));
  return realpath(join(platform, "../db"));
}

export async function rc5Cutover(parent, kind, ops) {
  const { run, workspace, secretValues, installPackedConsumer } = ops;
  const edge = kind === "cloudflare";
  const root = join(await realpath(parent), "rc5-" + kind);
  const project = (phase) => join(root, phase, "acceptance-site");
  const original = project("original"),
    stable = project("stable"),
    target = project("target"),
    restored = project("restored");
  const fixture = JSON.parse(
    await readFile(
      join(workspace, "tests/fixtures/template-0.50.0", edge ? "cloudflare.json" : "default.json"),
    ),
  );
  const provenance = JSON.parse(await readFile(join(workspace, "release/upgrade-origin.json")));
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
  const probe = siteProbe(base, secretValues, await png("#1188ee"));
  const label = "rc5-" + kind + "-";
  const invoke = (stage, cmd, args, cwd, extra = {}) =>
    run(label + stage, cmd, args, { cwd, env, ...extra });
  const script = (dir, name, args = [], extra = {}) =>
    invoke(name, "pnpm", [name, ...args], dir, extra);
  const migrate = (dir) => script(dir, edge ? "cf:db:migrate" : "db:migrate", ["--json"]);
  const sync = (dir) => script(dir, edge ? "cf:content:sync" : "content:sync", ["--json"]);
  const groups = new Map([
    [original, "lace-rc5-" + randomUUID()],
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
  async function start(dir) {
    started.add(dir);
    if (edge) {
      const manifest = JSON.parse(await readFile(join(dir, "package.json")));
      worker = startWorker(dir, workerCommand(manifest.scripts["cf:dev"], port));
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
    assert.equal(originalDb.version, rc5);
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
      await compose(original, "build", "minio");
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
    await probe.verify(rc5);
    const priorOutput = await probe.rebuild(original, run, label + "original-build");
    await stop(original);
    await seedPendingWork(original, kind);
    const before = await inspectCutover(original, kind);
    assert.equal(before.ledger.length, 2);
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
    await migrate(stable);
    const after = await inspectCutover(stable, kind);
    const installedDb = await dbPackage(stable);
    const journal = JSON.parse(await readFile(join(installedDb, "drizzle/meta/_journal.json")));
    assert.equal(journal.entries.length, 7);
    assert.deepEqual(after.ledger.slice(0, 2), before.ledger);
    assert.deepEqual(
      after.ledger.map((row) => (edge ? row.name : row.created_at)),
      journal.entries.map((step) => (edge ? step.tag + ".sql" : step.when)),
    );
    assert.equal(after.state, before.state);
    const data = join(stable, ".lace/data");
    await rename(data, join(root, "upgraded-data"));
    try {
      await migrate(stable);
      assert.equal(await inspectCutover(stable, kind, true), after.schema);
    } finally {
      await rename(data, join(root, "fresh-data"));
      await rename(join(root, "upgraded-data"), data);
    }
    await migrate(stable);
    assert.deepEqual(await inspectCutover(stable, kind), after);
    await sync(stable);
    await start(stable);
    await probe.verify("1.0.0");
    const replacement = await probe.upload("stable", await png("#ee5511"));
    await stop(stable);
    await start(stable);
    await probe.verify("1.0.0");
    await probe.mediaRead(replacement);
    const stableOutput = await probe.rebuild(stable, run, label + "stable-build");
    await stop(stable);
    const restoredState = await inspectCutover(restored, kind);
    assert.deepEqual(restoredState, before);
    await script(restored, "install", ["--frozen-lockfile"]);
    if (!edge) await compose(restored, "build", "minio");
    await start(restored);
    await probe.verify(rc5);
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
    };
  } finally {
    if (edge) await stopWorker(worker);
    else for (const dir of started) await compose(dir, "down", "--volumes", "--remove-orphans");
  }
}
