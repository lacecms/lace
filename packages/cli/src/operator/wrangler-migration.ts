import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { uncheckedD1Migrations } from "@lacecms/platform-node";
import { CliError, EXIT } from "../shared/cli.js";
import { findWrangler, runMigration, verifyD1Config } from "./migrate.js";

const failure = () =>
  new CliError(
    "OPERATION_FAILED",
    "D1 migration ledger could not be read; inspect the configured Wrangler target and retry.",
    EXIT.OPERATION,
    "wrangler",
  );
const unsupported = () =>
  new CliError(
    "SCHEMA_UNSUPPORTED",
    "The selected database was migrated by a Lace engine older than the baseline migration and cannot be upgraded; recreate it (export its content first if you need to keep it).",
    EXIT.SCHEMA,
  );

/** Internal repository wrapper: explicit config and identity, Wrangler's existing authentication. */
export async function runWranglerMigration(input: {
  readonly databaseId: string;
  readonly config: string;
  readonly run?: typeof spawnSync;
}): Promise<readonly string[]> {
  const config = resolve(input.config);
  await verifyD1Config(config, input.databaseId);
  const wrangler = await findWrangler(dirname(config));
  const run = input.run ?? spawnSync;
  const query = (freshAllowed: boolean): readonly string[] => {
    const result = run(
      wrangler,
      [
        "d1",
        "execute",
        "DB",
        "--remote",
        "--config",
        config,
        "--command",
        "select name from d1_migrations order by id",
        "--json",
      ],
      {
        cwd: dirname(config),
        encoding: "utf8",
        env: { ...process.env, CI: "true", WRANGLER_SEND_METRICS: "false" },
      },
    );
    if (result.error) throw failure();
    let data: unknown;
    try {
      data = JSON.parse(String(result.stdout));
    } catch {
      throw failure();
    }
    if (result.status !== 0) {
      if (freshAllowed && typeof data === "object" && data !== null && "error" in data) {
        const error = (data as { error?: unknown }).error;
        if (
          typeof error === "object" &&
          error !== null &&
          "text" in error &&
          typeof error.text === "string" &&
          /^no such table: (?:main\.)?d1_migrations(?:: SQLITE_ERROR)?$/u.test(error.text) &&
          Object.keys(data).length === 1 &&
          Object.keys(error).length === 1
        )
          return [];
      }
      throw failure();
    }
    if (
      !Array.isArray(data) ||
      data.length !== 1 ||
      data[0]?.success !== true ||
      !Array.isArray(data[0]?.results)
    )
      throw failure();
    const names: string[] = [];
    for (const row of data[0].results) {
      if (
        typeof row !== "object" ||
        row === null ||
        typeof row.name !== "string" ||
        !row.name ||
        Object.keys(row).length !== 1
      )
        throw failure();
      names.push(row.name);
    }
    return names;
  };
  const before = query(true);
  if (uncheckedD1Migrations(before).length > 0) throw unsupported();
  await runMigration({
    target: "cloudflare-remote",
    databaseId: input.databaseId,
    wranglerConfig: config,
    run,
  });
  return query(false);
}
