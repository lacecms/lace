import { isAbsolute, join, resolve } from "node:path";

export const root = resolve(import.meta.dirname, "..");
export const apiDirectory = join(root, "apps", "api");
export const wranglerConfigPath = join(apiDirectory, "wrangler.jsonc");
export const developmentDirectory = join(root, "dev-data", "cloudflare");
export const defaultPersistDirectory = join(developmentDirectory, "state");

export const developmentPorts = Object.freeze({
  admin: 5173,
  gateway: 8787,
  site: 4321,
  worker: 8788,
});
export const developmentOrigin = `http://127.0.0.1:${developmentPorts.gateway}`;

const PLACEHOLDER_DATABASE_ID = /^0{8}-0{4}-0{4}-0{4}-0{12}$/u;

export class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = "UsageError";
  }
}

export const migrateUsage =
  "Usage: pnpm db:migrate:cloudflare -- --local [--persist-to <dir>] | --remote";
export const devUsage = "Usage: pnpm dev:cloudflare [-- --kv]";

/** pnpm may forward a literal `--` separator; it carries no meaning here. */
function withoutSeparator(argv) {
  return argv.filter((argument) => argument !== "--");
}

/** Wrangler configuration is JSONC: whole-line comments and trailing commas only. */
export function parseJsonc(text) {
  return JSON.parse(
    text
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n")
      .replace(/,(\s*[}\]])/gu, "$1"),
  );
}

/** Exactly one explicit target; nothing ever defaults to a remote database. */
export function parseMigrateArguments(argv, cwd = process.cwd()) {
  const args = withoutSeparator(argv);
  let target;
  let persistTo;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--local" || argument === "--remote") {
      if (target !== undefined) throw new UsageError(`Choose exactly one target. ${migrateUsage}`);
      target = argument.slice(2);
    } else if (argument === "--persist-to") {
      const value = args[index + 1];
      if (persistTo !== undefined || value === undefined || value.startsWith("--"))
        throw new UsageError(migrateUsage);
      persistTo = isAbsolute(value) ? value : resolve(cwd, value);
      index += 1;
    } else {
      throw new UsageError(`Unknown argument ${JSON.stringify(argument)}. ${migrateUsage}`);
    }
  }
  if (target === undefined) throw new UsageError(`Choose a target. ${migrateUsage}`);
  if (target === "remote") {
    if (persistTo !== undefined)
      throw new UsageError(`--persist-to applies only to --local. ${migrateUsage}`);
    return Object.freeze({ target });
  }
  return Object.freeze({ persistTo: persistTo ?? defaultPersistDirectory, target });
}

export function parseDevArguments(argv) {
  const args = withoutSeparator(argv);
  for (const argument of args)
    if (argument !== "--kv")
      throw new UsageError(`Unknown argument ${JSON.stringify(argument)}. ${devUsage}`);
  return Object.freeze({ kv: args.includes("--kv") });
}

export function isContinuousIntegration(env) {
  const value = env.CI;
  return value !== undefined && value !== "" && value !== "0" && value.toLowerCase() !== "false";
}

/** The D1 database a remote migration targets; placeholder IDs are refused. */
export function remoteDatabase(config) {
  const database = config.d1_databases?.find((candidate) => candidate.binding === "DB");
  if (database === undefined || typeof database.database_name !== "string")
    throw new UsageError("apps/api/wrangler.jsonc declares no DB D1 database.");
  if (
    typeof database.database_id !== "string" ||
    PLACEHOLDER_DATABASE_ID.test(database.database_id)
  )
    throw new UsageError(
      "apps/api/wrangler.jsonc still has the placeholder D1 database_id. Set the real ID from `wrangler d1 list` before a remote migration.",
    );
  return Object.freeze({ id: database.database_id, name: database.database_name });
}

/** Outside CI a remote migration needs a human at a terminal; CI proceeds unprompted. */
export function remoteConfirmationMode({ env, interactive }) {
  if (isContinuousIntegration(env)) return "skip";
  if (!interactive)
    throw new UsageError(
      "Remote migration needs interactive confirmation outside CI. Run it from a terminal, or set CI=true in a pipeline.",
    );
  return "prompt";
}

export function remoteConfirmationMatches(answer, databaseName) {
  return typeof answer === "string" && answer.trim() === databaseName;
}

/**
 * The generated development Worker configuration. The checked-in production
 * configuration is never edited; admin is served by Vite through the gateway,
 * so the optional ASSETS binding is omitted.
 */
export function developmentWranglerConfig(config, { kv = false } = {}) {
  const { $schema: _schema, assets: _assets, ...rest } = config;
  return {
    ...rest,
    d1_databases: config.d1_databases.map((database) => ({
      ...database,
      ...(database.migrations_dir === undefined
        ? {}
        : { migrations_dir: resolve(apiDirectory, database.migrations_dir) }),
    })),
    ...(kv ? { kv_namespaces: [{ binding: "CACHE", id: "lace-dev-cache" }] } : {}),
    main: resolve(apiDirectory, config.main),
    vars: {
      // Account emails are written to the Worker output; nothing is sent.
      LACE_EMAIL_FROM: "Lace Dev <lace@localhost.test>",
      LACE_EMAIL_PROVIDER: "log",
      ...config.vars,
      LACE_ENVIRONMENT: "development",
      LACE_PUBLIC_BASE_URL: `${developmentOrigin}/`,
    },
  };
}

function under(pathname, prefix) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** API and health paths always reach the Worker; they are never shadowed by a frontend. */
export function routeFor(pathname) {
  if (under(pathname, "/api") || under(pathname, "/health") || pathname === "/__scheduled")
    return "worker";
  if (under(pathname, "/admin")) return "admin";
  return "site";
}
