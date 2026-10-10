import { expect, test } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { openNodeDatabase } from "@lacecms/platform-node";
import { runCommand } from "../dist/commands.js";

const cwd = resolve(import.meta.dirname, "../../..");
const command = (name, check = false) => ({ command: name, target: "node", check, json: true });

test("operational Node migration, no-write check, sync, and bootstrap", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lace-cli-commands-"));
  const environment = { databasePath: join(directory, "lace.sqlite") };
  try {
    const migrate = await runCommand(command("db migrate"), environment, cwd);
    expect(migrate.code).toBe("MIGRATED");
    const pending = await runCommand(command("content sync", true), environment, cwd);
    expect(pending.code).toBe("SYNC_PENDING");
    expect(pending.exitCode).toBe(2);
    const applied = await runCommand(command("content sync"), environment, cwd);
    expect(applied.code).toBe("SYNC_APPLIED");
    expect((await runCommand(command("content sync", true), environment, cwd)).code).toBe(
      "SYNC_CURRENT",
    );
    const setup = await runCommand(command("auth bootstrap"), environment, cwd);
    expect(setup.code).toBe("BOOTSTRAP_TOKEN");
    expect(setup.data.token).toMatch(/^[A-Za-z0-9_-]{40,}$/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);

test("first check after upgrading reports pending baselines and sync records them quietly", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lace-cli-baselines-"));
  const environment = { databasePath: join(directory, "lace.sqlite") };
  const sql = (statement) => {
    const database = openNodeDatabase(environment.databasePath);
    try {
      const prepared = database.connection.prepare(statement);
      return prepared.reader ? prepared.all() : prepared.run();
    } finally {
      database.connection.close();
    }
  };
  try {
    await runCommand(command("db migrate"), environment, cwd);
    await runCommand(command("content sync"), environment, cwd);
    expect(sql("select count(*) as n from content_models where structure_json is null")).toEqual([
      { n: 0 },
    ]);
    sql("update content_models set structure_json = null, structure_json_hash = null");
    const version = sql("select version from published_state");

    const pending = await runCommand(command("content sync", true), environment, cwd);
    expect(pending.code).toBe("SYNC_PENDING");
    expect(pending.data.operations.length).toBeGreaterThan(0);
    expect(pending.data.operations.every((item) => item.action === "record-baseline")).toBe(true);
    expect(pending.message).toContain("- record-baseline");

    expect((await runCommand(command("content sync"), environment, cwd)).code).toBe("SYNC_APPLIED");
    expect(sql("select version from published_state")).toEqual(version);
    expect((await runCommand(command("content sync", true), environment, cwd)).code).toBe(
      "SYNC_CURRENT",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);

test("Cloudflare local sync and bootstrap use persistent D1 services", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lace-cli-cloudflare-"));
  const environment = { databaseId: "00000000-0000-0000-0000-000000000000", persistTo: directory };
  try {
    expect(
      (
        await runCommand(
          { command: "db migrate", target: "cloudflare-local", check: false, json: true },
          environment,
          cwd,
        )
      ).code,
    ).toBe("MIGRATED");
    expect(
      (
        await runCommand(
          { command: "content sync", target: "cloudflare-local", check: true, json: true },
          environment,
          cwd,
        )
      ).code,
    ).toBe("SYNC_PENDING");
    expect(
      (
        await runCommand(
          { command: "content sync", target: "cloudflare-local", check: false, json: true },
          environment,
          cwd,
        )
      ).code,
    ).toBe("SYNC_APPLIED");
    expect(
      (
        await runCommand(
          { command: "auth bootstrap", target: "cloudflare-local", check: false, json: true },
          environment,
          cwd,
        )
      ).data.token,
    ).toMatch(/^[A-Za-z0-9_-]{40,}$/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);

test("Cloudflare local migration applies Wrangler journal explicitly", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lace-cli-d1-migrate-"));
  try {
    const outcome = await runCommand(
      { command: "db migrate", target: "cloudflare-local", check: false, json: true },
      { databaseId: "00000000-0000-0000-0000-000000000000", persistTo: directory },
      cwd,
    );
    expect(outcome.code).toBe("MIGRATED");
    expect(outcome.data.versions.length).toBeGreaterThan(0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);
