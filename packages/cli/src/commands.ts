import { missingLedger } from "./diagnostics.js";
import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  applyPreparedConfigurationSynchronization,
  prepareConfigurationSynchronization,
} from "@lacecms/application";
import type { NormalizedContentModel } from "@lacecms/config";
import { D1ContentRepository, D1SecurityService } from "@lacecms/platform-cloudflare";
import type { D1Database } from "@lacecms/platform-cloudflare";
import {
  NodeContentRepository,
  NodeSecurityService,
  SystemNodeClock,
  UlidGenerator,
  checkedInMigrations,
  listAppliedMigrations,
  openNodeDatabase,
} from "@lacecms/platform-node";
import { openLocalD1, RemoteD1Database } from "./d1-transport.js";
import { CliError, EXIT, type CliEnvironment, type CliOptions } from "./index.js";
import { runMigration } from "./migrate.js";

export interface CommandOutcome {
  readonly code: string;
  readonly data?: unknown;
  readonly exitCode: number;
  readonly message: string;
  readonly ok: boolean;
}

async function projectModels(cwd: string): Promise<readonly NormalizedContentModel[]> {
  let module: unknown;
  try {
    module = await import(pathToFileURL(resolve(cwd, "lace.config.ts")).href);
  } catch {
    throw new CliError(
      "CONFIG",
      "Could not load root lace.config.ts.",
      EXIT.CONFIG,
      "project-config",
    );
  }
  const config = (module as { default?: { runtime?: { content?: unknown } } }).default;
  if (!Array.isArray(config?.runtime?.content))
    throw new CliError("CONFIG", "Invalid root lace.config.ts.", EXIT.CONFIG, "project-config");
  return config.runtime.content as readonly NormalizedContentModel[];
}

function assertNodeSchema(connection: Parameters<typeof listAppliedMigrations>[0]): void {
  try {
    const installed = new Set(listAppliedMigrations(connection).map((entry) => entry.createdAt));
    if (checkedInMigrations.every((item) => installed.has(item.createdAt))) return;
  } catch (error) {
    if (!missingLedger(error)) throw error;
  }
  throw new CliError(
    "SCHEMA_OUTDATED",
    "SQLite schema is outdated. Run `lace db migrate` first.",
    EXIT.SCHEMA,
  );
}

async function assertD1Schema(database: D1Database): Promise<void> {
  try {
    const rows = await database.prepare("select name from d1_migrations").all<{ name: string }>();
    const installed = new Set(rows.results.map((row) => row.name));
    if (checkedInMigrations.every((item) => installed.has(item.name))) return;
  } catch (error) {
    if (!missingLedger(error)) throw error;
  }
  throw new CliError(
    "SCHEMA_OUTDATED",
    "D1 schema is outdated. Run `lace db migrate --target ...` first.",
    EXIT.SCHEMA,
  );
}

async function sync(
  models: readonly NormalizedContentModel[],
  target: NodeContentRepository | D1ContentRepository,
  check: boolean,
): Promise<CommandOutcome> {
  const prepared = await prepareConfigurationSynchronization({ models, state: target });
  const data = JSON.parse(prepared.report.json) as unknown;
  if (check)
    return prepared.report.check.exitCode === 0
      ? { ok: true, code: "SYNC_CURRENT", exitCode: EXIT.OK, message: prepared.report.text, data }
      : {
          ok: false,
          code: "SYNC_PENDING",
          exitCode: EXIT.PENDING,
          message: prepared.report.text,
          data,
        };
  if (!prepared.plan.isValid)
    return {
      ok: false,
      code: "SYNC_BLOCKED",
      exitCode: EXIT.OPERATION,
      message: prepared.report.text,
      data,
    };
  const result = await applyPreparedConfigurationSynchronization({
    clock: new SystemNodeClock(),
    ids: new UlidGenerator(),
    models,
    prepared,
    target,
  });
  return {
    ok: true,
    code: result.status === "noop" ? "SYNC_CURRENT" : "SYNC_APPLIED",
    exitCode: EXIT.OK,
    message: `${prepared.report.text}\n${result.status === "noop" ? "No synchronization needed." : "Synchronization applied."}`,
    data,
  };
}

async function bootstrapToken<T>(create: () => Promise<T>): Promise<T> {
  try {
    return await create();
  } catch (error) {
    if (error instanceof Error && error.message === "Setup already completed.")
      throw new CliError(
        "OPERATION_FAILED",
        "First-administrator setup has already completed.",
        EXIT.OPERATION,
        "setup-complete",
      );
    throw error;
  }
}

export async function runCommand(
  options: CliOptions,
  environment: CliEnvironment,
  cwd = process.cwd(),
): Promise<CommandOutcome> {
  const wranglerConfig = environment.wranglerConfig ?? resolve(cwd, "apps/api/wrangler.jsonc");
  if (options.target === "node") {
    const databasePath = environment.databasePath;
    if (!databasePath) throw new CliError("CONFIG", "Missing LACE_DATABASE_PATH.", EXIT.CONFIG);
    if (options.command === "db migrate") {
      const versions = await runMigration({ target: "node", databasePath });
      return {
        ok: true,
        code: "MIGRATED",
        exitCode: EXIT.OK,
        message: `Node migrations installed: ${versions.join(", ")}.`,
        data: { versions },
      };
    }
    try {
      await access(databasePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      throw new CliError(
        "SCHEMA_OUTDATED",
        "SQLite database is missing. Run `lace db migrate` first.",
        EXIT.SCHEMA,
      );
    }
    const opened = openNodeDatabase(databasePath);
    try {
      assertNodeSchema(opened.connection);
      if (options.command === "content sync")
        return await sync(
          await projectModels(cwd),
          new NodeContentRepository(opened.connection, () => undefined),
          options.check,
        );
      const setup = await bootstrapToken(() =>
        new NodeSecurityService(opened.connection, () =>
          new SystemNodeClock().now(),
        ).createSetupToken(),
      );
      return {
        ok: true,
        code: "BOOTSTRAP_TOKEN",
        exitCode: EXIT.OK,
        message: `First-admin setup token (shown once; expires ${new Date(Number(setup.expiresAt)).toISOString()}):\n${setup.token}`,
        data: { token: setup.token, expiresAt: Number(setup.expiresAt) },
      };
    } finally {
      opened.connection.close();
    }
  }
  const databaseId = environment.databaseId;
  if (!databaseId) throw new CliError("CONFIG", "Missing LACE_D1_DATABASE_ID.", EXIT.CONFIG);
  let database: D1Database;
  let close: () => Promise<void> = async () => undefined;
  if (options.target === "cloudflare-local") {
    if (!environment.persistTo)
      throw new CliError("CONFIG", "Missing LACE_CLOUDFLARE_PERSIST_TO.", EXIT.CONFIG);
    const opened = await openLocalD1({ databaseId, persistTo: environment.persistTo });
    database = opened.database;
    close = opened.close;
  } else {
    if (!environment.accountId || !environment.apiToken)
      throw new CliError("CONFIG", "Missing Cloudflare remote configuration.", EXIT.CONFIG);
    database = new RemoteD1Database({
      accountId: environment.accountId,
      apiToken: environment.apiToken,
      databaseId,
    });
  }
  try {
    if (options.command === "db migrate") {
      await close();
      close = async () => undefined;
      let versions = await runMigration({
        target: options.target,
        databaseId,
        persistTo: environment.persistTo,
        wranglerConfig,
        d1: options.target === "cloudflare-remote" ? database : undefined,
        accountId: environment.accountId,
        apiToken: environment.apiToken,
      });
      if (options.target === "cloudflare-local") {
        const opened = await openLocalD1({
          databaseId,
          persistTo: environment.persistTo as string,
        });
        try {
          versions = (
            await opened.database
              .prepare("select name from d1_migrations order by id")
              .all<{ name: string }>()
          ).results.map((row) => row.name);
        } finally {
          await opened.close();
        }
      }
      return {
        ok: true,
        code: "MIGRATED",
        exitCode: EXIT.OK,
        message: `D1 migrations installed: ${versions.join(", ")}.`,
        data: { versions },
      };
    }
    await assertD1Schema(database);
    if (options.command === "content sync")
      return await sync(
        await projectModels(cwd),
        new D1ContentRepository(database, () => undefined),
        options.check,
      );
    const setup = await bootstrapToken(() =>
      new D1SecurityService(database, () => new SystemNodeClock().now()).createSetupToken(),
    );
    return {
      ok: true,
      code: "BOOTSTRAP_TOKEN",
      exitCode: EXIT.OK,
      message: `First-admin setup token (shown once; expires ${new Date(Number(setup.expiresAt)).toISOString()}):\n${setup.token}`,
      data: { token: setup.token, expiresAt: Number(setup.expiresAt) },
    };
  } finally {
    await close();
  }
}
