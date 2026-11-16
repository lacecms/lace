import { strict as assert } from "node:assert";
import type { Cache, SiteBuildTrigger, ObjectStorage } from "@lacecms/application";
import { siteBuildId } from "@lacecms/domain";
import { object } from "./test-support/json.js";
import { expect, test } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  migrateNodeDatabase,
  NodeInfrastructureUnavailableError,
  NodeEnvironmentError,
  NodePlaceholderObjectStorage,
  NoopNodeBuildTrigger,
  NoopNodeCache,
  nodePublicMediaUrl,
  packageName,
  parseNodeRuntimeSettings,
  createNodeRuntime,
} from "./index.js";
import { defineConfig, definePage } from "@lacecms/config";

import { actorId } from "@lacecms/domain";

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
        LACE_API_DOCS_ENABLED: "true",
        LACE_AUTH_SECRET: "test-auth-secret-that-is-long-enough-for-better-auth",
        LACE_DATABASE_PATH: join(directory, "db.sqlite"),
        LACE_PUBLIC_BASE_URL: "https://lace.test/",
      });
      const config = await defineConfig({ content: [] });
      const runtime = createNodeRuntime({
        config,
        settings,
        ...(environment === undefined ? {} : { environment }),
      });
      try {
        expect((await runtime.app.request("/api/docs")).status).toBe(200);
        const response = await runtime.app.fetch(
          new Request("https://lace.test/api/v1/openapi.json"),
        );
        const manifest = JSON.parse(
          await readFile(new URL("../package.json", import.meta.url), "utf8"),
        );
        expect(object(object(await response.json()).info).version).toBe(
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

test("Node settings compose email providers with production restrictions", () => {
  const base = {
    ...minioEnvironment,
    LACE_AUTH_SECRET: "test-auth-secret-that-is-long-enough-for-better-auth",
    LACE_DATABASE_PATH: "/tmp/lace.sqlite",
    LACE_PUBLIC_BASE_URL: "https://lace.test/",
  };
  expect(parseNodeRuntimeSettings(base).email).toEqual({ provider: "none" });
  const mailpit = {
    ...base,
    LACE_EMAIL_FROM: "Lace Dev <lace@localhost.test>",
    LACE_EMAIL_PROVIDER: "smtp",
    LACE_SMTP_HOST: "mailpit",
    LACE_SMTP_PORT: "1025",
    LACE_SMTP_SECURITY: "none",
  };
  expect(parseNodeRuntimeSettings(mailpit).email).toMatchObject({
    provider: "smtp",
    smtp: { host: "mailpit", port: 1025, security: "none" },
  });
  expect(() => parseNodeRuntimeSettings({ ...mailpit, NODE_ENV: "production" })).toThrow(
    "Invalid Node environment: LACE_SMTP_SECURITY.",
  );
  expect(() =>
    parseNodeRuntimeSettings({
      ...base,
      LACE_EMAIL_FROM: "cms@lace.test",
      LACE_EMAIL_PROVIDER: "log",
      NODE_ENV: "production",
    }),
  ).toThrow("Invalid Node environment: LACE_EMAIL_PROVIDER.");
  expect(() =>
    parseNodeRuntimeSettings({
      ...base,
      LACE_EMAIL_FROM: "cms@lace.test",
      LACE_EMAIL_PROVIDER: "cloudflare",
    }),
  ).toThrow("Invalid Node environment: LACE_EMAIL_PROVIDER.");
  const password = "smtp-password-do-not-print";
  try {
    parseNodeRuntimeSettings({
      ...mailpit,
      LACE_SMTP_PASSWORD: password,
      LACE_SMTP_PORT: password,
    });
    expect.unreachable();
  } catch (error) {
    expect(String(error)).toBe(
      "NodeEnvironmentError: Invalid Node environment: LACE_SMTP_PORT, LACE_SMTP_USER.",
    );
    assert(error instanceof NodeEnvironmentError);
    expect(JSON.stringify(error.issues)).not.toContain(password);
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
  const storage: ObjectStorage = new NodePlaceholderObjectStorage(settings.publicBaseUrl);
  await expect(storage.createReadUrl("media/one")).resolves.toBe(
    "https://lace.test/base/api/v1/public/media/media%2Fone",
  );
  await expect(storage.get("media/one")).rejects.toBeInstanceOf(NodeInfrastructureUnavailableError);
  const cache: Cache = new NoopNodeCache();
  await cache.set("derived", { value: 1 });
  await expect(cache.get("derived")).resolves.toBeNull();
  const trigger: SiteBuildTrigger = new NoopNodeBuildTrigger();
  await expect(
    trigger.trigger({ buildId: siteBuildId("test"), targetVersion: 1 }),
  ).resolves.toEqual({
    status: "failed",
    reason: "trigger_unavailable",
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
  expect(() =>
    parseNodeRuntimeSettings({
      ...env,
      LACE_BUILD_SITE_ID: "real-site",
      LACE_BUILD_SITE_LABEL: "Real site",
      LACE_BUILD_SITE_URL: "https://user:secret@site.test/",
    }),
  ).toThrow(/^Invalid build site configuration: LACE_BUILD_SITE_URL\.$/u);
});

test.each([
  null,
  { id: "real-site", label: "Real site" },
  { id: "real-site", label: "Real site", url: "https://site.test/blog/" },
])("Node composition serves current identity %j", async (site) => {
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
      ...(site?.url ? { LACE_BUILD_SITE_URL: site.url } : {}),
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
});

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

test("Node API docs flag accepts only exact string booleans without value disclosure", () => {
  const env = {
    ...minioEnvironment,
    LACE_AUTH_SECRET: "test-auth-secret-that-is-long-enough-for-better-auth",
    LACE_DATABASE_PATH: ":memory:",
    LACE_PUBLIC_BASE_URL: "https://lace.test/",
  };
  expect(parseNodeRuntimeSettings(env).apiDocsEnabled).toBe(false);
  for (const value of ["true", "false"])
    expect(parseNodeRuntimeSettings({ ...env, LACE_API_DOCS_ENABLED: value }).apiDocsEnabled).toBe(
      value === "true",
    );
  for (const value of ["", "1", "TRUE", " secret-docs-value "]) {
    try {
      parseNodeRuntimeSettings({ ...env, LACE_API_DOCS_ENABLED: value });
      throw new Error("Expected invalid configuration");
    } catch (error) {
      assert(error instanceof NodeEnvironmentError);
      expect(error.message).toBe("Invalid Node environment: LACE_API_DOCS_ENABLED.");
      expect(error.issues).toEqual([{ reason: "invalid", variable: "LACE_API_DOCS_ENABLED" }]);
    }
  }
});

test("Node MCP flag validates exact strings without disclosing values", () => {
  const base = {
    ...minioEnvironment,
    LACE_AUTH_SECRET: "test-auth-secret-that-is-long-enough-for-better-auth",
    LACE_DATABASE_PATH: "/tmp/lace-mcp-settings.sqlite",
    LACE_PUBLIC_BASE_URL: "https://lace.test/",
  };
  expect(parseNodeRuntimeSettings(base).mcpEnabled).toBe(false);
  expect(parseNodeRuntimeSettings({ ...base, LACE_MCP_ENABLED: "false" }).mcpEnabled).toBe(false);
  expect(parseNodeRuntimeSettings({ ...base, LACE_MCP_ENABLED: "true" }).mcpEnabled).toBe(true);
  for (const value of ["", "TRUE", "1", " private-value "])
    expect(() => parseNodeRuntimeSettings({ ...base, LACE_MCP_ENABLED: value })).toThrow(
      "Invalid Node environment: LACE_MCP_ENABLED.",
    );
});
