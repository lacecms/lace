import { expect, test, vi } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findWrangler, runMigration } from "../dist/migrate.js";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

test("Node migration is explicit and repeatable", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lace-cli-migrate-"));
  try {
    const databasePath = join(directory, "nested", "data", "lace.sqlite");
    const first = await runMigration({ target: "node", databasePath });
    const second = await runMigration({ target: "node", databasePath });
    expect(first.length).toBeGreaterThan(0);
    expect(second).toEqual(first);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test(
  "CLI binary reports nested migration and sanitized directory failures",
  { timeout: 30_000 },
  async () => {
    const root = await mkdtemp(join(tmpdir(), "lace-cli-fresh-"));
    const binary = fileURLToPath(new URL("../dist/bin.js", import.meta.url));
    const invoke = (path, json = true) =>
      spawnSync(process.execPath, [binary, "db", "migrate", ...(json ? ["--json"] : [])], {
        cwd: root,
        env: { ...process.env, LACE_DATABASE_PATH: path },
        encoding: "utf8",
        timeout: 25_000,
        killSignal: "SIGKILL",
      });
    try {
      const first = invoke("nested/data/lace.sqlite");
      expect(first.status, first.stderr).toBe(0);
      expect(JSON.parse(first.stdout)).toMatchObject({ ok: true, code: "MIGRATED" });
      expect(JSON.parse(invoke("nested/data/lace.sqlite").stdout)).toEqual(
        JSON.parse(first.stdout),
      );
      const blocked = join(root, "private-secret-path");
      await writeFile(blocked, "unchanged");
      for (const json of [true, false]) {
        const failed = invoke(join(blocked, "data/lace.sqlite"), json);
        expect(failed.status).toBe(6);
        if (json) {
          expect(failed.stdout.trim().split("\n")).toHaveLength(1);
          expect(JSON.parse(failed.stdout)).toMatchObject({ ok: false, code: "OPERATION_FAILED" });
          expect(failed.stderr).toBe("");
        } else {
          expect(failed.stdout).toBe("");
          expect(failed.stderr).toContain("Operation failed.");
        }
        expect(failed.stdout + failed.stderr).not.toContain("private-secret-path");
        expect(existsSync(join(blocked, "data/lace.sqlite"))).toBe(false);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);

test("D1 migration verifies selected database before invoking Wrangler", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lace-cli-wrangler-"));
  try {
    const wranglerConfig = join(directory, "wrangler.jsonc");
    await writeFile(
      wranglerConfig,
      '{ "d1_databases": [{ "binding": "DB", "database_id": "correct" }] }',
    );
    await mkdir(join(directory, "node_modules/.bin"), { recursive: true });
    await writeFile(join(directory, "node_modules/.bin/wrangler"), "");
    const run = vi.fn(() => ({ status: 0 }));
    const d1 = { prepare: () => ({ all: async () => ({ results: [{ name: "0000_init.sql" }] }) }) };
    await expect(
      runMigration({ target: "cloudflare-remote", databaseId: "wrong", wranglerConfig, d1, run }),
    ).rejects.toThrow("does not match");
    expect(run).not.toHaveBeenCalled();
    expect(
      await runMigration({
        target: "cloudflare-remote",
        databaseId: "correct",
        wranglerConfig,
        d1,
        run,
      }),
    ).toEqual(["0000_init.sql"]);
    expect(run.mock.calls[0][1]).toContain("--remote");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("D1 migration runs the project Wrangler above a subdirectory configuration", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lace-cli-wrangler-"));
  try {
    const wranglerConfig = join(directory, "worker", "wrangler.jsonc");
    await mkdir(join(directory, "worker"));
    await writeFile(
      wranglerConfig,
      '{ "d1_databases": [{ "binding": "DB", "database_id": "local" }] }',
    );
    const run = vi.fn(() => ({ status: 0 }));
    const input = {
      target: "cloudflare-local",
      databaseId: "local",
      persistTo: join(directory, "state"),
      wranglerConfig,
      run,
    };
    await expect(runMigration(input)).rejects.toMatchObject({
      code: "CONFIG",
      message: expect.stringContaining("Wrangler is not installed"),
    });
    expect(run).not.toHaveBeenCalled();
    await mkdir(join(directory, "node_modules/.bin"), { recursive: true });
    await writeFile(join(directory, "node_modules/.bin/wrangler"), "");
    expect(await findWrangler(join(directory, "worker"))).toBe(
      join(directory, "node_modules/.bin/wrangler"),
    );
    await runMigration(input);
    expect(run.mock.calls[0][0]).toBe(join(directory, "node_modules/.bin/wrangler"));
    expect(run.mock.calls[0][1]).toEqual(
      expect.arrayContaining(["--local", "--config", wranglerConfig]),
    );
    expect(run.mock.calls[0][2].cwd).toBe(join(directory, "worker"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("remote migration child and REST commands share explicitly resolved identity", async () => {
  const { resolveOperatorEnvironment } = await import("../dist/operator-environment.js");
  const { loadEnvironment } = await import("../dist/index.js");
  const { runCommand } = await import("../dist/commands.js");
  const directory = await mkdtemp(join(tmpdir(), "lace-remote-identity-"));
  try {
    await writeFile(
      join(directory, "private"),
      "CLOUDFLARE_ACCOUNT_ID=chosen\nCLOUDFLARE_API_TOKEN=private-identity-sentinel\nLACE_D1_DATABASE_ID=db\nLACE_WRANGLER_CONFIG=worker/wrangler.jsonc\n",
      { mode: 0o600 },
    );
    const environment = loadEnvironment(
      "cloudflare-remote",
      (await resolveOperatorEnvironment("private", {}, directory)).values,
    );
    const wranglerConfig = join(directory, "worker/wrangler.jsonc");
    await mkdir(join(directory, "worker"));
    await writeFile(wranglerConfig, '{"d1_databases":[{"binding":"DB","database_id":"db"}]}');
    await mkdir(join(directory, "node_modules/.bin"), { recursive: true });
    await writeFile(join(directory, "node_modules/.bin/wrangler"), "");
    const run = vi.fn(() => ({ status: 0 }));
    const before = { ...process.env };
    await runMigration({ target: "cloudflare-remote", ...environment, wranglerConfig, run });
    expect(run.mock.calls[0][2].env).toMatchObject({
      CLOUDFLARE_ACCOUNT_ID: "chosen",
      CLOUDFLARE_API_TOKEN: "private-identity-sentinel",
    });
    expect(JSON.stringify(run.mock.calls[0][1])).not.toContain("sentinel");
    expect(process.env).toEqual(before);
    const request = vi.fn(async () => new Response("{}", { status: 403 }));
    vi.stubGlobal("fetch", request);
    for (const command of ["content sync", "auth bootstrap"]) {
      await expect(
        runCommand(
          { command, target: "cloudflare-remote", check: false, json: true },
          environment,
          directory,
        ),
      ).rejects.toThrow("HTTP 403");
      const [url, input] = request.mock.calls.at(-1);
      expect(url).toContain("accounts/chosen/d1/database/db/query");
      expect(input.headers.authorization).toBe("Bearer private-identity-sentinel");
    }
  } finally {
    vi.unstubAllGlobals();
    await rm(directory, { recursive: true, force: true });
  }
});
