import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { test, expect } from "vitest";

const bin = resolve("dist/bin.js");

test("operator targets isolate Node and report a missing Cloudflare peer", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "lace-lazy-cloudflare-"));
  try {
    const hook = join(cwd, "hook.mjs");
    const run = (target, mode, json = true) => {
      const env = {
        ...process.env,
        LACE_DATABASE_PATH: join(cwd, "node.sqlite"),
        LACE_D1_DATABASE_ID: "database",
        LACE_CLOUDFLARE_PERSIST_TO: join(cwd, "d1"),
        CLOUDFLARE_ACCOUNT_ID: "account",
        CLOUDFLARE_API_TOKEN: "private-token-sentinel",
        LACE_WRANGLER_CONFIG: join(cwd, "wrangler.jsonc"),
        RF7A_TEST_MODE: mode,
      };
      return spawnSync(
        process.execPath,
        ["--import", hook, bin, "db", "migrate", "--target", target, ...(json ? ["--json"] : [])],
        { cwd, env, encoding: "utf8" },
      );
    };
    await writeFile(
      hook,
      `import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'miniflare' || (process.env.RF7A_TEST_MODE === 'node' && specifier === '@lacecms/platform-cloudflare')) {
    const e = new Error('private-token-sentinel'); e.code = process.env.RF7A_TEST_MODE === 'other' ? 'ERR_TEST_FAILURE' : 'ERR_MODULE_NOT_FOUND'; throw e;
  }
  return next(specifier, context);
} });`,
    );
    const node = run("node", "node");
    expect(node.status).toBe(0);
    expect(JSON.parse(node.stdout).code).toBe("MIGRATED");
    for (const target of ["cloudflare-local", "cloudflare-remote"]) {
      const result = run(target, "missing");
      expect(result.status).not.toBe(0);
      const failure = JSON.parse(result.stdout);
      expect(failure.code).toBe("OPERATION_FAILED");
      expect(failure.message).toContain("pnpm add -D miniflare@");
      expect(result.stdout).not.toContain("private-token-sentinel");
      expect(result.stderr).toBe("");
      const text = run(target, "missing", false);
      expect(text.stderr).toContain("pnpm add -D miniflare@");
      expect(text.stderr).not.toContain("private-token-sentinel");
    }
    const other = run("cloudflare-remote", "other");
    expect(JSON.parse(other.stdout).message).not.toContain("Install it");
    expect(other.stdout).not.toContain("private-token-sentinel");
    await expect(readFile(join(cwd, "d1"))).rejects.toMatchObject({ code: "ENOENT" });
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("packed CLI runs in a consumer without and with its optional peer", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "lace-packed-cli-"));
  try {
    const pack = spawnSync("pnpm", ["pack", "--pack-destination", cwd], { encoding: "utf8" });
    expect(pack.status, pack.stderr).toBe(0);
    const { version } = JSON.parse(await readFile(resolve("package.json"), "utf8"));
    const archive = join(cwd, `lacecms-cli-${version}.tgz`);
    expect(spawnSync("tar", ["-xzf", archive, "-C", cwd]).status).toBe(0);
    const pkg = join(cwd, "package");
    const manifest = JSON.parse(await readFile(join(pkg, "package.json"), "utf8"));
    expect(manifest.peerDependenciesMeta.miniflare.optional).toBe(true);
    expect(manifest.dependencies.miniflare).toBeUndefined();
    for (const name of Object.keys(manifest.dependencies)) {
      const dest = join(pkg, "node_modules", name);
      await mkdir(join(dest, ".."), { recursive: true });
      await symlink(await realpath(resolve("node_modules", name)), dest, "dir");
    }
    const cli = join(pkg, "dist/bin.js");
    const env = {
      ...process.env,
      LACE_DATABASE_PATH: join(cwd, "db.sqlite"),
      LACE_D1_DATABASE_ID: "db",
      LACE_CLOUDFLARE_PERSIST_TO: join(cwd, "d1"),
      CLOUDFLARE_ACCOUNT_ID: "account",
      CLOUDFLARE_API_TOKEN: "private-token",
      LACE_WRANGLER_CONFIG: join(cwd, "wrangler.jsonc"),
    };
    const run = (...args) =>
      spawnSync(process.execPath, [cli, ...args], { cwd, env, encoding: "utf8" });
    expect(JSON.parse(run("db", "migrate", "--target", "node", "--json").stdout).code).toBe(
      "MIGRATED",
    );
    for (const target of ["cloudflare-local", "cloudflare-remote"]) {
      const result = run("db", "migrate", "--target", target, "--json");
      expect(result.status).not.toBe(0);
      expect(JSON.parse(result.stdout).message).toContain("Install it");
    }
    const doctorBefore = run("doctor", "--target", "node", "--stage", "setup", "--json");
    await symlink(
      await realpath(resolve("node_modules/miniflare")),
      join(pkg, "node_modules/miniflare"),
      "dir",
    );
    const doctorAfter = run("doctor", "--target", "node", "--stage", "setup", "--json");
    expect(doctorAfter.status).toBe(doctorBefore.status);
    expect(doctorAfter.stdout).toBe(doctorBefore.stdout);
    const { openLocalD1 } = await import(pathToFileURL(join(pkg, "dist/d1-transport.js")).href);
    const local = await openLocalD1({ databaseId: "db", persistTo: join(cwd, "d1") });
    try {
      expect((await local.database.prepare("select 1 as value").all()).results[0].value).toBe(1);
    } finally {
      await local.close();
    }
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}, 60_000);
