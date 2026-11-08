import { spawnSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { D1Database } from "@lacecms/platform-cloudflare";
import {
  migrateNodeDatabase,
  uncheckedD1Migrations,
  UnsupportedDatabaseError,
} from "@lacecms/platform-node";
import { missingLedger } from "./diagnostics.js";
import { CliError, EXIT, type Target } from "./index.js";

const UNSUPPORTED_DATABASE =
  "The selected database was migrated by a Lace engine older than the baseline migration and cannot be upgraded; recreate it (export its content first if you need to keep it).";

/** Refuses a D1 database whose ledger records migrations that are not checked in. */
export async function assertD1Baseline(database: D1Database): Promise<void> {
  let names: readonly string[];
  try {
    names = (
      await database.prepare("select name from d1_migrations").all<{ name: string }>()
    ).results.map((row) => row.name);
  } catch (error) {
    if (missingLedger(error)) return;
    throw error;
  }
  if (uncheckedD1Migrations(names).length > 0)
    throw new CliError("SCHEMA_UNSUPPORTED", UNSUPPORTED_DATABASE, EXIT.SCHEMA);
}

function parseJsonc(value: string): unknown {
  return JSON.parse(
    value
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n")
      .replace(/,(\s*[}\]])/gu, "$1"),
  );
}

export async function verifyD1Config(configPath: string, databaseId: string): Promise<void> {
  let config: unknown;
  try {
    config = parseJsonc(await readFile(configPath, "utf8"));
  } catch {
    throw new CliError("CONFIG", "Invalid LACE_WRANGLER_CONFIG.", EXIT.CONFIG);
  }
  const databases = (
    config as { d1_databases?: { binding?: string; database_id?: string }[] } | null
  )?.d1_databases;
  if (
    !Array.isArray(databases) ||
    databases.find((entry) => entry?.binding === "DB")?.database_id !== databaseId
  )
    throw new CliError(
      "CONFIG",
      "LACE_D1_DATABASE_ID does not match LACE_WRANGLER_CONFIG DB binding.",
      EXIT.CONFIG,
    );
}

/** The nearest installed Wrangler at or above the configuration's directory. */
export async function findWrangler(configDirectory: string): Promise<string> {
  let directory = resolve(configDirectory);
  for (;;) {
    const candidate = resolve(directory, "node_modules", ".bin", "wrangler");
    try {
      await access(candidate);
      return candidate;
    } catch {
      const parent = dirname(directory);
      if (parent === directory)
        throw new CliError(
          "CONFIG",
          "Wrangler is not installed for LACE_WRANGLER_CONFIG; install the project dependencies.",
          EXIT.CONFIG,
        );
      directory = parent;
    }
  }
}

export interface MigrateInput {
  readonly target: Target;
  readonly databasePath?: string | undefined;
  readonly databaseId?: string | undefined;
  readonly persistTo?: string | undefined;
  readonly wranglerConfig?: string | undefined;
  readonly d1?: D1Database | undefined;
  readonly run?: typeof spawnSync;
  readonly accountId?: string | undefined;
  readonly apiToken?: string | undefined;
}

export async function runMigration(input: MigrateInput): Promise<readonly string[]> {
  if (input.target === "node") {
    if (!input.databasePath)
      throw new CliError("CONFIG", "Missing LACE_DATABASE_PATH.", EXIT.CONFIG);
    try {
      return migrateNodeDatabase(input.databasePath).map((migration) =>
        String(migration.createdAt),
      );
    } catch (error) {
      if (error instanceof UnsupportedDatabaseError)
        throw new CliError("SCHEMA_UNSUPPORTED", UNSUPPORTED_DATABASE, EXIT.SCHEMA);
      throw error;
    }
  }
  if (
    !input.databaseId ||
    !input.wranglerConfig ||
    (input.target === "cloudflare-local" && !input.persistTo)
  )
    throw new CliError("CONFIG", "Missing D1 migration configuration.", EXIT.CONFIG);
  const configPath = resolve(input.wranglerConfig);
  await verifyD1Config(configPath, input.databaseId);
  const args = [
    "d1",
    "migrations",
    "apply",
    "DB",
    input.target === "cloudflare-local" ? "--local" : "--remote",
    "--config",
    configPath,
  ];
  if (input.target === "cloudflare-local")
    args.push("--persist-to", resolve(input.persistTo as string));
  const runner = input.run ?? spawnSync;
  const wrangler = await findWrangler(dirname(configPath));
  const result = runner(wrangler, args, {
    cwd: dirname(configPath),
    encoding: "utf8",
    env: {
      ...process.env,
      CI: "true",
      WRANGLER_SEND_METRICS: "false",
      ...(input.target === "cloudflare-remote"
        ? {
            CLOUDFLARE_ACCOUNT_ID: input.accountId ?? process.env.CLOUDFLARE_ACCOUNT_ID,
            CLOUDFLARE_API_TOKEN: input.apiToken ?? process.env.CLOUDFLARE_API_TOKEN,
          }
        : {}),
    },
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new CliError(
      "OPERATION_FAILED",
      "D1 migration failed; inspect the configured Wrangler target and retry.",
      EXIT.OPERATION,
      "wrangler",
    );
  if (!input.d1) return [];
  const installed = await input.d1
    .prepare("select name from d1_migrations order by id")
    .all<{ name: string }>();
  return installed.results.map((row) => row.name);
}
