// @ts-nocheck
// TODO(rf2): Type legacy SQLite/product harnesses, branded values and partial runtime adapters.
import { expect, test } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { hashPassword } from "better-auth/crypto";

import {
  migrateNodeDatabase,
  NodeFixedWindowRateLimiter,
  NodeSecurityService,
  openNodeDatabase,
  parseNodeRuntimeSettings,
  createNodeRuntime,
} from "./index.js";
import { defineCollection, defineConfig, definePage } from "@lacecms/config";
import { createBetterAuthBoundary } from "@lacecms/auth";
import { betterAuthSchema } from "@lacecms/db";
import { unixMilliseconds } from "@lacecms/domain";

const minioEnvironment = Object.freeze({
  LACE_MINIO_ACCESS_KEY: "test-access-key",
  LACE_MINIO_BUCKET: "lace-media",
  LACE_MINIO_ENDPOINT: "http://minio.test:9000",
  LACE_MINIO_REGION: "us-east-1",
  LACE_MINIO_SECRET_KEY: "test-secret-key",
  LACE_MINIO_TIMEOUT_MS: "1000",
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

test("auth boundary forwards only sign-in, sign-out and get-session to the provider", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lace-auth-allowlist-"));
  const databasePath = join(directory, "lace.sqlite");
  try {
    migrateNodeDatabase(databasePath);
    const database = openNodeDatabase(databasePath);
    const boundary = createBetterAuthBoundary({
      database: database.drizzle,
      origin: new URL("https://lace.test/"),
      production: false,
      schema: betterAuthSchema,
      secret: "test-auth-secret-that-is-long-enough-for-better-auth",
    });
    const now = Date.now();
    database.connection
      .prepare(
        "insert into user (id, name, email, email_verified, role, created_at, updated_at) values ('u1', 'Ada', 'ada@lace.test', 1, 'editor', ?, ?)",
      )
      .run(now, now);
    database.connection
      .prepare(
        "insert into account (id, account_id, provider_id, user_id, password, created_at, updated_at) values ('a1', 'u1', 'credential', 'u1', ?, ?, ?)",
      )
      .run(await hashPassword("correct horse battery staple"), now, now);
    const post = (path, body, cookie) =>
      boundary.fetch(
        new Request(`https://lace.test${path}`, {
          body: JSON.stringify(body),
          headers: {
            "content-type": "application/json",
            origin: "https://lace.test",
            ...(cookie === undefined ? {} : { cookie }),
          },
          method: "POST",
        }),
      );
    const signIn = await post("/api/auth/sign-in/email", {
      email: "ada@lace.test",
      password: "correct horse battery staple",
    });
    expect(signIn.status).toBe(200);
    const cookie = signIn.headers.getSetCookie()[0].split(";")[0];
    const before = database.connection.prepare("select password from account").get();
    for (const [path, body] of [
      ["/api/auth/sign-up/email", { email: "x@lace.test", name: "X", password: "x".repeat(16) }],
      [
        "/api/auth/change-password",
        { currentPassword: "correct horse battery staple", newPassword: "y".repeat(16) },
      ],
      ["/api/auth/update-user", { name: "Mallory" }],
      ["/api/auth/request-password-reset", { email: "ada@lace.test" }],
      ["/api/auth/revoke-sessions", {}],
    ]) {
      const response = await post(path, body, cookie);
      expect(response.status, path).toBe(404);
      expect(await response.text()).toBe("");
    }
    const listed = await boundary.fetch(
      new Request("https://lace.test/api/auth/list-sessions", { headers: { cookie } }),
    );
    expect(listed.status).toBe(404);
    expect(await listed.text()).not.toContain("token");
    expect(database.connection.prepare("select password from account").get()).toEqual(before);
    expect(database.connection.prepare("select name from user").get()).toEqual({ name: "Ada" });
    expect(database.connection.prepare("select count(*) as count from user").get()).toEqual({
      count: 1,
    });
    const current = await boundary.fetch(
      new Request("https://lace.test/api/auth/get-session", { headers: { cookie } }),
    );
    expect(current.status).toBe(200);
    const { id: sessionId } = database.connection.prepare("select id from session").get();
    const prepare = database.connection.prepare.bind(database.connection);
    let sessionReads = 0;
    database.connection.prepare = (sql) => {
      if (/^select\b/iu.test(sql) && /"session"/u.test(sql)) sessionReads += 1;
      return prepare(sql);
    };
    const request = new Request("https://lace.test/api/v1/account/sessions", {
      headers: { cookie },
    });
    await expect(boundary.actors.resolve(request)).resolves.toEqual({ id: "u1", role: "editor" });
    await expect(boundary.actors.sessionId(request)).resolves.toBe(sessionId);
    expect(sessionReads).toBe(1);
    await expect(
      boundary.actors.sessionId(new Request("https://lace.test/api/v1/account/sessions")),
    ).resolves.toBeNull();
    database.connection.prepare = prepare;
    const signOut = await post("/api/auth/sign-out", {}, cookie);
    expect(signOut.status).toBe(200);
    expect(database.connection.prepare("select count(*) as count from session").get()).toEqual({
      count: 0,
    });
    database.connection.close();
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});
