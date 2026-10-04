import { expect, test, vi } from "vitest";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { directory, pair, snapshot } from "./upgrade-fixtures.mjs";
import { openNodeDatabase } from "@lacecms/platform-node";
import { runCommand } from "../dist/commands.js";
import { describeFailure, missingLedger } from "../dist/diagnostics.js";
import { presentResult } from "../dist/index.js";
import { runMigration } from "../dist/migrate.js";
import { openLocalD1 } from "../dist/d1-transport.js";

const binary = resolve(import.meta.dirname, "../dist/bin.js");
const repository = resolve(import.meta.dirname, "../../..");
const sentinel = "private-password-token-sentinel";
function invoke(cwd, words, settings, json) {
  return spawnSync(process.execPath, [binary, ...words, ...(json ? ["--json"] : [])], {
    cwd,
    env: { ...process.env, ...settings },
    encoding: "utf8",
    timeout: 25_000,
    killSignal: "SIGKILL",
  });
}
function diagnostic(result, json, code, operation, cause) {
  const text = result.stdout + result.stderr;
  expect(text).not.toContain(sentinel);
  if (json) {
    expect(result.stderr).toBe("");
    expect(result.stdout.trim().split("\n")).toHaveLength(1);
    const value = JSON.parse(result.stdout);
    expect(value).toMatchObject({ ok: false, code, operation });
    expect(value.reason).toMatch(cause);
    expect(value.nextAction.length).toBeGreaterThan(20);
    return value;
  }
  expect(text).toContain(`Operation: ${operation}`);
  expect(text).toMatch(cause);
  expect(text).toContain("Recovery:");
}

test(
  "binary preserves usage/config/schema codes in both modes without supplied values",
  { timeout: 30_000 },
  async () => {
    const root = await directory();
    const db = join(root, `${sentinel}.sqlite`);
    for (const json of [false, true]) {
      let result = invoke(root, ["db", "migrate", "--target", sentinel], {}, json);
      expect(result.status).toBe(3);
      diagnostic(result, json, "USAGE", "db migrate", /invalid/u);
      result = invoke(
        root,
        ["db", "migrate"],
        { LACE_DATABASE_PATH: "", CLOUDFLARE_API_TOKEN: sentinel },
        json,
      );
      expect(result.status).toBe(4);
      diagnostic(result, json, "CONFIG", "db migrate", /configuration/u);
      result = invoke(root, ["content", "sync"], { LACE_DATABASE_PATH: db }, json);
      expect(result.status).toBe(5);
      diagnostic(result, json, "SCHEMA_OUTDATED", "content sync", /missing|outdated/u);
    }
    const opened = openNodeDatabase(db);
    opened.connection.close();
    for (const json of [false, true]) {
      const result = invoke(root, ["auth", "bootstrap"], { LACE_DATABASE_PATH: db }, json);
      expect(result.status).toBe(5);
      diagnostic(result, json, "SCHEMA_OUTDATED", "auth bootstrap", /outdated/u);
    }
  },
);

test(
  "an incomplete Node migration ledger stays a schema error in both output modes",
  { timeout: 30_000 },
  async () => {
    const root = await directory();
    const databasePath = join(root, "lace.sqlite");
    await runMigration({ target: "node", databasePath });
    const opened = openNodeDatabase(databasePath);
    try {
      opened.connection
        .prepare(
          "delete from __drizzle_migrations where created_at = (select max(created_at) from __drizzle_migrations)",
        )
        .run();
      const before = opened.connection.prepare("select * from __drizzle_migrations").all();
      for (const json of [false, true]) {
        const result = invoke(
          root,
          ["auth", "bootstrap"],
          { LACE_DATABASE_PATH: databasePath },
          json,
        );
        expect(result.status).toBe(5);
        diagnostic(result, json, "SCHEMA_OUTDATED", "auth bootstrap", /outdated/u);
      }
      expect(opened.connection.prepare("select * from __drizzle_migrations").all()).toEqual(before);
    } finally {
      opened.connection.close();
    }
  },
);

test(
  "real permission and path failures remain sanitized and preserve files",
  { timeout: 30_000 },
  async () => {
    const root = await directory();
    const blocked = join(root, sentinel);
    await writeFile(blocked, "unchanged");
    for (const json of [false, true]) {
      const result = invoke(
        root,
        ["db", "migrate"],
        { LACE_DATABASE_PATH: join(blocked, "data.sqlite") },
        json,
      );
      expect(result.status).toBe(6);
      diagnostic(result, json, "OPERATION_FAILED", "db migrate", /path cannot/u);
    }
    expect(await readFile(blocked, "utf8")).toBe("unchanged");
    await chmod(root, 0o500);
    try {
      for (const json of [false, true]) {
        const result = invoke(
          root,
          ["db", "migrate"],
          { LACE_DATABASE_PATH: join(root, "nested", "data.sqlite") },
          json,
        );
        expect(result.status).toBe(6);
        diagnostic(result, json, "OPERATION_FAILED", "db migrate", /access was denied/u);
      }
    } finally {
      await chmod(root, 0o700);
    }
  },
);

test.each([false, true])(
  "pending and blocked sync, invalid config and completed bootstrap preserve Node state (json=%s)",
  { timeout: 30_000 },
  async (json) => {
    const root = await directory();
    const db = join(root, "lace.sqlite");
    await runMigration({ target: "node", databasePath: db });
    {
      const pending = invoke(
        repository,
        ["content", "sync", "--check"],
        { LACE_DATABASE_PATH: db },
        json,
      );
      expect(pending.status).toBe(2);
      diagnostic(pending, json, "SYNC_PENDING", "content sync", /pending/u);
    }

    const config = "export default { runtime: { content: [] } };";
    await writeFile(join(root, "lace.config.ts"), config);
    const environment = { LACE_DATABASE_PATH: db };
    {
      await writeFile(join(root, "lace.config.ts"), `throw new Error('${sentinel}');`);
      let result = invoke(root, ["content", "sync"], environment, json);
      expect(result.status).toBe(4);
      diagnostic(result, json, "CONFIG", "content sync", /lace.config.ts/u);
      await writeFile(join(root, "lace.config.ts"), config);
      const opened = openNodeDatabase(db);
      try {
        // One valid populated page makes its removal incompatible.
        await runCommand(
          { command: "content sync", target: "node", check: false, json: true },
          { databasePath: db },
          repository,
        );
        const before = opened.connection.prepare("select * from content_models").all();
        result = invoke(repository, ["content", "sync", "--check"], environment, json);
        expect(result.status).toBe(0);
        result = invoke(root, ["content", "sync"], environment, json);
        expect(result.status).toBe(6);
        diagnostic(result, json, "SYNC_BLOCKED", "content sync", /incompatible/u);
        expect(opened.connection.prepare("select * from content_models").all()).toEqual(before);
        result = invoke(root, ["content", "sync", "--check"], environment, json);
        expect(result.status).toBe(2);
        diagnostic(result, json, "SYNC_PENDING", "content sync", /invalid/u);
        opened.connection
          .prepare(
            "insert into installation_state (singleton_key, setup_completed_at) values (1, 1) on conflict(singleton_key) do update set setup_completed_at = 1",
          )
          .run();
        const tokens = opened.connection.prepare("select * from setup_tokens").all();
        result = invoke(root, ["auth", "bootstrap"], environment, json);
        expect(result.status).toBe(6);
        diagnostic(result, json, "OPERATION_FAILED", "auth bootstrap", /already completed/u);
        expect(opened.connection.prepare("select * from setup_tokens").all()).toEqual(tokens);
      } finally {
        opened.connection.close();
      }
    }
  },
);

test("upgrade review/apply conflicts and input errors retain reports in both modes", async () => {
  const { project, template } = await pair({ "deploy.txt": "old" }, { "deploy.txt": "new" });
  await writeFile(join(project, "deploy.txt"), "local edit");
  const before = await snapshot(project, false);
  for (const json of [false, true]) {
    for (const action of [[], ["--apply"]]) {
      const result = invoke(project, ["upgrade", "--template", template, ...action], {}, json);
      expect(result.status).toBe(2);
      const value = diagnostic(result, json, "UPGRADE_CONFLICTS", "upgrade", /conflict/u);
      if (json) expect(value.data).toBeDefined();
      expect(await snapshot(project, false)).toEqual(before);
    }
    const result = invoke(project, ["upgrade", "--template", join(template, sentinel)], {}, json);
    expect(result.status).toBe(4);
    diagnostic(result, json, "UPGRADE_INPUT", "upgrade", /inputs/u);
  }
});

test("D1 missing ledger, completed setup and remote infrastructure failures have correct diagnostics", async () => {
  const root = await directory();
  const environment = { databaseId: "00000000-0000-0000-0000-000000000000", persistTo: root };
  const options = {
    command: "auth bootstrap",
    target: "cloudflare-local",
    check: false,
    json: true,
  };
  await expect(runCommand(options, environment, repository)).rejects.toMatchObject({
    code: "SCHEMA_OUTDATED",
    exitCode: 5,
  });
  await runCommand({ ...options, command: "db migrate" }, environment, repository);
  const local = await openLocalD1(environment);
  try {
    await local.database
      .prepare(
        "insert into installation_state (singleton_key, setup_completed_at) values (1, 1) on conflict(singleton_key) do update set setup_completed_at = 1",
      )
      .run();
  } finally {
    await local.close();
  }
  await expect(runCommand(options, environment, repository)).rejects.toMatchObject({
    code: "OPERATION_FAILED",
    diagnosticKind: "setup-complete",
  });
  const remote = { accountId: sentinel, apiToken: sentinel, databaseId: sentinel };
  for (const [response, code, cause] of [
    [
      () => {
        throw new Error(sentinel);
      },
      "OPERATION_FAILED",
      /unavailable/u,
    ],
    [() => new Response(sentinel, { status: 403 }), "OPERATION_FAILED", /authorization/u],
    [
      () =>
        Response.json({
          success: false,
          errors: [{ message: `no such table: d1_migrations ${sentinel}` }],
        }),
      "SCHEMA_OUTDATED",
      /outdated/u,
    ],
    [
      () => Response.json({ success: true, result: [{ success: true, results: [] }] }),
      "SCHEMA_OUTDATED",
      /outdated/u,
    ],
  ]) {
    vi.stubGlobal("fetch", vi.fn(response));
    try {
      await runCommand({ ...options, target: "cloudflare-remote" }, remote, repository);
      throw new Error("Expected failure");
    } catch (error) {
      const { exitCode, ...failure } = describeFailure(
        error,
        "auth bootstrap",
        "cloudflare-remote",
      );
      expect(failure.code).toBe(code);
      expect(failure.reason).toMatch(cause);
      for (const json of [false, true])
        expect(presentResult(failure, json)).not.toContain(sentinel);
      expect(exitCode).toBe(code === "SCHEMA_OUTDATED" ? 5 : 6);
    } finally {
      vi.unstubAllGlobals();
    }
  }
  expect(missingLedger(new Error(`network unavailable ${sentinel}`))).toBe(false);
}, 60_000);

test("Wrangler subprocess output is never forwarded", async () => {
  const root = await directory();
  const config = join(root, "wrangler.jsonc");
  await writeFile(config, '{ "d1_databases": [{ "binding": "DB", "database_id": "selected" }] }');
  await mkdir(join(root, "node_modules/.bin"), { recursive: true });
  await writeFile(join(root, "node_modules/.bin/wrangler"), "");
  try {
    await runMigration({
      target: "cloudflare-local",
      databaseId: "selected",
      persistTo: root,
      wranglerConfig: config,
      run: () => ({ status: 1, stdout: sentinel, stderr: sentinel }),
    });
    throw new Error("Expected failure");
  } catch (error) {
    const failure = describeFailure(error, "db migrate", "cloudflare-local");
    expect(failure.reason).toContain("Wrangler");
    expect(JSON.stringify(failure)).not.toContain(sentinel);
  }
});
