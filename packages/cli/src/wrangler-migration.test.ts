import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { spawnSync } from "node:child_process";
import { expect, test } from "vitest";
import { checkedInMigrations } from "@lacecms/platform-node";
import { runWranglerMigration } from "./wrangler-migration.js";

const success = (names: string[]) =>
  JSON.stringify([{ success: true, results: names.map((name) => ({ name })) }]);
const missing = JSON.stringify({ error: { text: "no such table: d1_migrations: SQLITE_ERROR" } });
async function fixture(outputs: { status: number; stdout: string; stderr?: string }[]) {
  const dir = await mkdtemp(join(tmpdir(), "lace-wrangler-migration-"));
  await mkdir(join(dir, "node_modules", ".bin"), { recursive: true });
  await writeFile(join(dir, "node_modules", ".bin", "wrangler"), "");
  const config = join(dir, "wrangler.json");
  await writeFile(
    config,
    JSON.stringify({ d1_databases: [{ binding: "DB", database_id: "db-id" }] }),
  );
  const calls: { args: readonly string[]; options: { env: Record<string, string | undefined> } }[] =
    [];
  const run = ((
    _command: string,
    args: readonly string[],
    options: { env: Record<string, string | undefined> },
  ) => {
    calls.push({ args, options });
    return outputs.shift() ?? { status: 1, stdout: "", stderr: "missing fixture" };
  }) as unknown as typeof spawnSync;
  return { dir, config, calls, run };
}

for (const token of [undefined, "token-sentinel"]) {
  test(`Wrangler migration preserves ${token ? "token" : "OAuth"} authentication and checks both ledgers`, async () => {
    const name = checkedInMigrations[0]!.name;
    const f = await fixture([
      { status: 1, stdout: missing },
      { status: 0, stdout: "" },
      { status: 0, stdout: success([name]) },
    ]);
    const previous = process.env.CLOUDFLARE_API_TOKEN;
    if (token) process.env.CLOUDFLARE_API_TOKEN = token;
    else delete process.env.CLOUDFLARE_API_TOKEN;
    try {
      expect(
        await runWranglerMigration({ config: f.config, databaseId: "db-id", run: f.run }),
      ).toEqual([name]);
      expect(f.calls).toHaveLength(3);
      for (const call of f.calls) {
        expect(call.args).toContain(f.config);
        expect(call.args).toContain("DB");
        expect(call.args).toContain("--remote");
        expect(call.options.env.CLOUDFLARE_API_TOKEN).toBe(token);
      }
      expect(f.calls[1]!.args).toContain("apply");
    } finally {
      if (previous === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
      else process.env.CLOUDFLARE_API_TOKEN = previous;
      await rm(f.dir, { recursive: true, force: true });
    }
  });
}

test.each([
  [{ status: 0, stdout: success(["unrecognized.sql"]) }, "SCHEMA_UNSUPPORTED", 5],
  [
    { status: 1, stdout: JSON.stringify({ error: { text: "not authorized secret-sentinel" } }) },
    "OPERATION_FAILED",
    6,
  ],
  [{ status: 0, stdout: "invalid secret-sentinel" }, "OPERATION_FAILED", 6],
  [
    {
      status: 1,
      stdout: JSON.stringify({
        error: { text: "no such table: d1_migrations: SQLITE_ERROR", code: 403 },
      }),
    },
    "OPERATION_FAILED",
    6,
  ],
])("fails closed before mutation for invalid ledger", async (response, code, exitCode) => {
  const f = await fixture([response]);
  try {
    await expect(
      runWranglerMigration({ config: f.config, databaseId: "db-id", run: f.run }),
    ).rejects.toMatchObject({ code, exitCode });
    expect(f.calls).toHaveLength(1);
    expect(JSON.stringify(f.calls)).not.toContain("secret-sentinel");
  } finally {
    await rm(f.dir, { recursive: true, force: true });
  }
});

test("supported ledger is checked again after successful apply", async () => {
  const name = checkedInMigrations[0]!.name;
  const f = await fixture([
    { status: 0, stdout: success([name]) },
    { status: 0, stdout: "" },
    { status: 0, stdout: success([name]) },
  ]);
  try {
    expect(
      await runWranglerMigration({ config: f.config, databaseId: "db-id", run: f.run }),
    ).toEqual([name]);
  } finally {
    await rm(f.dir, { recursive: true, force: true });
  }
});
