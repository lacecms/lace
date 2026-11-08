import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { satisfies, valid } from "semver";
import { boundedJson, ProbeError, type DoctorIO } from "./doctor-io.js";
import { apiUrl, type Values } from "./doctor-settings.js";
import type { Observation } from "./doctor-report.js";

export function observation(
  kind: Observation["kind"],
  code: string,
  reason: string,
  nextAction: string,
): Observation {
  return { kind, code, reason, nextAction };
}
export const pass = (reason: string) =>
  observation("pass", "CHECK_PASSED", reason, "Continue with the remaining checks.");
export const skipped = (dependency: string) =>
  observation(
    "skipped",
    "DEPENDENCY_SKIPPED",
    `Not inspected because ${dependency} is unavailable.`,
    `Resolve ${dependency} and repeat doctor for the same target.`,
  );
const unsupportedDatabase = (name: string) =>
  observation(
    "schema",
    "SCHEMA_UNSUPPORTED",
    `The selected ${name} database was migrated by a Lace engine older than the baseline migration.`,
    "Recreate the database for the same target (export its content first if you need to keep it), then run lace db migrate and repeat doctor. Doctor changed nothing.",
  );
export const probeFailed = (name: string) =>
  observation(
    "operation",
    "PROBE_FAILED",
    `The ${name} probe failed, timed out or returned invalid data.`,
    `Check ${name} availability and access, then repeat doctor for the same target.`,
  );

export async function toolVersion(
  io: DoctorIO,
  cwd: string,
  signal: AbortSignal,
  range: string,
): Promise<Observation> {
  try {
    const version = await io.process("pnpm", ["--version"], cwd, signal);
    if (!valid(version)) return probeFailed("pnpm");
    return satisfies(version, range)
      ? pass("Installed pnpm satisfies the project's engine declaration.")
      : observation(
          "config",
          "VERSION_INCOMPATIBLE",
          "Installed pnpm does not satisfy engines.pnpm.",
          "Use a pnpm version compatible with the project's engines.pnpm declaration.",
        );
  } catch {
    return probeFailed("pnpm");
  }
}

export async function wranglerPrerequisite(
  io: DoctorIO,
  cwd: string,
  signal: AbortSignal,
): Promise<Observation> {
  try {
    const manifest = JSON.parse(
      await io.file(resolve(cwd, "node_modules/wrangler/package.json"), signal),
    ) as { name?: unknown; version?: unknown; bin?: { wrangler?: unknown } };
    if (
      manifest.name !== "wrangler" ||
      typeof manifest.version !== "string" ||
      !valid(manifest.version) ||
      typeof manifest.bin?.wrangler !== "string"
    )
      return probeFailed("Wrangler");
    const executable = resolve(cwd, "node_modules/wrangler", manifest.bin.wrangler);
    if (!executable.startsWith(`${resolve(cwd, "node_modules/wrangler")}/`))
      return probeFailed("Wrangler");
    await io.file(executable, signal);
    return pass(
      "Project-local Wrangler package and executable are installed; no process was started.",
    );
  } catch {
    return probeFailed("Wrangler");
  }
}

export async function bindingPrerequisite(
  io: DoctorIO,
  cwd: string,
  values: Values,
  signal: AbortSignal,
): Promise<Observation> {
  try {
    const text = await io.file(resolve(cwd, values.LACE_WRANGLER_CONFIG as string), signal);
    const config = JSON.parse(
      text
        .split("\n")
        .filter((line) => !line.trim().startsWith("//"))
        .join("\n")
        .replace(/,(\s*[}\]])/gu, "$1"),
    ) as { d1_databases?: { binding?: string; database_id?: string }[] };
    if (
      !Array.isArray(config.d1_databases) ||
      config.d1_databases.find((entry) => entry?.binding === "DB")?.database_id !==
        values.LACE_D1_DATABASE_ID
    )
      throw new ProbeError("response");
    return pass("The selected Wrangler DB binding matches LACE_D1_DATABASE_ID.");
  } catch {
    return observation(
      "config",
      "BINDING_INVALID",
      "The selected Wrangler configuration has no matching CMS DB binding.",
      "Set LACE_WRANGLER_CONFIG to a valid CMS Worker configuration whose DB binding matches LACE_D1_DATABASE_ID; a Pages-only template does not configure the CMS.",
    );
  }
}

export async function nodeMigrations(
  io: DoctorIO,
  cwd: string,
  values: Values,
  signal: AbortSignal,
): Promise<Observation> {
  const recovery =
    "Run lace db migrate --target node explicitly with the same settings, then repeat doctor.";
  try {
    const result = await io.process(
      process.execPath,
      [
        "--disable-warning=ExperimentalWarning",
        fileURLToPath(new URL("./doctor-sqlite.js", import.meta.url)),
        resolve(cwd, values.LACE_DATABASE_PATH as string),
      ],
      cwd,
      signal,
    );
    if (result === "current")
      return pass("The existing SQLite ledger contains every packaged migration.");
    if (result === "unsupported") return unsupportedDatabase("SQLite");
    if (result === "missing" || result === "outdated")
      return observation(
        "unfinished",
        "MIGRATIONS_PENDING",
        "The selected SQLite database is absent or its migration ledger is incomplete.",
        recovery,
      );
    const explanations: Record<string, readonly [string, string]> = {
      permission: [
        "SQLite read access was denied.",
        "Check permissions for LACE_DATABASE_PATH and its parent directories, then retry.",
      ],
      locked: [
        "SQLite is locked by another operation.",
        "Wait for the current database operation to finish and retry.",
      ],
      "unsafe-wal": [
        "SQLite WAL cannot be inspected without risking changes to journal sidecars.",
        "Review the separate API readiness check. For an independent ledger check, stop all database users and explicitly checkpoint and switch to rollback journal mode using the operations guide; doctor will not change journal mode.",
      ],
      invalid: [
        "The selected SQLite file cannot be safely inspected.",
        "Check LACE_DATABASE_PATH file type, integrity and read permissions, then retry.",
      ],
    };
    const [reason, nextAction] = explanations[result] ?? [
      "SQLite inspection returned invalid data.",
      "Check the selected SQLite installation and retry.",
    ];
    return observation("operation", "DATABASE_UNAVAILABLE", reason, nextAction);
  } catch {
    return probeFailed("SQLite");
  }
}

export async function remoteMigrations(
  io: DoctorIO,
  values: Values,
  signal: AbortSignal,
): Promise<Observation> {
  try {
    const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(values.CLOUDFLARE_ACCOUNT_ID as string)}/d1/database/${encodeURIComponent(values.LACE_D1_DATABASE_ID as string)}/query`;
    const response = await io.request(endpoint, {
      method: "POST",
      redirect: "error",
      signal,
      headers: {
        authorization: `Bearer ${values.CLOUDFLARE_API_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ batch: [{ sql: "select name from d1_migrations", params: [] }] }),
    });
    if (response.status === 401 || response.status === 403) {
      await response.body?.cancel();
      return observation(
        "operation",
        "D1_AUTHORIZATION",
        "Cloudflare rejected D1 authorization.",
        "Review CLOUDFLARE_API_TOKEN permissions and the selected account/database settings privately, then retry the same target.",
      );
    }
    const body = (await boundedJson(response, signal)) as {
      success?: unknown;
      errors?: { message?: unknown }[];
      result?: { success?: unknown; results?: { name?: unknown }[] }[];
    };
    if (
      Array.isArray(body?.errors) &&
      body.errors.some(
        (error) =>
          typeof error.message === "string" &&
          /\bno such table: (?:main\.)?d1_migrations\b/u.test(error.message),
      )
    )
      return observation(
        "unfinished",
        "MIGRATIONS_PENDING",
        "The selected D1 migration ledger is missing.",
        "Run lace db migrate --target cloudflare-remote explicitly with the same settings.",
      );
    if (
      !response.ok ||
      body?.success !== true ||
      !Array.isArray(body.result) ||
      body.result.length !== 1 ||
      body.result[0]?.success !== true ||
      !Array.isArray(body.result[0].results) ||
      body.result[0].results.some((row) => typeof row?.name !== "string")
    )
      return probeFailed("D1 response");
    const { checkedInMigrations, uncheckedD1Migrations } = await import("@lacecms/platform-node");
    const names = body.result[0].results.map((row) => row.name as string);
    if (uncheckedD1Migrations(names).length > 0) return unsupportedDatabase("D1");
    const installed = new Set(names);
    return checkedInMigrations.every((item) => installed.has(item.name))
      ? pass("The selected remote D1 ledger contains every packaged migration.")
      : observation(
          "unfinished",
          "MIGRATIONS_PENDING",
          "The selected D1 migration ledger is incomplete.",
          "Run lace db migrate --target cloudflare-remote explicitly with the same settings.",
        );
  } catch {
    return probeFailed("D1");
  }
}

function unreachable(error: unknown): boolean {
  if (error instanceof ProbeError) return error.kind === "timeout";
  if (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)) return true;
  const code = (error as { cause?: { code?: string } } | null)?.cause?.code;
  return [
    "ECONNREFUSED",
    "ENOTFOUND",
    "EAI_AGAIN",
    "ETIMEDOUT",
    "UND_ERR_CONNECT_TIMEOUT",
  ].includes(code ?? "");
}
export async function apiReadiness(
  io: DoctorIO,
  values: Values,
  signal: AbortSignal,
): Promise<Observation> {
  try {
    const response = await io.request(new URL("health/ready", apiUrl(values.LACE_API_BASE_URL)), {
      redirect: "error",
      signal,
    });
    const body = (await boundedJson(response, signal)) as { status?: unknown };
    if (response.status === 200 && body?.status === "ready" && Object.keys(body).length === 1)
      return pass(
        "The selected API reports readiness; this does not verify content sync, storage or deployment.",
      );
    if (response.status === 503 && body?.status === "not_ready")
      return observation(
        "operation",
        "API_NOT_READY",
        "The selected API is reachable but reports not ready.",
        "Check the selected API's configuration and migration state before retrying.",
      );
    return probeFailed("API response");
  } catch (error) {
    return unreachable(error)
      ? observation(
          "unfinished",
          "API_UNREACHABLE",
          "The selected API is unavailable; it may not yet be started.",
          "Check the selected API origin and connectivity, or explicitly start the intended service, then repeat doctor.",
        )
      : probeFailed("API transport");
  }
}
