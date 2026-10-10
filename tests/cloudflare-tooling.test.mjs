import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "vitest";
import {
  UsageError,
  apiDirectory,
  defaultPersistDirectory,
  developmentWranglerConfig,
  parseDevArguments,
  parseJsonc,
  parseMigrateArguments,
  remoteConfirmationMatches,
  remoteConfirmationMode,
  remoteDatabase,
  routeFor,
  wranglerConfigPath,
} from "../scripts/cloudflare-lib.mjs";

const config = parseJsonc(await readFile(wranglerConfigPath, "utf8"));

test("migration requires exactly one explicit target", () => {
  for (const argv of [[], ["--"], ["--local", "--remote"], ["--remote", "--remote"], ["--prod"]])
    expect(() => parseMigrateArguments(argv)).toThrow(UsageError);
  expect(parseMigrateArguments(["--", "--local"])).toEqual({
    persistTo: defaultPersistDirectory,
    target: "local",
  });
  expect(parseMigrateArguments(["--remote"])).toEqual({ target: "remote" });
});

test("--persist-to applies only to local migrations and resolves relative paths", () => {
  expect(parseMigrateArguments(["--local", "--persist-to", "tmp/state"], "/work")).toEqual({
    persistTo: "/work/tmp/state",
    target: "local",
  });
  expect(() => parseMigrateArguments(["--remote", "--persist-to", "/tmp/x"])).toThrow(UsageError);
  expect(() => parseMigrateArguments(["--local", "--persist-to"])).toThrow(UsageError);
  expect(() => parseMigrateArguments(["--local", "--persist-to", "--remote"])).toThrow(UsageError);
});

test("remote migration refuses the placeholder database and confirms outside CI", () => {
  expect(() => remoteDatabase(config)).toThrow(/placeholder/u);
  const real = {
    d1_databases: [
      { binding: "DB", database_id: "5f0c1d2e-aaaa-bbbb-cccc-0123456789ab", database_name: "lace" },
    ],
  };
  expect(remoteDatabase(real)).toEqual({
    id: "5f0c1d2e-aaaa-bbbb-cccc-0123456789ab",
    name: "lace",
  });
  expect(remoteConfirmationMode({ env: { CI: "true" }, interactive: false })).toBe("skip");
  expect(remoteConfirmationMode({ env: { CI: "1" }, interactive: true })).toBe("skip");
  expect(remoteConfirmationMode({ env: {}, interactive: true })).toBe("prompt");
  expect(remoteConfirmationMode({ env: { CI: "false" }, interactive: true })).toBe("prompt");
  expect(() => remoteConfirmationMode({ env: {}, interactive: false })).toThrow(UsageError);
  expect(() => remoteConfirmationMode({ env: { CI: "0" }, interactive: false })).toThrow(
    UsageError,
  );
  expect(remoteConfirmationMatches(" lace\n", "lace")).toBe(true);
  expect(remoteConfirmationMatches("yes", "lace")).toBe(false);
  expect(remoteConfirmationMatches(undefined, "lace")).toBe(false);
});

test("development configuration is local, same-origin, and leaves production config intact", () => {
  const before = JSON.stringify(config);
  const generated = developmentWranglerConfig(config);
  expect(JSON.stringify(config)).toBe(before);
  expect(generated.main).toBe(join(apiDirectory, "worker", "index.ts"));
  expect(generated.d1_databases[0].migrations_dir).toBe(
    join(apiDirectory, "..", "..", "packages", "db", "drizzle"),
  );
  expect(generated).not.toHaveProperty("assets");
  expect(generated).not.toHaveProperty("$schema");
  expect(generated).not.toHaveProperty("kv_namespaces");
  expect(generated.vars).toEqual({
    LACE_EMAIL_FROM: "Lace Dev <lace@localhost.test>",
    LACE_EMAIL_PROVIDER: "log",
    LACE_ENVIRONMENT: "development",
    LACE_PUBLIC_BASE_URL: "http://127.0.0.1:8787/",
  });
  expect(generated.compatibility_flags).toContain("nodejs_compat");
  expect(JSON.stringify(generated)).not.toContain("LACE_AUTH_SECRET");
  expect(developmentWranglerConfig(config, { kv: true }).kv_namespaces).toEqual([
    { binding: "CACHE", id: "lace-dev-cache" },
  ]);
  expect(parseDevArguments(["--", "--kv"])).toEqual({ kv: true });
  expect(parseDevArguments([])).toEqual({ kv: false });
  expect(() => parseDevArguments(["--remote"])).toThrow(UsageError);
});

test("gateway sends API and health paths to the Worker before any frontend", () => {
  for (const path of [
    "/api",
    "/api/v1/unknown",
    "/api/auth/get-session",
    "/health",
    "/health/ready",
    "/__scheduled",
  ])
    expect(routeFor(path)).toBe("worker");
  for (const path of ["/admin", "/admin/", "/admin/content/posts", "/admin/@vite/client"])
    expect(routeFor(path)).toBe("admin");
  for (const path of ["/", "/posts/first", "/apis", "/administrator", "/healthz"])
    expect(routeFor(path)).toBe("site");
});
