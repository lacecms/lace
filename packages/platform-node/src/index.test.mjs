import { expect, test } from "vitest";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { hashPassword } from "better-auth/crypto";
import sharp from "sharp";
import {
  listAppliedMigrations,
  migrateNodeDatabase,
  NodeInfrastructureUnavailableError,
  NodeMinioObjectStorage,
  NodeMediaDeletionDispatcher,
  NodeSiteBuildDispatcher,
  NodeSharpImageInspector,
  NodeObjectStorageError,
  NodeContentRepository,
  NodeFixedWindowRateLimiter,
  NodeSecurityService,
  NodePlaceholderObjectStorage,
  NodeSqliteReadiness,
  NoopNodeBuildTrigger,
  NoopNodeCache,
  nodePublicMediaUrl,
  openNodeDatabase,
  packageName,
  parseNodeRuntimeSettings,
  createNodeRuntime,
} from "../dist/index.js";
import { defineCollection, defineConfig, definePage } from "@lacecms/config";
import { createBetterAuthBoundary } from "@lacecms/auth";
import { betterAuthSchema } from "@lacecms/db";
import {
  actorId,
  blockKey,
  contentEntryId,
  contentModelKey,
  contentSnapshotId,
  createContentEntry,
  mediaId,
  unixMilliseconds,
} from "@lacecms/domain";
import { dispatcherEventId, dispatcherLeaseId } from "@lacecms/application";

const minioEnvironment = Object.freeze({
  LACE_MINIO_ACCESS_KEY: "test-access-key",
  LACE_MINIO_BUCKET: "lace-media",
  LACE_MINIO_ENDPOINT: "http://minio.test:9000",
  LACE_MINIO_REGION: "us-east-1",
  LACE_MINIO_SECRET_KEY: "test-secret-key",
  LACE_MINIO_TIMEOUT_MS: "1000",
});

test("exports its package identity", () => expect(packageName).toBe("@lacecms/platform-node"));

test.each([undefined, { engineVersion: "2.3.4-custom", openApiTitle: "Embedded" }])(
  "Node metadata identifies the platform release and preserves explicit overrides: %j",
  async (environment) => {
    const directory = await mkdtemp(join(tmpdir(), "lace-node-version-"));
    try {
      const settings = parseNodeRuntimeSettings({
        ...minioEnvironment,
        LACE_AUTH_SECRET: "test-auth-secret-that-is-long-enough-for-better-auth",
        LACE_DATABASE_PATH: join(directory, "db.sqlite"),
        LACE_PUBLIC_BASE_URL: "https://lace.test/",
      });
      const config = await defineConfig({ content: [] });
      const runtime = createNodeRuntime({ config, settings, environment });
      try {
        const response = await runtime.app.fetch(
          new Request("https://lace.test/api/v1/openapi.json"),
        );
        const manifest = JSON.parse(
          await readFile(new URL("../package.json", import.meta.url), "utf8"),
        );
        expect((await response.json()).info.version).toBe(
          environment?.engineVersion ?? manifest.version,
        );
      } finally {
        runtime.close();
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test("site-build dispatcher bounds failures at eight attempts and handles trigger outcomes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lace-build-dispatch-"));
  const databasePath = join(directory, "lace.sqlite");
  try {
    migrateNodeDatabase(databasePath);
    const database = openNodeDatabase(databasePath);
    try {
      const repository = new NodeContentRepository(database.connection, () => undefined);
      const requestedBy = { id: actorId("admin"), role: "admin" };
      let now = 1;
      let outcome = "failed";
      const calls = [];
      const dispatcher = new NodeSiteBuildDispatcher({
        clock: { now: () => unixMilliseconds(now) },
        logger: { error: () => undefined },
        random: () => 0,
        trigger: {
          trigger: async (input) => {
            calls.push(input);
            expect(
              database.connection
                .prepare("select status from site_builds where id = ?")
                .get(input.buildId),
            ).toEqual({ status: "running" });
            return outcome === "accepted"
              ? { status: "accepted", providerBuildId: "provider-1" }
              : outcome === "succeeded"
                ? { status: "succeeded" }
                : { status: "failed", reason: "secret=hidden" };
          },
        },
        work: repository,
      });
      const failed = await repository.requestBuild({
        requestedAt: unixMilliseconds(now),
        requestedBy,
      });
      now = 5_001;
      for (let attempt = 1; attempt <= 8; attempt += 1) {
        await dispatcher.runOnce();
        expect(
          database.connection
            .prepare("select attempts from outbox_events where id = ?")
            .get(failed.eventId),
        ).toEqual({ attempts: attempt });
      }
      expect(calls).toHaveLength(8);
      expect(
        database.connection
          .prepare("select status, error from site_builds where id = ?")
          .get(failed.eventId),
      ).toEqual({ status: "failed", error: "provider_failed" });
      await dispatcher.runOnce();
      expect(calls).toHaveLength(8);

      now = 10_000;
      outcome = "succeeded";
      const success = await repository.requestBuild({
        requestedAt: unixMilliseconds(now),
        requestedBy,
      });
      now += 5_000;
      await dispatcher.runOnce();
      expect(
        database.connection
          .prepare("select status, completed_at from site_builds where id = ?")
          .get(success.eventId),
      ).toEqual({ status: "succeeded", completed_at: now });

      now = 20_000;
      outcome = "accepted";
      const accepted = await repository.requestBuild({
        requestedAt: unixMilliseconds(now),
        requestedBy,
      });
      now += 5_000;
      await dispatcher.runOnce();
      expect(
        database.connection
          .prepare("select status, provider_build_id from site_builds where id = ?")
          .get(accepted.eventId),
      ).toEqual({ status: "accepted", provider_build_id: "provider-1" });

      now = 30_000;
      const thrown = await repository.requestBuild({
        requestedAt: unixMilliseconds(now),
        requestedBy,
      });
      const throwingDispatcher = new NodeSiteBuildDispatcher({
        clock: { now: () => unixMilliseconds(now) },
        logger: { error: () => undefined },
        random: () => 0,
        trigger: {
          trigger: async () => {
            throw new Error("secret build URL");
          },
        },
        work: repository,
      });
      now += 5_000;
      await throwingDispatcher.runOnce();
      expect(
        database.connection
          .prepare("select last_error from outbox_events where id = ?")
          .get(thrown.eventId),
      ).toEqual({ last_error: "trigger_unavailable" });

      database.connection
        .prepare("update outbox_events set processed_at = ? where id = ?")
        .run(now, thrown.eventId);
      database.connection
        .prepare(
          "insert into outbox_events (id, type, payload_json, available_at, created_at) values ('bad-build', 'site.build.requested', '{}', ?, ?)",
        )
        .run(now, now);
      await throwingDispatcher.runOnce();
      expect(
        database.connection
          .prepare("select last_error, processed_at from outbox_events where id = 'bad-build'")
          .get(),
      ).toEqual({ last_error: "invalid_build_event", processed_at: now });
    } finally {
      database.connection.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("dispatches media deletion with retry, terminal, and malformed-event boundaries", async () => {
  const completed = [];
  const failed = [];
  const deleted = [];
  let now = unixMilliseconds(1_000);
  const lease = (payload, attempts = 0) => ({
    event: {
      attempts,
      availableAt: now,
      id: dispatcherEventId(`event-${attempts}`),
      payload,
      type: "media.delete.requested",
    },
    expiresAt: unixMilliseconds(now + 60_000),
    id: dispatcherLeaseId(`lease-${attempts}`),
  });
  const work = {
    claim: async () => [lease({ mediaId: "media-1" })],
    complete: async (input) => completed.push(input),
    completeMediaDeletion: async (input) => completed.push(input),
    failMediaDeletion: async (input) => failed.push(input),
    loadDeletingMedia: async () => ({
      createdAt: now,
      createdBy: actorId("admin"),
      filename: "image.png",
      id: mediaId("media-1"),
      mimeType: "image/png",
      size: 1,
      status: "deleting",
      storageKey: "media/media-1",
      updatedAt: now,
    }),
    retry: async () => {},
  };
  const dispatcher = new NodeMediaDeletionDispatcher({
    clock: { now: () => now },
    logger: { error: () => {} },
    random: () => 0.5,
    storage: {
      createReadUrl: async () => "memory://object",
      delete: async (key) => deleted.push(key),
      get: async () => null,
      put: async () => ({ contentType: "image/png", key: "unused", size: 0 }),
    },
    work,
  });
  await dispatcher.runOnce();
  expect(deleted).toEqual(["media/media-1"]);
  expect(completed).toHaveLength(1);

  work.claim = async () => [lease({ mediaId: "media-1" }, 7)];
  dispatcher["options"].storage.delete = async () => {
    throw new Error("private storage detail");
  };
  await dispatcher.runOnce();
  expect(failed).toMatchObject([{ sanitizedError: "storage_unavailable", terminal: true }]);

  work.claim = async () => [lease({}, 0)];
  await dispatcher.runOnce();
  expect(completed).toHaveLength(2);
});

test("security service completes bootstrap once, protects its final admin, and revokes build tokens", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lace-security-"));
  const databasePath = join(directory, "lace.sqlite");
  try {
    migrateNodeDatabase(databasePath);
    const database = openNodeDatabase(databasePath);
    const now = 1_800_000_000_000;
    const security = new NodeSecurityService(database.connection, () => unixMilliseconds(now));
    const setup = await security.createSetupToken();
    const first = await security.bootstrap({
      email: "admin@lace.test",
      password: "correct horse battery staple",
      token: setup.token,
    });
    await expect(
      security.bootstrap({
        email: "other@lace.test",
        password: "correct horse battery staple",
        token: setup.token,
      }),
    ).rejects.toThrow();
    await expect(security.disableUser({ userId: first.user.id })).rejects.toMatchObject({
      code: "LAST_ADMIN_PROTECTED",
    });
    const build = await security.createBuildToken({ name: "builder", now: unixMilliseconds(now) });
    await expect(
      security.verifyBuildToken({ now: unixMilliseconds(now), token: build.token }),
    ).resolves.toBe(true);
    await security.revokeBuildToken({ now: unixMilliseconds(now + 1), tokenId: build.id });
    await expect(
      security.verifyBuildToken({ now: unixMilliseconds(now + 2), token: build.token }),
    ).resolves.toBe(false);
    expect(
      database.connection.prepare("select token_hash from api_tokens").get(),
    ).not.toMatchObject({ token_hash: build.token });
    database.connection.close();
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("fixed-window buckets retain only HMAC identities and return a retry duration", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lace-limiter-"));
  const databasePath = join(directory, "lace.sqlite");
  try {
    migrateNodeDatabase(databasePath);
    const database = openNodeDatabase(databasePath);
    const limiter = new NodeFixedWindowRateLimiter(database.connection, "limiter-secret");
    for (let value = 0; value < 5; value += 1)
      await expect(
        limiter.check({
          now: unixMilliseconds(1_800_000_000_000),
          operation: "setup",
          subject: "raw@example.test",
        }),
      ).resolves.toMatchObject({ allowed: true });
    await expect(
      limiter.check({
        now: unixMilliseconds(1_800_000_000_000),
        operation: "setup",
        subject: "raw@example.test",
      }),
    ).resolves.toMatchObject({ allowed: false, retryAfterSeconds: 3600 });
    expect(
      database.connection.prepare("select bucket_key from rate_limit_buckets").get(),
    ).not.toMatchObject({ bucket_key: "raw@example.test" });
    database.connection.close();
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("validates named Node settings without disclosing supplied values", () => {
  const secret = "https://user:opaque-secret@invalid.test/path?token=opaque-secret";
  expect(() =>
    parseNodeRuntimeSettings({
      ...minioEnvironment,
      LACE_DATABASE_PATH: "",
      LACE_AUTH_SECRET: "test-auth-secret-that-is-long-enough-for-better-auth",
      LACE_PUBLIC_BASE_URL: secret,
      LACE_PORT: "not-a-port",
    }),
  ).toThrow("Invalid Node environment: LACE_DATABASE_PATH, LACE_PUBLIC_BASE_URL, LACE_PORT.");
  try {
    parseNodeRuntimeSettings({
      ...minioEnvironment,
      LACE_AUTH_SECRET: "test-auth-secret-that-is-long-enough-for-better-auth",
      LACE_DATABASE_PATH: "",
      LACE_PUBLIC_BASE_URL: secret,
    });
  } catch (error) {
    expect(String(error)).not.toContain("opaque-secret");
  }
  expect(
    parseNodeRuntimeSettings({
      ...minioEnvironment,
      LACE_ADMIN_DEV_ORIGIN: "http://127.0.0.1:5173",
      LACE_AUTH_SECRET: "test-auth-secret-that-is-long-enough-for-better-auth",
      LACE_DATABASE_PATH: "/tmp/lace.sqlite",
      LACE_PUBLIC_BASE_URL: "https://lace.test/base/",
      LACE_SITE_DEV_ORIGIN: "http://127.0.0.1:4321",
    }),
  ).toMatchObject({
    host: "127.0.0.1",
    port: 3000,
    publicBaseUrl: new URL("https://lace.test/base/"),
  });
  try {
    parseNodeRuntimeSettings({
      ...minioEnvironment,
      LACE_AUTH_SECRET: "test-auth-secret-that-is-long-enough-for-better-auth",
      LACE_DATABASE_PATH: "/tmp/lace.sqlite",
      LACE_MINIO_ENDPOINT: "https://user:opaque-minio-secret@minio.test/",
      LACE_PUBLIC_BASE_URL: "https://lace.test/",
    });
  } catch (error) {
    expect(String(error)).toContain("LACE_MINIO_ENDPOINT");
    expect(String(error)).not.toContain("opaque-minio-secret");
  }
});

test("uses configured public URLs and fails closed for placeholder infrastructure", async () => {
  const settings = parseNodeRuntimeSettings({
    ...minioEnvironment,
    LACE_DATABASE_PATH: "/tmp/lace.sqlite",
    LACE_AUTH_SECRET: "test-auth-secret-that-is-long-enough-for-better-auth",
    LACE_PUBLIC_BASE_URL: "https://lace.test/base/",
  });
  expect(nodePublicMediaUrl(settings, "media/one")).toBe(
    "https://lace.test/base/api/v1/public/media/media%2Fone",
  );
  const storage = new NodePlaceholderObjectStorage(settings.publicBaseUrl);
  await expect(storage.createReadUrl("media/one")).resolves.toBe(
    "https://lace.test/base/api/v1/public/media/media%2Fone",
  );
  await expect(storage.get("media/one")).rejects.toBeInstanceOf(NodeInfrastructureUnavailableError);
  const cache = new NoopNodeCache();
  await cache.set("derived", { value: 1 });
  await expect(cache.get("derived")).resolves.toBeNull();
  await expect(new NoopNodeBuildTrigger().trigger({})).resolves.toEqual({
    status: "failed",
    reason: "trigger_unavailable",
  });
});

test("MinIO storage streams objects, distinguishes missing keys, and sanitizes failures", async () => {
  const commands = [];
  const client = {
    send: async (command, options) => {
      commands.push({ command, options });
      if (command.constructor.name === "GetObjectCommand") {
        return { Body: Readable.from([Buffer.from("media-bytes")]) };
      }
      if (command.constructor.name === "PutObjectCommand") {
        expect(command.input.Body).toEqual(Buffer.from([1, 2, 3]));
        expect(command.input.ContentLength).toBe(3);
      }
      return {};
    },
  };
  const storage = new NodeMinioObjectStorage(
    {
      accessKeyId: "test-access-key",
      bucket: "lace-media",
      endpoint: new URL("http://minio.test:9000"),
      publicBaseUrl: new URL("https://lace.test/base/"),
      region: "us-east-1",
      secretAccessKey: "test-secret-key",
      timeoutMs: 100,
    },
    client,
  );
  await storage.assertReady();
  const stored = await storage.put({
    body: {
      async *[Symbol.asyncIterator]() {
        yield new Uint8Array([1, 2]);
        yield new Uint8Array([3]);
      },
    },
    contentType: "image/png",
    key: "media/example",
  });
  expect(stored).toEqual({ contentType: "image/png", key: "media/example", size: 3 });
  expect(await storage.createReadUrl("media/example")).toBe(
    "https://lace.test/base/api/v1/public/media/example",
  );
  await expect(
    (async () => {
      const output = await storage.get("media/example");
      return output === null ? undefined : Buffer.concat(await Array.fromAsync(output));
    })(),
  ).resolves.toEqual(Buffer.from("media-bytes"));
  await storage.delete("media/example");
  expect(commands.map(({ command }) => command.constructor.name)).toEqual([
    "HeadBucketCommand",
    "PutObjectCommand",
    "GetObjectCommand",
    "DeleteObjectCommand",
  ]);
  expect(commands.every(({ options }) => options.abortSignal instanceof AbortSignal)).toBe(true);

  const missing = new NodeMinioObjectStorage(
    {
      accessKeyId: "test-access-key",
      bucket: "lace-media",
      endpoint: new URL("http://minio.test:9000"),
      publicBaseUrl: new URL("https://lace.test/"),
      region: "us-east-1",
      secretAccessKey: "test-secret-key",
      timeoutMs: 100,
    },
    { send: async () => Promise.reject({ name: "NoSuchKey" }) },
  );
  await expect(missing.get("missing")).resolves.toBeNull();
  const unavailable = new NodeMinioObjectStorage(
    {
      accessKeyId: "test-access-key",
      bucket: "lace-media",
      endpoint: new URL("http://minio.test:9000"),
      publicBaseUrl: new URL("https://lace.test/"),
      region: "us-east-1",
      secretAccessKey: "test-secret-key",
      timeoutMs: 100,
    },
    { send: async () => Promise.reject(new Error("opaque infrastructure detail")) },
  );
  await expect(unavailable.assertReady()).rejects.toBeInstanceOf(NodeObjectStorageError);
});

test("reports cheap SQLite readiness failures after the connection closes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lace-readiness-"));
  const databasePath = join(directory, "lace.sqlite");
  try {
    migrateNodeDatabase(databasePath);
    const database = openNodeDatabase(databasePath);
    const readiness = new NodeSqliteReadiness(database.connection);
    await expect(readiness.isReady()).resolves.toBe(true);
    database.connection.close();
    await expect(readiness.isReady()).resolves.toBe(false);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("unmigrated SQLite is not ready until the explicit migration command runs", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lace-readiness-pending-"));
  const databasePath = join(directory, "lace.sqlite");
  try {
    let database = openNodeDatabase(databasePath);
    await expect(new NodeSqliteReadiness(database.connection).isReady()).resolves.toBe(false);
    database.connection.close();
    migrateNodeDatabase(databasePath);
    database = openNodeDatabase(databasePath);
    await expect(new NodeSqliteReadiness(database.connection).isReady()).resolves.toBe(true);
    database.connection.close();
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("Node API does not migrate an outdated database on startup", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lace-startup-pending-"));
  const databasePath = join(directory, "lace.sqlite");
  const settings = parseNodeRuntimeSettings({
    ...minioEnvironment,
    LACE_AUTH_SECRET: "test-auth-secret-that-is-long-enough-for-better-auth",
    LACE_DATABASE_PATH: databasePath,
    LACE_PUBLIC_BASE_URL: "https://lace.test/",
  });
  const config = await defineConfig({
    content: [definePage({ key: "home", path: "/", version: 1 })],
  });
  try {
    const runtime = createNodeRuntime({ config, settings });
    try {
      await expect(runtime.readiness.isReady()).resolves.toBe(false);
      const tables = runtime.database.connection
        .prepare("select name from sqlite_master where type = 'table'")
        .all();
      expect(tables.some((row) => row.name === "__drizzle_migrations")).toBe(false);
    } finally {
      runtime.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Node composition maps a Better Auth session into a protected actor", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lace-node-auth-"));
  const databasePath = join(directory, "lace.sqlite");
  try {
    migrateNodeDatabase(databasePath);
    const settings = parseNodeRuntimeSettings({
      ...minioEnvironment,
      LACE_AUTH_SECRET: "test-auth-secret-that-is-long-enough-for-better-auth",
      LACE_DATABASE_PATH: databasePath,
      LACE_PUBLIC_BASE_URL: "https://lace.test/",
    });
    const config = await defineConfig({
      content: [
        definePage({ key: "home", path: "/", version: 1 }),
        defineCollection({ key: "posts", route: "/blog/:slug", version: 1 }),
      ],
    });
    const runtime = createNodeRuntime({ config, settings });
    const now = Date.now();
    runtime.database.connection
      .prepare(
        "insert into user (id, name, email, email_verified, role, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?)",
      )
      .run("node-auth-user", "Node Auth", "node-auth@lace.test", 1, "viewer", now, now);
    runtime.database.connection
      .prepare(
        "insert into account (id, account_id, provider_id, user_id, password, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        "node-auth-account",
        "node-auth-user",
        "credential",
        "node-auth-user",
        await hashPassword("correct horse battery staple"),
        now,
        now,
      );
    const signIn = await runtime.app.fetch(
      new Request("https://lace.test/api/auth/sign-in/email", {
        body: JSON.stringify({
          email: "node-auth@lace.test",
          password: "correct horse battery staple",
        }),
        headers: { "content-type": "application/json", origin: "https://lace.test" },
        method: "POST",
      }),
    );
    expect(signIn.status).toBe(200);
    const cookie = signIn.headers.getSetCookie()[0].split(";")[0];
    expect(
      (
        await runtime.app.fetch(
          new Request("https://lace.test/api/v1/admin/content-models", { headers: { cookie } }),
        )
      ).status,
    ).toBe(200);
    for (let attempt = 0; attempt < 15; attempt += 1) {
      expect(
        (
          await runtime.app.fetch(
            new Request("https://lace.test/api/auth/get-session", { headers: { cookie } }),
          )
        ).status,
      ).toBe(200);
    }
    for (let attempt = 0; attempt < 35; attempt += 1) {
      expect(
        (
          await runtime.app.fetch(
            new Request("https://lace.test/api/v1/admin/media", { headers: { cookie } }),
          )
        ).status,
      ).toBe(200);
    }
    expect(
      (
        await runtime.app.fetch(
          new Request("https://lace.test/api/auth/sign-in/email", {
            body: JSON.stringify({
              email: "node-auth@lace.test",
              password: "correct horse battery staple",
            }),
            headers: { "content-type": "application/json", origin: "https://lace.test" },
            method: "POST",
          }),
        )
      ).status,
    ).toBe(200);
    runtime.close();
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("Better Auth rejects public enrollment and applies same-origin session policy", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lace-auth-policy-"));
  const databasePath = join(directory, "lace.sqlite");
  try {
    migrateNodeDatabase(databasePath);
    const database = openNodeDatabase(databasePath);
    const boundary = createBetterAuthBoundary({
      database: database.drizzle,
      origin: new URL("https://lace.test/"),
      production: true,
      schema: betterAuthSchema,
      secret: "test-auth-secret-that-is-long-enough-for-better-auth",
    });
    const signUp = await boundary.fetch(
      new Request("https://lace.test/api/auth/sign-up/email", {
        body: JSON.stringify({
          email: "new@lace.test",
          name: "New",
          password: "correct horse battery staple",
        }),
        headers: { "content-type": "application/json", origin: "https://lace.test" },
        method: "POST",
      }),
    );
    expect(signUp.status).toBeGreaterThanOrEqual(400);
    expect(database.connection.prepare("select count(*) as count from user").get()).toEqual({
      count: 0,
    });
    const now = Date.now();
    database.connection
      .prepare(
        "insert into user (id, name, email, email_verified, created_at, updated_at) values (?, ?, ?, ?, ?, ?)",
      )
      .run("auth-user", "Auth User", "auth@lace.test", 1, now, now);
    expect(
      database.connection.prepare("select role from user where id = ?").get("auth-user"),
    ).toEqual({
      role: "viewer",
    });
    expect(() =>
      database.connection
        .prepare(
          "insert into user (id, name, email, email_verified, role, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?)",
        )
        .run("bad-role", "Bad", "bad@lace.test", 0, "owner", now, now),
    ).toThrow();
    database.connection
      .prepare(
        "insert into account (id, account_id, provider_id, user_id, password, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        "auth-account",
        "auth-user",
        "credential",
        "auth-user",
        await hashPassword("correct horse battery staple"),
        now,
        now,
      );
    const crossOrigin = await boundary.fetch(
      new Request("https://lace.test/api/auth/sign-in/email", {
        body: JSON.stringify({ email: "auth@lace.test", password: "correct horse battery staple" }),
        headers: { "content-type": "application/json", origin: "https://attacker.test" },
        method: "POST",
      }),
    );
    expect(crossOrigin.status).toBeGreaterThanOrEqual(400);
    const signIn = await boundary.fetch(
      new Request("https://lace.test/api/auth/sign-in/email", {
        body: JSON.stringify({ email: "auth@lace.test", password: "correct horse battery staple" }),
        headers: { "content-type": "application/json", origin: "https://lace.test" },
        method: "POST",
      }),
    );
    const cookie = signIn.headers.getSetCookie()[0].split(";")[0];
    expect(signIn.status).toBe(200);
    expect(signIn.headers.get("set-cookie")).toContain("Secure");
    const localBoundary = createBetterAuthBoundary({
      database: database.drizzle,
      origin: new URL("http://127.0.0.1:3000/"),
      production: false,
      schema: betterAuthSchema,
      secret: "test-auth-secret-that-is-long-enough-for-better-auth",
    });
    const localSignIn = await localBoundary.fetch(
      new Request("http://localhost:3000/api/auth/sign-in/email", {
        body: JSON.stringify({ email: "auth@lace.test", password: "correct horse battery staple" }),
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
        method: "POST",
      }),
    );
    expect(localSignIn.status).toBe(200);
    expect(localSignIn.headers.get("set-cookie")).toContain("better-auth.session_token");
    const localCookie = localSignIn.headers.getSetCookie()[0].split(";")[0];
    await expect(
      localBoundary.actors.resolve(
        new Request("http://localhost:3000/api/v1/admin/content-models", {
          headers: { cookie: localCookie },
        }),
      ),
    ).resolves.toMatchObject({ id: "auth-user", role: "viewer" });
    const reverseLocalBoundary = createBetterAuthBoundary({
      database: database.drizzle,
      origin: new URL("http://localhost:3000/"),
      production: false,
      schema: betterAuthSchema,
      secret: "test-auth-secret-that-is-long-enough-for-better-auth",
    });
    expect(
      (
        await reverseLocalBoundary.fetch(
          new Request("http://127.0.0.1:3000/api/auth/sign-in/email", {
            body: JSON.stringify({
              email: "auth@lace.test",
              password: "correct horse battery staple",
            }),
            headers: { "content-type": "application/json", origin: "http://127.0.0.1:3000" },
            method: "POST",
          }),
        )
      ).status,
    ).toBe(200);
    const productionLoopback = createBetterAuthBoundary({
      database: database.drizzle,
      origin: new URL("http://127.0.0.1:3000/"),
      production: true,
      schema: betterAuthSchema,
      secret: "test-auth-secret-that-is-long-enough-for-better-auth",
    });
    expect(
      (
        await productionLoopback.fetch(
          new Request("http://localhost:3000/api/auth/sign-in/email", {
            body: JSON.stringify({
              email: "auth@lace.test",
              password: "correct horse battery staple",
            }),
            headers: { "content-type": "application/json", origin: "http://localhost:3000" },
            method: "POST",
          }),
        )
      ).status,
    ).toBe(403);
    const foreignSignIn = await localBoundary.fetch(
      new Request("http://localhost:3000/api/auth/sign-in/email", {
        body: JSON.stringify({ email: "auth@lace.test", password: "correct horse battery staple" }),
        headers: { "content-type": "application/json", origin: "http://attacker.test:3000" },
        method: "POST",
      }),
    );
    expect(foreignSignIn.status).toBe(403);
    const wrongPortSignIn = await localBoundary.fetch(
      new Request("http://localhost:3000/api/auth/sign-in/email", {
        body: JSON.stringify({ email: "auth@lace.test", password: "correct horse battery staple" }),
        headers: { "content-type": "application/json", origin: "http://localhost:3001" },
        method: "POST",
      }),
    );
    expect(wrongPortSignIn.status).toBe(403);
    await expect(
      boundary.actors.resolve(
        new Request("https://lace.test/api/v1/admin/content-models", { headers: { cookie } }),
      ),
    ).resolves.toEqual({ id: "auth-user", role: "viewer" });
    database.connection.prepare("update session set expires_at = ?").run(Date.now() - 1);
    await expect(
      boundary.actors.resolve(
        new Request("https://lace.test/api/v1/admin/content-models", { headers: { cookie } }),
      ),
    ).resolves.toBeNull();
    database.connection.close();
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("migrates an empty file, reopens with SQLite invariants, and enforces constraints", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lace-schema-"));
  const databasePath = join(directory, "lace.sqlite");
  try {
    expect(migrateNodeDatabase(databasePath)).toHaveLength(4);
    const database = openNodeDatabase(databasePath);
    try {
      expect(database.connection.pragma("foreign_keys", { simple: true })).toBe(1);
      expect(database.connection.pragma("journal_mode", { simple: true })).toBe("wal");
      expect(listAppliedMigrations(database.connection)).toHaveLength(4);

      const tableNames = database.connection
        .prepare("select name from sqlite_master where type = 'table'")
        .all()
        .map(({ name }) => name);
      expect(tableNames).toEqual(
        expect.arrayContaining([
          "content_models",
          "content_entries",
          "content_snapshots",
          "outbox_events",
          "installation_state",
          "mutation_guards",
          "user",
        ]),
      );
      expect(() =>
        database.connection
          .prepare("insert into mutation_guards (token, created_at) values (null, 1)")
          .run(),
      ).toThrow();
      const indexNames = database.connection
        .prepare("select name from sqlite_master where type = 'index'")
        .all()
        .map(({ name }) => name);
      expect(indexNames).toEqual(
        expect.arrayContaining([
          "content_entries_singleton_idx",
          "content_entries_list_idx",
          "content_blocks_snapshot_position_idx",
          "content_media_references_media_idx",
          "outbox_events_available_idx",
          "site_builds_history_idx",
        ]),
      );
      const queryPlan = (sql, ...bindings) =>
        database.connection.prepare(`explain query plan ${sql}`).all(...bindings);
      expect(
        queryPlan("select * from content_blocks where snapshot_id = ? order by position", "x"),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            detail: expect.stringContaining("content_blocks_snapshot_position_idx"),
          }),
        ]),
      );
      expect(queryPlan("select * from content_media_references where media_id = ?", "x")).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            detail: expect.stringContaining("content_media_references_media_idx"),
          }),
        ]),
      );
      expect(
        queryPlan(
          "select * from content_entries where model_key = ? order by updated_at desc, id desc",
          "home",
        ),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ detail: expect.stringContaining("content_entries_list_idx") }),
        ]),
      );
      expect(
        queryPlan(
          "select * from outbox_events where processed_at is null and locked_at is null and available_at <= ?",
          1,
        ),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            detail: expect.stringContaining("outbox_events_available_idx"),
          }),
        ]),
      );

      const insertModel = database.connection.prepare(
        "insert into content_models values (?, ?, ?, ?, ?, ?, ?, ?)",
      );
      insertModel.run("home", "page", "Home", 1, "structure", "projection", 1, 1);
      expect(() =>
        insertModel.run("invalid", "unsupported", "Invalid", 1, "structure", "projection", 1, 1),
      ).toThrow();
      const insertEntry = database.connection.prepare(
        "insert into content_entries (id, model_key, singleton_key, created_by, created_at, updated_at) values (?, ?, ?, ?, ?, ?)",
      );
      insertEntry.run("home-1", "home", 1, "admin", 1, 1);
      expect(() => insertEntry.run("home-2", "home", 1, "admin", 1, 1)).toThrow();
      expect(() =>
        database.connection
          .prepare("insert into content_blocks values (?, ?, ?, ?, ?, ?, ?, ?)")
          .run("missing", "block", "hero", 1000, 1, "{}", 1, 1),
      ).toThrow();

      expect(() =>
        database.connection
          .prepare(
            "insert into media (id, storage_key, filename, mime_type, size, metadata_json, status, created_by, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          )
          .run(
            "invalid-media",
            "object-invalid",
            "image.png",
            "image/png",
            1,
            "{}",
            "missing",
            "admin",
            1,
            1,
          ),
      ).toThrow();
      expect(() =>
        database.connection.prepare("insert into published_state values (?, ?, ?)").run(2, 0, 1),
      ).toThrow();
      expect(() =>
        database.connection
          .prepare(
            "insert into site_builds (id, reason, status, target_version, requested_by, requested_at) values (?, ?, ?, ?, ?, ?)",
          )
          .run("invalid-build", "manual", "deployed", 0, "admin", 1),
      ).toThrow();

      insertModel.run("posts", "collection", "Posts", 1, "structure", "projection", 1, 1);
      insertEntry.run("post-1", "posts", null, "admin", 1, 1);
      insertEntry.run("post-2", "posts", null, "admin", 1, 1);
      const insertSnapshot = database.connection.prepare(
        "insert into content_snapshots values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      );
      insertSnapshot.run("post-1-draft", "post-1", 1, null, "First", "{}", 1, 1, 1, "admin");
      insertSnapshot.run("post-2-draft", "post-2", 1, null, "Second", "{}", 1, 1, 1, "admin");
      database.connection
        .prepare("update content_entries set draft_snapshot_id = ? where id = ?")
        .run("post-1-draft", "post-1");
      database.connection
        .prepare("insert into published_routes values (?, ?, ?, ?)")
        .run("/posts/first", "post-1", "post-1-draft", 1);
      expect(() =>
        database.connection
          .prepare("insert into published_routes values (?, ?, ?, ?)")
          .run("/posts/first", "post-2", "post-2-draft", 1),
      ).toThrow();
      const insertIdempotency = database.connection.prepare(
        "insert into idempotency_records values (?, ?, ?, ?, ?, ?)",
      );
      insertIdempotency.run("publication:post-1", "request-1", "hash", "{}", 1, 2);
      expect(() =>
        insertIdempotency.run("publication:post-1", "request-1", "different", "{}", 1, 2),
      ).toThrow();

      database.connection
        .prepare(
          "insert into media (id, storage_key, filename, mime_type, size, metadata_json, status, created_by, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run("media-1", "object-1", "image.png", "image/png", 1, "{}", "active", "admin", 1, 1);
      database.connection
        .prepare("insert into content_media_references values (?, ?, ?, ?, ?)")
        .run("post-1-draft", "$fields", "image", "media-1", 1);
      expect(() =>
        database.connection.prepare("delete from media where id = ?").run("media-1"),
      ).toThrow();

      database.connection
        .prepare("update content_models set key = ? where key = ?")
        .run("articles", "posts");
      expect(
        database.connection
          .prepare("select model_key from content_entries where id = ?")
          .get("post-1"),
      ).toEqual({ model_key: "articles" });
      expect(() =>
        database.connection.prepare("delete from content_models where key = ?").run("articles"),
      ).toThrow();

      database.connection.prepare("delete from content_snapshots where id = ?").run("post-1-draft");
      expect(
        database.connection
          .prepare("select draft_snapshot_id from content_entries where id = ?")
          .get("post-1"),
      ).toEqual({ draft_snapshot_id: null });
      expect(
        database.connection.prepare("select count(*) as count from content_media_references").get(),
      ).toEqual({ count: 0 });
      database.connection.prepare("delete from media where id = ?").run("media-1");

      database.connection
        .prepare("insert into content_blocks values (?, ?, ?, ?, ?, ?, ?, ?)")
        .run("post-2-draft", "block-1", "hero", 1000, 1, "{}", 1, 1);
      database.connection.prepare("delete from content_entries where id = ?").run("post-2");
      expect(
        database.connection.prepare("select count(*) as count from content_blocks").get(),
      ).toEqual({
        count: 0,
      });
    } finally {
      database.connection.close();
    }

    const migrationFile = (await readdir(new URL("../../db/drizzle", import.meta.url))).find(
      (file) => file.endsWith(".sql"),
    );
    expect(migrationFile).toBeDefined();
    const migrationSql = await readFile(
      new URL(`../../db/drizzle/${migrationFile}`, import.meta.url),
      "utf8",
    );
    expect(migrationSql).not.toContain("journal_mode");
    expect(migrationSql).not.toContain("foreign_keys = ON");
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

const editor = { id: actorId("editor"), role: "editor" };
const routes = new Map([
  ["posts", { key: contentModelKey("posts"), kind: "collection", route: "/blog/:slug" }],
  ["home", { key: contentModelKey("home"), kind: "page", path: "/" }],
]);

function draftEntry(id, modelKey, updatedAt, title = id) {
  const entryId = contentEntryId(id);
  return createContentEntry({
    id: entryId,
    model: routes.get(modelKey),
    draft: {
      blocks: [
        {
          data: { image: "media-1", title },
          key: blockKey(`${id}-block`),
          position: 1000,
          schemaVersion: 1,
          type: "hero",
        },
      ],
      createdAt: unixMilliseconds(updatedAt),
      entryId,
      fields: { image: "media-1", title },
      id: contentSnapshotId(`${id}-draft`),
      revision: 1,
      slug: id,
      state: "draft",
      title,
      updatedAt: unixMilliseconds(updatedAt),
      updatedBy: editor,
    },
  });
}

function references(blockKeyValue) {
  return [
    { fieldPath: "image", mediaId: mediaId("media-1"), sourceKey: "$fields" },
    { fieldPath: "image", mediaId: mediaId("media-1"), sourceKey: blockKey(blockKeyValue) },
  ];
}

test("bounds Node build-export queries and selects the entry-list index", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lace-node-plans-"));
  const databasePath = join(directory, "lace.sqlite");
  try {
    migrateNodeDatabase(databasePath);
    const database = openNodeDatabase(databasePath);
    try {
      database.connection
        .prepare("insert into content_models values (?, ?, ?, ?, ?, ?, ?, ?)")
        .run("posts", "collection", "Posts", 1, "structure", "projection", 1, 1);
      database.connection
        .prepare(
          "insert into media (id, storage_key, filename, mime_type, size, metadata_json, status, created_by, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run("media-1", "object-1", "image.png", "image/png", 1, "{}", "active", "editor", 1, 1);
      const repository = new NodeContentRepository(database.connection, (key) => routes.get(key));
      for (const [id, at] of [
        ["post-a", 20],
        ["post-b", 21],
      ]) {
        await repository.create({
          entry: draftEntry(id, "posts", at),
          mediaReferences: references(`${id}-block`),
        });
        await repository.publish({
          entryId: contentEntryId(id),
          expectedRevision: 1,
          publishedAt: unixMilliseconds(at + 10),
          publishedBy: editor,
          publishedSnapshotId: contentSnapshotId(`${id}-published`),
        });
      }
      const prepare = database.connection.prepare.bind(database.connection);
      const statements = [];
      database.connection.prepare = (sql) => {
        statements.push(sql);
        return prepare(sql);
      };
      expect(await repository.exportBuildContent()).toMatchObject({
        entries: [{ path: "/blog/post-a" }, { path: "/blog/post-b" }],
        version: 2,
      });
      expect(statements.length).toBeLessThanOrEqual(4);
      statements.length = 0;
      await repository.list({
        limit: 100,
        listFields: [],
        modelKey: contentModelKey("posts"),
        sort: "-updatedAt",
      });
      database.connection.prepare = prepare;
      const listStatement = statements.find((sql) => sql.includes("sort_value"));
      expect(
        database.connection.prepare(`explain query plan ${listStatement}`).all("posts", 101),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ detail: expect.stringContaining("content_entries_list_idx") }),
        ]),
      );
    } finally {
      database.connection.close();
    }
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("reports orientation-applied display dimensions from the sharp inspector", async () => {
  const inspector = new NodeSharpImageInspector();
  const rotated = await sharp({
    create: { background: { b: 3, g: 2, r: 1 }, channels: 3, height: 200, width: 400 },
  })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();
  await expect(inspector.inspect(new Uint8Array(rotated), "image/jpeg")).resolves.toEqual({
    height: 400,
    width: 200,
  });
  const upright = await sharp({
    create: { background: { b: 3, g: 2, r: 1 }, channels: 3, height: 2, width: 3 },
  })
    .png()
    .toBuffer();
  await expect(inspector.inspect(new Uint8Array(upright), "image/png")).resolves.toEqual({
    height: 2,
    width: 3,
  });
  await expect(inspector.inspect(new Uint8Array(upright), "image/jpeg")).rejects.toMatchObject({
    code: "CONTENT_INVALID_STATE",
  });
});

test("Node loads explicit current build-site identity without private paths", () => {
  const env = {
    ...minioEnvironment,
    LACE_DATABASE_PATH: ":memory:",
    LACE_AUTH_SECRET: "test-auth-secret-that-is-long-enough",
    LACE_PUBLIC_BASE_URL: "https://lace.test/",
  };
  expect(parseNodeRuntimeSettings(env).buildSite).toBe(null);
  expect(
    parseNodeRuntimeSettings({
      ...env,
      LACE_BUILD_SITE_ID: "real-site",
      LACE_BUILD_SITE_LABEL: "Real site",
    }).buildSite,
  ).toEqual({ id: "real-site", label: "Real site" });
  expect(() =>
    parseNodeRuntimeSettings({
      ...env,
      LACE_BUILD_SITE_ID: "real-site",
      LACE_BUILD_SITE_LABEL: "/private/secret",
    }),
  ).toThrow("Invalid build site configuration: LACE_BUILD_SITE_ID, LACE_BUILD_SITE_LABEL.");
});

test.each([null, { id: "real-site", label: "Real site" }])(
  "Node composition serves current identity %j",
  async (site) => {
    const directory = await mkdtemp(join(tmpdir(), "lace-node-build-site-"));
    const databasePath = join(directory, "lace.sqlite");
    try {
      migrateNodeDatabase(databasePath);
      const settings = parseNodeRuntimeSettings({
        ...minioEnvironment,
        LACE_DATABASE_PATH: databasePath,
        LACE_AUTH_SECRET: "test-auth-secret-that-is-long-enough",
        LACE_PUBLIC_BASE_URL: "https://lace.test/",
        ...(site ? { LACE_BUILD_SITE_ID: site.id, LACE_BUILD_SITE_LABEL: site.label } : {}),
      });
      const config = await defineConfig({
        content: [definePage({ key: "home", path: "/", version: 1 })],
      });
      const runtime = createNodeRuntime({
        config,
        settings,
        actors: {
          resolve: async () => ({ id: actorId("reader"), role: "viewer" }),
        },
      });
      try {
        const response = await runtime.app.request("https://lace.test/api/v1/admin/build-site");
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ site });
      } finally {
        runtime.close();
      }
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  },
);

test("accepts an empty generated proxy setting and rejects empty list members", () => {
  const environment = {
    ...minioEnvironment,
    LACE_DATABASE_PATH: "/tmp/lace.sqlite",
    LACE_AUTH_SECRET: "test-auth-secret-that-is-long-enough-for-better-auth",
    LACE_PUBLIC_BASE_URL: "https://lace.test/",
  };
  for (const value of [undefined, "", "   "])
    expect(
      parseNodeRuntimeSettings({ ...environment, LACE_TRUSTED_PROXY_CIDRS: value })
        .trustedProxyCidrs,
    ).toEqual([]);
  expect(
    parseNodeRuntimeSettings({
      ...environment,
      LACE_TRUSTED_PROXY_CIDRS: " 127.0.0.1/32, ::1/128 ",
    }).trustedProxyCidrs,
  ).toEqual(["127.0.0.1/32", "::1/128"]);
  for (const value of [",", "127.0.0.1/32,", ",::1/128", "invalid"])
    expect(() =>
      parseNodeRuntimeSettings({ ...environment, LACE_TRUSTED_PROXY_CIDRS: value }),
    ).toThrow("LACE_TRUSTED_PROXY_CIDRS");
});
