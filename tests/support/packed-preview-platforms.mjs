import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { copyFile, mkdir, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { vi } from "vitest";

export const exec = promisify(execFile);
export const adminOrigin = "https://cms.lace.test";
export const previewOrigin = "https://preview.lace.test";
export const siteUrl = "https://published.example/journal/";
export const authSecret = "packed-preview-fixture-auth-secret";
export const bootstrapSecret = "packed-preview-fixture-runner-secret";
const builderSecret = "packed-preview-fixture-builder-secret";
const publicationSecret = "packed-preview-fixture-publication-secret";
const githubToken = "packed-preview-fixture-github-secret";
const accessKey = "lace-preview-local";
const storageSecret = "lace-preview-local-storage";
const firstPreviewMigration = "0004_protected_draft_preview";
const countingD1Path = fileURLToPath(
  new URL(
    "../../packages/platform-cloudflare/src/test-support/d1-test-harness.ts",
    import.meta.url,
  ),
);

export const docker = async (...args) =>
  (await exec("docker", args, { timeout: 60000 })).stdout.trim();

export async function packedModule(project, name, path = "dist/index.js") {
  const cli = await realpath(join(project, "node_modules/@lacecms/cli"));
  const file = await realpath(join(project, "node_modules/@lacecms", name, path)).catch((error) => {
    if (error.code !== "ENOENT") throw error;
    return realpath(join(dirname(cli), name, path));
  });
  if (!file.startsWith((await realpath(project)) + "/node_modules/"))
    throw new Error("Expected a packed runtime inside the generated project");
  return file;
}

const importFile = (file) => import(/* @vite-ignore */ pathToFileURL(file).href);

async function packedMigrations(project) {
  const root = dirname(dirname(await packedModule(project, "db")));
  const directory = join(root, "drizzle");
  const journal = JSON.parse(await readFile(join(directory, "meta/_journal.json"), "utf8"));
  const boundary = journal.entries.findIndex(({ tag }) => tag === firstPreviewMigration);
  if (boundary < 1) throw new Error("Missing packed pre-preview migration boundary");
  return { directory, journal, before: journal.entries.slice(0, boundary) };
}

async function migratePreviousNode(platform, platformFile, project, scratch, database) {
  const { directory, journal, before } = await packedMigrations(project);
  const previous = join(scratch, "pre-preview-migrations");
  await mkdir(join(previous, "meta"), { recursive: true });
  await writeFile(
    join(previous, "meta/_journal.json"),
    JSON.stringify({ ...journal, entries: before }),
  );
  await Promise.all(
    before.map(({ tag }) => copyFile(join(directory, tag + ".sql"), join(previous, tag + ".sql"))),
  );
  const { migrate } = createRequire(platformFile)("drizzle-orm/better-sqlite3/migrator");
  const node = platform.openNodeDatabase(database);
  try {
    migrate(node.drizzle, { migrationsFolder: previous });
  } finally {
    node.connection.close();
  }
}

export async function listen(server, cleanups, host = "127.0.0.1") {
  await new Promise((resolve, reject) => server.once("error", reject).listen(0, host, resolve));
  cleanups.push(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  );
  return server.address().port;
}

async function until(action) {
  let error;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      if (await action()) return;
    } catch (failure) {
      error = failure;
    }
    await delay(100);
  }
  throw new Error("Local preview service did not become ready", { cause: error });
}

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) =>
    server.once("error", reject).listen(0, "127.0.0.1", resolve),
  );
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

const outputTree = async (directory) => {
  const files = (await readdir(directory, { recursive: true, withFileTypes: true })).filter(
    (entry) => entry.isFile(),
  );
  return Object.fromEntries(
    await Promise.all(
      files.map(async (entry) => {
        const file = join(entry.parentPath, entry.name);
        return [
          file.slice(directory.length + 1),
          createHash("sha256")
            .update(await readFile(file))
            .digest("hex"),
        ];
      }),
    ),
  );
};

export async function synchronize({ application, repository, models, clock }) {
  const prepared = await application.prepareConfigurationSynchronization({
    models,
    state: repository,
  });
  await application.applyPreparedConfigurationSynchronization({
    models,
    prepared,
    target: repository,
    clock,
    ids: { next: randomUUID },
  });
}

export async function openNode({ project, scratch, commit, cleanups, intercept }) {
  const platformFile = await packedModule(project, "platform-node");
  const [platform, application, { default: config }] = await Promise.all([
    importFile(platformFile),
    importFile(await packedModule(project, "application")),
    importFile(join(project, "lace.config.ts")),
  ]);
  const storage = `lace-preview-s3-${randomUUID()}`;
  const compose = await readFile(join(project, "docker-compose.yml"), "utf8");
  const image = /^    image: \$\{LACE_MINIO_IMAGE:-([^}]+)\}$/mu.exec(compose)?.[1];
  if (!image) throw new Error("The generated consumer has no pinned private S3 image");
  await docker(
    "run",
    "-d",
    "--rm",
    "--name",
    storage,
    "-p",
    "127.0.0.1::9000",
    "-e",
    `MINIO_ROOT_USER=${accessKey}`,
    "-e",
    `MINIO_ROOT_PASSWORD=${storageSecret}`,
    image,
    "server",
    "/data",
  );
  cleanups.push(() => docker("rm", "-f", storage));
  const endpoint = `http://${await docker("port", storage, "9000")}`;
  const { S3Client, CreateBucketCommand } = createRequire(platformFile)("@aws-sdk/client-s3");
  const s3 = new S3Client({
    endpoint,
    forcePathStyle: true,
    region: "us-east-1",
    credentials: { accessKeyId: accessKey, secretAccessKey: storageSecret },
  });
  cleanups.push(() => s3.destroy());
  await until(() => s3.send(new CreateBucketCommand({ Bucket: "lace-preview" })));
  const database = join(scratch, "lace.sqlite");
  await migratePreviousNode(platform, platformFile, project, scratch, database);
  let runtime;
  const proxy = createServer(async (incoming, outgoing) => {
    try {
      const url = new URL(incoming.url, `http://${incoming.headers.host}`);
      if (url.origin !== runnerOrigin.slice(0, -1)) return outgoing.writeHead(404).end();
      let body;
      if (incoming.method === "POST") {
        let bytes = 0;
        const chunks = [];
        for await (const chunk of incoming) {
          bytes += chunk.length;
          if (bytes > 2 * 1024 * 1024) return outgoing.writeHead(413).end();
          chunks.push(chunk);
        }
        body = Buffer.concat(chunks);
      } else if (incoming.method === "PUT") body = Readable.toWeb(incoming);
      const request = new Request(url, {
        method: incoming.method,
        headers: incoming.headers,
        ...(body && { body, duplex: "half" }),
      });
      const response = await intercept(request, (value) => runtime.app.fetch(value));
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      outgoing.writeHead(502).end();
    }
  });
  const runnerOrigin = `http://host.docker.internal:${await listen(proxy, cleanups, "0.0.0.0")}/`;
  const port = await freePort();
  const builderOrigin = `http://127.0.0.1:${port}/`;
  let offset = 0;
  const clock = { now: () => Date.now() + offset };
  const nodeClock = vi
    .spyOn(platform.SystemNodeClock.prototype, "now")
    .mockImplementation(clock.now);
  cleanups.push(() => nodeClock.mockRestore());
  const configure = (enabled, rotateRunnerSecret) => {
    runtime?.close();
    runtime = undefined;
    runtime = platform.createNodeRuntime({
      config,
      logger: { log() {} },
      settings: platform.parseNodeRuntimeSettings({
        LACE_AUTH_SECRET: authSecret,
        LACE_PUBLIC_BASE_URL: adminOrigin + "/",
        LACE_DATABASE_PATH: database,
        LACE_MINIO_ENDPOINT: endpoint,
        LACE_MINIO_BUCKET: "lace-preview",
        LACE_MINIO_ACCESS_KEY: accessKey,
        LACE_MINIO_SECRET_KEY: storageSecret,
        LACE_MINIO_REGION: "us-east-1",
        LACE_MINIO_TIMEOUT_MS: "10000",
        LACE_PREVIEW_ENABLED: String(enabled),
        LACE_PREVIEW_ORIGIN: previewOrigin,
        LACE_PREVIEW_BUILDER_URL: builderOrigin,
        LACE_PREVIEW_RUNNER_ORIGIN: runnerOrigin,
        LACE_PREVIEW_BUILDER_SECRET: builderSecret,
        LACE_PREVIEW_RUNNER_SECRET: rotateRunnerSecret
          ? bootstrapSecret + "-rotated"
          : bootstrapSecret,
        LACE_BUILD_SITE_URL: siteUrl,
        LACE_BUILD_SITE_ID: "main-site",
        LACE_BUILD_SITE_LABEL: "Main site",
      }),
    });
  };
  configure(false);
  cleanups.push(() => runtime?.close());
  const sync = (removePosts = false) =>
    synchronize({
      application,
      repository: runtime.repository,
      clock,
      models: config.runtime.content.filter((model) => !removePosts || model.key !== "posts"),
    });
  const builder = `lace-preview-builder-${randomUUID()}`;
  const releaseVolume = builder + "-output";
  await docker("volume", "create", releaseVolume);
  cleanups.push(() => docker("volume", "rm", releaseVolume));
  let started = false;
  const stop = async () => {
    if (!started) return;
    await docker("rm", "-f", builder);
    started = false;
  };
  cleanups.push(stop);
  const start = async (token, previewEnabled) => {
    if (started) throw new Error("Builder already started");
    const env = {
      LACE_API_BASE_URL: runnerOrigin,
      LACE_BUILD_TOKEN: token,
      LACE_BUILDER_SECRET: publicationSecret,
      LACE_BUILD_SITE_URL: siteUrl,
      ...(previewEnabled && {
        LACE_PREVIEW_ENABLED: "true",
        LACE_PREVIEW_BUILDER_SECRET: builderSecret,
        LACE_PREVIEW_RUNNER_SECRET: bootstrapSecret,
      }),
    };
    await exec(
      "docker",
      [
        "run",
        "-d",
        "--rm",
        "--name",
        builder,
        "-p",
        `127.0.0.1:${port}:8788`,
        "--add-host",
        "host.docker.internal:host-gateway",
        "-v",
        `${project}:/source:ro`,
        "-v",
        `${releaseVolume}:/output`,
        ...Object.keys(env).flatMap((key) => ["--env", key]),
        process.env.LACE_TEST_PREVIEW_BUILDER_IMAGE,
      ],
      { env: { ...process.env, ...env }, timeout: 60000 },
    );
    started = true;
    await until(async () => (await fetch(new URL("health", builderOrigin))).ok);
  };
  const sql = (text, ...parameters) => {
    const statement = runtime.database.connection.prepare(text);
    return statement.reader ? statement.all(...parameters) : statement.run(...parameters);
  };
  const release = async () => {
    const link = await docker("exec", builder, "readlink", "/output/current");
    const directory = join(scratch, "public-release");
    await rm(directory, { recursive: true, force: true });
    await docker("cp", `${builder}:/output/current/.`, directory);
    return { link, tree: await outputTree(directory), directory };
  };
  return {
    commit,
    clock,
    start,
    stop,
    requestBuilderPreview: () =>
      fetch(new URL("preview", builderOrigin), {
        method: "PUT",
        headers: {
          authorization: `Bearer ${builderSecret}`,
          "content-type": "application/json",
        },
        body: "{}",
      }),
    sync,
    sql,
    release,
    runnerOrigin,
    fetch: (request) => {
      // Model the operator closing the dedicated ingress before removing settings.
      if (!runtime.previewPackages && new URL(request.url).origin === previewOrigin)
        return new Response(null, { status: 404 });
      return runtime.app.fetch(request);
    },
    upgrade: () => {
      runtime.close();
      runtime = undefined;
      platform.migrateNodeDatabase(database);
      configure(false);
    },
    configurePreview: configure,
    setupToken: async () => (await runtime.security.createSetupToken()).token,
    advance: async (ms) => {
      offset += ms;
    },
    setTime: async (now) => {
      offset = now - Date.now();
    },
    buildPublic: async (targetVersion) => {
      const result = await fetch(new URL("build", builderOrigin), {
        method: "POST",
        headers: {
          authorization: `Bearer ${publicationSecret}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ buildId: `public-${targetVersion}`, targetVersion }),
      });
      if (!result.ok)
        throw new Error(
          `Node publication build failed: ${await result.text()}\n${await docker("logs", builder)}`,
        );
      return release();
    },
    reconcile: () => runtime.maintainOperations(),
    diagnostics: async () => {
      const { stdout, stderr } = await exec("docker", ["logs", builder]);
      return stdout + stderr;
    },
  };
}

export async function openWorker({ project, commit, cleanups }) {
  project = await realpath(project);
  const wrapper = createRequire(join(project, "package.json"));
  const { Miniflare, convertV4MiniflareOptions, Response: WorkerResponse } = wrapper("miniflare");
  const { build } = createRequire(wrapper.resolve("wrangler/package.json"))("esbuild");
  const applicationPath = await packedModule(project, "application");
  const script = await build({
    absWorkingDir: project,
    stdin: {
      resolveDir: project,
      loader: "ts",
      contents: `
        import config from "./lace.config.ts";
        import { createCloudflareWorker } from "@lacecms/platform-cloudflare";
        import { prepareConfigurationSynchronization, applyPreparedConfigurationSynchronization } from ${JSON.stringify(applicationPath)};
        import { countingD1 } from ${JSON.stringify(countingD1Path)};
        let offset = 0;
        let enabled = false;
        let rotated = false;
        let settings;
        const clock = { now: () => Date.now() + offset };
        const workers = new WeakMap();
        const compose = (env) => createCloudflareWorker({
          config, clock, postCommitBuildDelayMs: 0,
          logger: { log() {} },
          previewGitHubFetch: (url, init) => env.GITHUB.fetch(url, init),
          buildTrigger: () => ({ trigger: () => env.PUBLICATION.fetch("https://build.lace.test/").then(() => ({ status: "accepted" })) }),
        });
        export default { async fetch(request, env, ctx) {
          let worker = workers.get(env);
          if (!worker) { worker = compose(env); workers.set(env, worker); }
          const url = new URL(request.url);
          // Miniflare replaces Host with its local listener. Preserve the virtual edge host.
          const headers = new Headers(request.headers);
          headers.set("host", url.host);
          settings ??= { ...env, LACE_PREVIEW_ENABLED: String(enabled) };
          if (enabled && rotated) settings.LACE_PREVIEW_RUNNER_SECRET = env.LACE_PREVIEW_RUNNER_SECRET + "-rotated";
          if (url.pathname === "/__fixture") {
            const fields = await request.json();
            const { operation, ms, now, removePosts } = fields;
            if (operation === "configure-preview") {
              enabled = fields.enabled;
              rotated = fields.rotateRunnerSecret;
              settings = undefined;
              return Response.json(null);
            }
            const runtime = worker.runtime(settings);
            if (operation === "setup") return Response.json(await runtime.security.createSetupToken());
            if (operation === "clock") offset += ms;
            if (operation === "set-time") offset = now - Date.now();
            if (operation === "reconcile") await worker.scheduled({ cron: "*/2 * * * *" }, settings);
            if (operation === "sync") {
              const models = config.runtime.content.filter((model) => !removePosts || model.key !== "posts");
              const prepared = await prepareConfigurationSynchronization({ models, state: runtime.repository });
              await applyPreparedConfigurationSynchronization({
                clock, ids: { next: () => crypto.randomUUID() }, models, prepared, target: runtime.repository,
              });
            }
            return Response.json(null);
          }
          const measured = headers.has("x-fixture-measure-d1");
          headers.delete("x-fixture-measure-d1");
          if (!measured) return worker.fetch(new Request(request, { headers }), settings, ctx);
          const { binding, stats } = countingD1(env.DB);
          const pending = [];
          const response = await worker.fetch(new Request(request, { headers }),
            { ...settings, DB: binding }, { waitUntil: (promise) => pending.push(promise) });
          await Promise.all(pending);
          const output = new Response(response.body, response);
          output.headers.set("x-fixture-d1-counts", JSON.stringify(stats));
          return output;
        } };
      `,
    },
    write: false,
    metafile: true,
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    conditions: ["workerd", "worker", "browser"],
    external: ["node:*", "miniflare"],
  });
  if (
    script.metafile?.inputs &&
    Object.keys(script.metafile.inputs).some((input) => {
      const path = resolve(project, input);
      return !path.startsWith(project + "/") && path !== countingD1Path;
    })
  )
    throw new Error("Worker bundle resolved a workspace source");
  const runs = new Map();
  let publications = 0;
  const providerPaths = [];
  const worker = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: script.outputFiles[0].text,
      compatibilityDate: "2026-09-01",
      compatibilityFlags: ["nodejs_compat"],
      d1Databases: ["DB"],
      r2Buckets: ["MEDIA", "PREVIEW"],
      bindings: {
        LACE_AUTH_SECRET: authSecret,
        LACE_PUBLIC_BASE_URL: adminOrigin + "/",
        LACE_PREVIEW_ENABLED: "true",
        LACE_PREVIEW_ORIGIN: previewOrigin,
        LACE_BUILD_SITE_URL: siteUrl,
        LACE_BUILD_SITE_ID: "main-site",
        LACE_BUILD_SITE_LABEL: "Main site",
        LACE_PREVIEW_GITHUB_REPOSITORY: "lace-fixture/preview",
        LACE_PREVIEW_GITHUB_REF: "main",
        LACE_PREVIEW_GITHUB_WORKFLOW: "lace-preview.yml",
        LACE_PREVIEW_GITHUB_TOKEN: githubToken,
        LACE_PREVIEW_RUNNER_SECRET: bootstrapSecret,
        LACE_PREVIEW_SITE_PATH: "site",
      },
      serviceBindings: {
        PUBLICATION: () => {
          publications++;
          return new WorkerResponse(null, { status: 202 });
        },
        GITHUB: async (request) => {
          const url = new URL(request.url);
          providerPaths.push(url.pathname);
          if (
            url.origin !== "https://api.github.com" ||
            request.headers.get("authorization") !== `Bearer ${githubToken}`
          )
            return new WorkerResponse(null, { status: 403 });
          if (url.pathname === "/repos/lace-fixture/preview/commits/main")
            return new WorkerResponse(commit);
          if (
            url.pathname ===
            "/repos/lace-fixture/preview/actions/workflows/lace-preview.yml/dispatches"
          ) {
            const { ref, inputs } = await request.json();
            if (ref !== "main" || inputs.commit !== commit)
              throw new Error("Unexpected source dispatch");
            const run = {
              id: 100 + runs.size,
              display_title: `Lace preview ${inputs.generation}`,
              generation: inputs.generation,
              path: ".github/workflows/lace-preview.yml@main",
              event: "workflow_dispatch",
              head_sha: commit,
              run_attempt: 1,
              status: "in_progress",
            };
            runs.set(run.id, run);
            return WorkerResponse.json({ workflow_run_id: run.id });
          }
          const match = /^\/repos\/lace-fixture\/preview\/actions\/runs\/(\d+)(\/cancel)?$/u.exec(
            url.pathname,
          );
          const run = match && runs.get(Number(match[1]));
          if (!run) throw new Error("Unexpected GitHub endpoint");
          if (match[2]) {
            run.status = "completed";
            run.conclusion = "cancelled";
            return new WorkerResponse(null, { status: 202 });
          }
          return WorkerResponse.json(run);
        },
      },
    }),
  );
  cleanups.push(() => worker.dispose());
  const db = await worker.getD1Database("DB");
  const { directory, journal, before } = await packedMigrations(project);
  await db.prepare("create table d1_migrations (id integer primary key, name text not null)").run();
  const apply = async (entries) => {
    for (const { tag } of entries) {
      const name = tag + ".sql";
      const statements = (await readFile(join(directory, name), "utf8")).split(
        "--> statement-breakpoint",
      );
      await db.batch([
        ...statements
          .filter((statement) => statement.trim())
          .map((statement) => db.prepare(statement)),
        db.prepare("insert into d1_migrations (name) values (?)").bind(name),
      ]);
    }
  };
  await apply(before);
  const request = (value) =>
    worker.dispatchFetch(value.url, new Request(value, { redirect: "manual" }));
  const control = async (operation, fields = {}) => {
    const result = await request(
      new Request(adminOrigin + "/__fixture", {
        method: "POST",
        body: JSON.stringify({ operation, ...fields }),
      }),
    );
    if (!result.ok) throw new Error(`Worker fixture ${operation} failed: ${await result.text()}`);
    return result.json();
  };
  const sync = (removePosts = false) => control("sync", { removePosts });
  return {
    commit,
    fetch: request,
    sync,
    upgrade: () => apply(journal.entries.slice(before.length)),
    configurePreview: (enabled, rotateRunnerSecret) =>
      control("configure-preview", { enabled, rotateRunnerSecret }),
    runs,
    providerPaths,
    setupToken: async () => (await control("setup")).token,
    advance: (ms) => control("clock", { ms }),
    setTime: (now) => control("set-time", { now }),
    reconcile: () => control("reconcile"),
    sql: async (text, ...parameters) =>
      (
        await db
          .prepare(text)
          .bind(...parameters)
          .all()
      ).results,
    get publications() {
      return publications;
    },
  };
}

export { outputTree };
