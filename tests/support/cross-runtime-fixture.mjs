import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { createServer } from "node:http";
import { application, node, cloudflare } from "./operational-platforms.mjs";
const { applyPreparedConfigurationSynchronization, prepareConfigurationSynchronization } =
  application;
const { createNodeRuntime, migrateNodeDatabase, parseNodeRuntimeSettings } = node;
const { createCloudflareWorker } = cloudflare;
import { openLocalCloudflare } from "../../packages/platform-cloudflare/src/d1-test-harness.mjs";
import { createNodeAdminAssets } from "../../apps/api/dist/admin-assets.js";
import rootConfig from "../../lace.config.ts";

const exec = promisify(execFile);
const nodeRequire = createRequire(
  new URL("../../packages/platform-node/package.json", import.meta.url),
);
const apiRequire = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const { S3Client, CreateBucketCommand, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } =
  nodeRequire("@aws-sdk/client-s3");
const { getRequestListener } = apiRequire("@hono/node-server");
export const password = "Cross-runtime-local-password-Cross-runtime!";
export const png = await nodeRequire("sharp")({
  create: { width: 1, height: 1, channels: 3, background: { r: 1, g: 2, b: 3 } },
})
  .png()
  .toBuffer();

/**
 * Only fixture-owned state is ever removed. No development paths or remote bindings.
 * `options.config` replaces the root configuration for composition and synchronization.
 */
export async function openProductRuntime(kind, options = {}) {
  const config = options.config ?? rootConfig;
  const cleanups = [];
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    const errors = [];
    for (const cleanup of cleanups.reverse()) {
      try {
        await cleanup();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) throw new AggregateError(errors, "Cross-runtime fixture cleanup failed");
  };
  const stop = () => {
    void close().then(
      () => process.exit(130),
      (error) => {
        console.error(error);
        process.exit(1);
      },
    );
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    // Reserve the HTTP listener first so auth, storage and browser share one origin.
    const listener = createServer();
    await new Promise((done) => listener.listen(0, "127.0.0.1", done));
    cleanups.push(
      () =>
        new Promise((done) => {
          listener.closeAllConnections();
          listener.close(done);
        }),
    );
    const origin = `http://127.0.0.1:${listener.address().port}`;
    const admin = createNodeAdminAssets(resolve("apps/admin/dist"));
    let runtime, request, expireSessions, dispatch, backup, restart, rotateStorageCredentials;
    let maintenance = false;
    const metadataFiles = ["lace.config.ts", "package.json", "pnpm-lock.yaml"];
    const captureMetadata = async (destination) => {
      await mkdir(join(destination, "project"), { recursive: true, mode: 0o700 });
      for (const file of metadataFiles) await cp(resolve(file), join(destination, "project", file));
      if (process.env.LACE_VERIFY_PACKED_ROOT) {
        const consumer = join(destination, "consumer");
        await mkdir(join(consumer, ".lace"), { recursive: true, mode: 0o700 });
        for (const file of [...metadataFiles, ".lace/manifest.json"])
          await cp(join(process.env.LACE_VERIFY_PACKED_ROOT, file), join(consumer, file));
      }
    };
    let dispatchPending = async () => {};
    const buildTrigger = { trigger: async () => ({ status: "failed", reason: "build_failed" }) };
    if (kind === "node") {
      const directory = await mkdtemp(join(tmpdir(), "lace-cross-runtime-node-"));
      cleanups.push(() => rm(directory, { recursive: true, force: true }));
      const container = `lace-cross-runtime-${randomUUID()}`;
      const volume = options.operations ? `${container}-objects` : undefined;
      if (volume) {
        await exec("docker", ["volume", "create", volume]);
        cleanups.push(() => exec("docker", ["volume", "rm", volume]));
      }
      await exec("docker", [
        "run",
        "--detach",
        "--rm",
        "--name",
        container,
        ...(volume ? ["--mount", `type=volume,source=${volume},target=/data`] : []),
        "-p",
        "127.0.0.1::9000",
        "-e",
        "MINIO_ROOT_USER=lacecross-runtimelocal",
        "-e",
        "MINIO_ROOT_PASSWORD=lacecross-runtimelocalpassword",
        "quay.io/minio/minio:RELEASE.2025-02-07T23-21-09Z",
        "server",
        "/data",
      ]);
      cleanups.push(() => exec("docker", ["rm", "--force", container]));
      const { stdout } = await exec("docker", ["port", container, "9000"]);
      const endpoint = `http://${stdout.trim()}`;
      const client = new S3Client({
        endpoint,
        forcePathStyle: true,
        region: "us-east-1",
        credentials: {
          accessKeyId: "lacecross-runtimelocal",
          secretAccessKey: "lacecross-runtimelocalpassword",
        },
      });
      cleanups.push(() => client.destroy());
      let ready = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        try {
          await client.send(new CreateBucketCommand({ Bucket: "lace-cross-runtime" }));
          ready = true;
          break;
        } catch {
          await new Promise((done) => setTimeout(done, 100));
        }
      }
      if (!ready) throw new Error("Cross-runtime: local MinIO did not become ready");
      const databasePath = join(directory, "lace.sqlite");
      if (options.backup) {
        await cp(join(options.backup, "lace.sqlite"), databasePath);
        const objects = JSON.parse(await readFile(join(options.backup, "objects.json"), "utf8"));
        for (const [index, object] of objects.entries())
          await client.send(
            new PutObjectCommand({
              Bucket: "lace-cross-runtime",
              Key: object.key,
              ContentType: object.contentType,
              Body: await readFile(join(options.backup, `object-${index}`)),
            }),
          );
      } else migrateNodeDatabase(databasePath);
      const baseSettings = {
        LACE_DATABASE_PATH: databasePath,
        LACE_AUTH_SECRET: "cross-runtime-local-auth-secret-cross-runtime-long-enough",
        LACE_PUBLIC_BASE_URL: origin + "/",
        LACE_MINIO_ENDPOINT: endpoint,
        LACE_MINIO_BUCKET: "lace-cross-runtime",
        LACE_MINIO_ACCESS_KEY: "lacecross-runtimelocal",
        LACE_MINIO_SECRET_KEY: "lacecross-runtimelocalpassword",
        LACE_MINIO_REGION: "us-east-1",
        LACE_MINIO_TIMEOUT_MS: "10000",
        LACE_HOST: "127.0.0.1",
        LACE_PORT: "3000",
      };
      const compose = (authSecret = baseSettings.LACE_AUTH_SECRET) => {
        baseSettings.LACE_AUTH_SECRET = authSecret;
        return createNodeRuntime({
          config,
          adminAssets: admin,
          logger: options.logger ?? { log() {} },
          buildTrigger,
          settings: parseNodeRuntimeSettings({ ...baseSettings, LACE_AUTH_SECRET: authSecret }),
        });
      };
      runtime = compose(options.authSecret);
      rotateStorageCredentials = async () => {
        if (!volume) throw new Error("Persistent operations fixture required");
        maintenance = true;
        runtime.close();
        await exec("docker", ["rm", "--force", container]);
        await exec("docker", [
          "run",
          "--detach",
          "--rm",
          "--name",
          container,
          "--mount",
          `type=volume,source=${volume},target=/data`,
          "-p",
          `${new URL(endpoint).host}:9000`,
          "-e",
          "MINIO_ROOT_USER=laceoperationsreplacement",
          "-e",
          "MINIO_ROOT_PASSWORD=laceoperationsreplacementpassword",
          "quay.io/minio/minio:RELEASE.2025-02-07T23-21-09Z",
          "server",
          "/data",
        ]);
        const replacement = new S3Client({
          endpoint,
          forcePathStyle: true,
          region: "us-east-1",
          credentials: {
            accessKeyId: "laceoperationsreplacement",
            secretAccessKey: "laceoperationsreplacementpassword",
          },
        });
        cleanups.push(() => replacement.destroy());
        let ready = false;
        for (let attempt = 0; attempt < 100; attempt++) {
          try {
            await replacement.send(new ListObjectsV2Command({ Bucket: "lace-cross-runtime" }));
            ready = true;
            break;
          } catch {
            await new Promise((done) => setTimeout(done, 100));
          }
        }
        if (!ready) throw new Error("Replacement storage credentials did not become ready");
        let oldDenied = false;
        try {
          await client.send(new ListObjectsV2Command({ Bucket: "lace-cross-runtime" }));
        } catch (error) {
          oldDenied = error.$metadata?.httpStatusCode === 403;
        }
        baseSettings.LACE_MINIO_ACCESS_KEY = "laceoperationsreplacement";
        baseSettings.LACE_MINIO_SECRET_KEY = "laceoperationsreplacementpassword";
        runtime = compose();
        maintenance = false;
        return { oldDenied, newWorks: ready };
      };
      restart = async ({ authSecret } = {}) => {
        maintenance = true;
        runtime.close();
        runtime = compose(authSecret);
        maintenance = false;
      };
      backup = async (destination) => {
        maintenance = true;
        try {
          await mkdir(destination, { recursive: true, mode: 0o700 });
          await runtime.database.connection.backup(join(destination, "lace.sqlite"));
          const objects = [];
          let continuation;
          do {
            const page = await client.send(
              new ListObjectsV2Command({
                Bucket: "lace-cross-runtime",
                ContinuationToken: continuation,
              }),
            );
            for (const item of page.Contents ?? []) {
              const object = await client.send(
                new GetObjectCommand({ Bucket: "lace-cross-runtime", Key: item.Key }),
              );
              await writeFile(
                join(destination, `object-${objects.length}`),
                await object.Body.transformToByteArray(),
                { mode: 0o600 },
              );
              objects.push({ key: item.Key, contentType: object.ContentType });
            }
            continuation = page.IsTruncated ? page.NextContinuationToken : undefined;
          } while (continuation);
          await writeFile(join(destination, "objects.json"), JSON.stringify(objects), {
            mode: 0o600,
          });
          await captureMetadata(destination);
        } finally {
          maintenance = false;
        }
      };
      cleanups.push(() => runtime.close());
      request = (value) => runtime.app.fetch(value);
      expireSessions = async () => runtime.database.connection.prepare("delete from session").run();
      dispatch = async () => {
        runtime.database.connection.prepare("update outbox_events set available_at = 0").run();
        await runtime.buildDispatcher.runOnce();
      };
    } else {
      console.info("Cross-runtime worker fixture: start local bindings");
      const directory = options.operations
        ? await mkdtemp(join(tmpdir(), "lace-operations-worker-"))
        : undefined;
      if (directory) cleanups.push(() => rm(directory, { recursive: true, force: true }));
      const persistTo = directory ? join(directory, "persistence") : undefined;
      if (options.backup)
        await cp(join(options.backup, "persistence"), persistTo, { recursive: true });
      let local = await openLocalCloudflare({ persistTo, migrate: !options.backup });
      console.info("Cross-runtime worker fixture: bindings migrated");
      cleanups.push(() => local.dispose());
      const pending = new Set();
      const ctx = {
        waitUntil(promise) {
          pending.add(promise);
          promise.finally(() => pending.delete(promise));
        },
      };
      dispatchPending = async () => {
        await Promise.all(pending);
      };
      let worker = createCloudflareWorker({
        config,
        logger: options.logger ?? { log() {} },
        operationalLogger: options.operationalLogger ?? { error() {} },
        buildTrigger: () => buildTrigger,
        postCommitBuildDelayMs: 0,
      });
      let env = {
        DB: options.instrumentD1 ? options.instrumentD1(local.database) : local.database,
        MEDIA: local.bucket,
        LACE_ENVIRONMENT: "development",
        LACE_AUTH_SECRET: "cross-runtime-local-auth-secret-cross-runtime-long-enough",
        LACE_PUBLIC_BASE_URL: origin + "/",
        ASSETS: {
          fetch(value) {
            const url = new URL(value.url);
            url.pathname = "/admin" + url.pathname;
            return admin.fetch(new Request(url, value));
          },
        },
      };
      if (options.authSecret) env.LACE_AUTH_SECRET = options.authSecret;
      runtime = worker.runtime(env);
      const recompose = () => {
        worker = createCloudflareWorker({
          config,
          logger: options.logger ?? { log() {} },
          operationalLogger: options.operationalLogger ?? { error() {} },
          buildTrigger: () => buildTrigger,
          postCommitBuildDelayMs: 0,
        });
        env = { ...env, DB: local.database, MEDIA: local.bucket };
        runtime = worker.runtime(env);
      };
      restart = async ({ authSecret } = {}) => {
        maintenance = true;
        await dispatchPending();
        if (authSecret) env.LACE_AUTH_SECRET = authSecret;
        recompose();
        maintenance = false;
      };
      backup = async (destination) => {
        if (!persistTo) throw new Error("Persistent operations fixture required");
        maintenance = true;
        await dispatchPending();
        await local.dispose();
        try {
          await mkdir(destination, { recursive: true, mode: 0o700 });
          await cp(persistTo, join(destination, "persistence"), { recursive: true });
          await captureMetadata(destination);
        } finally {
          local = await openLocalCloudflare({ persistTo, migrate: false });
          recompose();
          maintenance = false;
        }
      };
      request = (value) => worker.fetch(value, env, ctx);
      expireSessions = async () => local.database.prepare("delete from session").run();
      dispatch = async () => {
        await Promise.all(pending);
        await local.database.prepare("update outbox_events set available_at = 0").run();
        await runtime.buildDispatcher.runOnce();
      };
      cleanups.push(async () => Promise.all(pending));
    }
    console.info(`Cross-runtime ${kind} fixture: synchronize models`);
    if (!options.backup) {
      const prepared = await prepareConfigurationSynchronization({
        models: config.runtime.content,
        state: runtime.repository,
      });
      let id = 0;
      await applyPreparedConfigurationSynchronization({
        clock: { now: () => 100 },
        ids: { next: () => `sync-${++id}` },
        models: config.runtime.content,
        prepared,
        target: runtime.repository,
      });
    }
    listener.on(
      "request",
      getRequestListener((value) =>
        maintenance ? Response.json({ status: "maintenance" }, { status: 503 }) : request(value),
      ),
    );
    const call = async (path, options = {}) => {
      const headers = new Headers(options.headers);
      // `origin: null` sends no Origin, like a command-line client.
      if (options.origin !== null) headers.set("origin", options.origin ?? origin);
      headers.set("cf-connecting-ip", "203.0.113.34");
      if (options.cookie) headers.set("cookie", options.cookie);
      if (options.json !== undefined) headers.set("content-type", "application/json");
      const response = await fetch(origin + path, {
        method: options.method ?? "GET",
        headers,
        body: options.json === undefined ? options.body : JSON.stringify(options.json),
      });
      return response;
    };
    console.info(`Cross-runtime ${kind} fixture: bootstrap and sign in`);
    if (!options.backup) {
      const token = await runtime.security.createSetupToken();
      const created = await call("/api/v1/setup/admin", {
        method: "POST",
        json: { email: "admin@cross-runtime.test", password, token: token.token },
      });
      if (created.status !== 201)
        throw new Error(`Cross-runtime ${kind}: setup status ${created.status}`);
    }
    const login = async (role) => {
      const response = await call("/api/auth/sign-in/email", {
        method: "POST",
        json: { email: `${role}@cross-runtime.test`, password },
      });
      if (response.status !== 200)
        throw new Error(`Cross-runtime ${kind}: ${role} sign-in status ${response.status}`);
      return response.headers
        .getSetCookie()
        .map((value) => value.split(";")[0])
        .join("; ");
    };
    const cookie = await login("admin");
    if (!options.backup)
      for (const role of ["editor", "viewer"]) {
        // Email is not configured here, so the invitation returns its accept link once.
        const invited = await call("/api/v1/admin/invitations", {
          method: "POST",
          cookie,
          json: { email: `${role}@cross-runtime.test`, role },
        });
        if (invited.status !== 201)
          throw new Error(`Cross-runtime ${kind}: invite ${role} status ${invited.status}`);
        const { link } = await invited.json();
        const accepted = await call("/api/v1/invitations/accept", {
          method: "POST",
          json: { password, token: link.split("#token=")[1] },
        });
        if (accepted.status !== 201)
          throw new Error(`Cross-runtime ${kind}: accept ${role} status ${accepted.status}`);
      }
    const cookies = { admin: cookie, editor: await login("editor"), viewer: await login("viewer") };
    return {
      kind,
      origin,
      get runtime() {
        return runtime;
      },
      backup,
      restart,
      rotateStorageCredentials,
      call,
      cookies,
      login,
      dispatch,
      expireSessions,
      close,
      settle: async () => {
        if (kind === "worker") await dispatchPending();
      },
    };
  } catch (error) {
    try {
      await close();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "Cross-runtime fixture setup and cleanup failed",
      );
    }
    throw error;
  }
}
