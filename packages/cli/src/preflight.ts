import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { loadEnvironment, type CliEnvironment } from "./index.js";
import { boundedFile, boundedJson, probeLimit, reportLimit } from "./doctor-io.js";
import { resolveOperatorEnvironment } from "./operator-environment.js";
import type { Values } from "./doctor-settings.js";
import type { PreflightOptions } from "./preflight-options.js";

type Source =
  | "process"
  | "operator-file"
  | "dotenv"
  | "dotenv-local"
  | "oauth-candidate"
  | "absent";
interface Check {
  readonly id: string;
  readonly status: "pass" | "fail" | "skipped" | "unverified";
  readonly reason: string;
  readonly nextAction: string;
}
interface Runtime {
  readonly cwd?: string;
  readonly environment?: Values;
  readonly file?: typeof boundedFile;
  readonly request?: typeof fetch;
  readonly probeMs?: number;
  readonly reportMs?: number;
}
class PreflightFailure extends Error {
  constructor(
    readonly reason: string,
    readonly nextAction: string,
    readonly exitCode = 4,
  ) {
    super("Preflight failed.");
  }
}
const recover =
  "Review the named settings privately for the same explicit account/database and retry preflight.";
const tokenRecovery =
  "Move the operator token to the private operator file, remove CLOUDFLARE_API_TOKEN assignments from both .env and .env.local, clear the inherited token, and repeat OAuth preflight before wrangler whoami.";
const verifyWrangler =
  "From the CMS root run the project-pinned wrangler whoami with the intended account, then review Workers/Pages permissions before deploy or secret commands. OAuth login and write permissions remain unverified.";
const unsupported = [
  "CLOUDFLARE_API_KEY",
  "CLOUDFLARE_EMAIL",
  "CLOUDFLARE_ENV",
  "WRANGLER_PROFILE",
  "CLOUDFLARE_PROFILE",
  "WRANGLER_ENV",
  "CLOUDFLARE_API_BASE_URL",
  "CLOUDFLARE_BASE_URL",
  "CLOUDFLARE_COMPLIANCE_REGION",
];

/** Fixed read-only checks. Never launch Wrangler or touch OAuth state. */
export async function runPreflight(options: PreflightOptions, runtime: Runtime = {}) {
  const cwd = runtime.cwd ?? process.cwd();
  const environment = runtime.environment ?? process.env;
  const file = runtime.file ?? boundedFile;
  const overall = AbortSignal.timeout(
    Math.max(1, Math.min(runtime.reportMs ?? reportLimit, reportLimit)),
  );
  const run = async <T>(work: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    const signal = AbortSignal.any([
      overall,
      AbortSignal.timeout(Math.max(1, Math.min(runtime.probeMs ?? probeLimit, probeLimit))),
    ]);
    signal.throwIfAborted();
    let abort: () => void = () => undefined;
    const cancelled = new Promise<never>((_, reject) => {
      abort = () => reject(new Error("Probe cancelled."));
      signal.addEventListener("abort", abort, { once: true });
    });
    try {
      return await Promise.race([work(signal), cancelled]);
    } finally {
      signal.removeEventListener("abort", abort);
    }
  };
  let accountId: string | null = null;
  let laceSource: Source = "absent";
  let wranglerSource: Source = "absent";
  let sameToken: boolean | null = null;
  let settings: CliEnvironment | undefined;
  let exitCode = 0;
  const checks: Check[] = [];
  const fail = (id: string, error: unknown, config = true) => {
    const failure =
      error instanceof PreflightFailure
        ? error
        : new PreflightFailure(
            config
              ? "Selected configuration could not be safely inspected."
              : "The D1 probe failed, timed out or returned invalid data.",
            config
              ? recover
              : "Check D1 connectivity and selected account/database access, then retry.",
            config ? 4 : 6,
          );
    exitCode = exitCode === 0 ? failure.exitCode : Math.min(exitCode, failure.exitCode);
    checks.push({ id, status: "fail", reason: failure.reason, nextAction: failure.nextAction });
  };
  try {
    const selected = await run((signal) =>
      resolveOperatorEnvironment(options.operatorEnv, environment, cwd, signal),
    );
    laceSource = selected.tokenSource;
    settings = loadEnvironment("cloudflare-remote", selected.values);
    if (!/^[a-fA-F0-9]{32}$/u.test(settings.accountId ?? ""))
      throw new PreflightFailure(
        "CLOUDFLARE_ACCOUNT_ID must be a 32-character hexadecimal account ID.",
        recover,
      );
    accountId = settings.accountId!;
    if (
      !settings.wranglerConfig ||
      !/^[a-zA-Z0-9_-]+$/u.test(settings.databaseId ?? "") ||
      settings.databaseId === "00000000-0000-0000-0000-000000000000"
    )
      throw new PreflightFailure(
        "LACE_WRANGLER_CONFIG and a non-placeholder LACE_D1_DATABASE_ID are required.",
        recover,
      );
    const text = await run((signal) => file(resolve(cwd, settings!.wranglerConfig!), signal));
    const config = JSON.parse(
      text
        .split("\n")
        .filter((line) => !line.trim().startsWith("//"))
        .join("\n")
        .replace(/,(\s*[}\]])/gu, "$1"),
    ) as { account_id?: unknown; d1_databases?: { binding?: string; database_id?: string }[] };
    if (
      !Array.isArray(config.d1_databases) ||
      config.d1_databases.find((row) => row?.binding === "DB")?.database_id !==
        settings.databaseId ||
      (config.account_id !== undefined && config.account_id !== accountId)
    )
      throw new PreflightFailure(
        "Worker DB binding or configured account does not match the selected remote target.",
        recover,
      );
    checks.push({
      id: "selection",
      status: "pass",
      reason: "Explicit Lace account/database and Worker binding agree.",
      nextAction: "Continue credential-source checks.",
    });
  } catch (error) {
    fail("selection", error);
    settings = undefined;
  }
  let sourcesOk = false;
  try {
    const dotenv: Values[] = [];
    for (const name of [".env", ".env.local"]) {
      try {
        dotenv.push(parseEnv(await run((signal) => file(resolve(cwd, name), signal))));
      } catch (error) {
        if ((error as { code?: string })?.code === "ENOENT") dotenv.push({});
        else throw error;
      }
    }
    const inputs = [environment, dotenv[1]!, dotenv[0]!];
    const sources = ["process", "dotenv-local", "dotenv"] as const;
    if (inputs.some((values) => unsupported.some((name) => values[name]?.trim())))
      throw new PreflightFailure(
        "Alternate authentication, provider overrides or environment/profile selectors are unsupported by default-root preflight.",
        "Remove alternate selectors or diagnose the named workflow separately; preflight covers only the CMS root/default environment.",
      );
    const tokenIndex = inputs.findIndex((values) => values.CLOUDFLARE_API_TOKEN !== undefined);
    const token = tokenIndex < 0 ? undefined : inputs[tokenIndex]!.CLOUDFLARE_API_TOKEN;
    wranglerSource = token?.trim()
      ? sources[tokenIndex]!
      : options.wranglerAuth === "oauth"
        ? "oauth-candidate"
        : "absent";
    if (
      options.wranglerAuth === "oauth" &&
      inputs.some((values) => values.CLOUDFLARE_API_TOKEN?.trim())
    ) {
      const shadowIndex = inputs.findIndex((values) => values.CLOUDFLARE_API_TOKEN?.trim());
      wranglerSource = sources[shadowIndex]!;
      throw new PreflightFailure(
        `An API token from ${wranglerSource} would override or risk reloading over OAuth.`,
        tokenRecovery,
      );
    }
    if (options.wranglerAuth === "token" && !token?.trim())
      throw new PreflightFailure(
        "The intended Wrangler API token is absent from its process/default-root inputs.",
        "Load the intended token explicitly for this invocation; do not assume Wrangler loads --operator-env. Then repeat token preflight.",
      );
    if (
      accountId &&
      inputs.some(
        (values) =>
          values.CLOUDFLARE_ACCOUNT_ID?.trim() && values.CLOUDFLARE_ACCOUNT_ID !== accountId,
      )
    )
      throw new PreflightFailure(
        "Wrangler account selection conflicts with the selected Lace account.",
        "Align CLOUDFLARE_ACCOUNT_ID in the process and default dotenv inputs with the intended account, then repeat preflight.",
      );
    sameToken = settings && token ? token === settings.apiToken : null;
    checks.push({
      id: "credential-sources",
      status: "pass",
      reason:
        "Credential sources match the chosen Wrangler authentication mode; login and write permissions are unverified.",
      nextAction: verifyWrangler,
    });
    sourcesOk = true;
  } catch (error) {
    fail("credential-sources", error);
  }
  if (settings && sourcesOk) {
    try {
      await run(async (signal) => {
        const response = await (runtime.request ?? fetch)(
          `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(settings!.accountId!)}/d1/database/${encodeURIComponent(settings!.databaseId!)}/query`,
          {
            method: "POST",
            redirect: "error",
            signal,
            headers: {
              authorization: `Bearer ${settings!.apiToken}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({ batch: [{ sql: "SELECT 1", params: [] }] }),
          },
        );
        if (response.status === 401 || response.status === 403) {
          await response.body?.cancel();
          throw new PreflightFailure(
            "Cloudflare rejected the selected D1 authorization.",
            "Review the D1 token's account scope and D1 permissions before remote migrate/sync/bootstrap, then retry the same explicit target.",
            6,
          );
        }
        const body = (await boundedJson(response, signal)) as {
          success?: unknown;
          result?: { success?: unknown; results?: Record<string, unknown>[] }[];
        };
        if (
          !response.ok ||
          body?.success !== true ||
          !Array.isArray(body.result) ||
          body.result.length !== 1 ||
          body.result[0]?.success !== true ||
          !Array.isArray(body.result[0].results) ||
          body.result[0].results.length !== 1 ||
          body.result[0].results[0]?.["1"] !== 1
        )
          throw new Error("Invalid probe result.");
      });
      checks.push({
        id: "d1-access",
        status: "pass",
        reason:
          "The selected D1 endpoint accepted the read-only SELECT 1; write permissions and migration state are unverified.",
        nextAction:
          "Run remote operator commands explicitly for this target after permission review.",
      });
    } catch (error) {
      fail("d1-access", error, false);
    }
  } else
    checks.push({
      id: "d1-access",
      status: "skipped",
      reason: "Selection or credential-source prerequisites failed.",
      nextAction: "Resolve failed prerequisites and repeat preflight.",
    });
  checks.push({
    id: "wrangler-authorization",
    status: "unverified",
    reason:
      "OAuth login, account membership and Workers/Pages write permissions were not inspected.",
    nextAction: verifyWrangler,
  });
  const first = checks.find((check) => check.status === "fail");
  const report = {
    ok: exitCode === 0,
    code: exitCode === 0 ? "PREFLIGHT_OK" : exitCode === 4 ? "CONFIG" : "OPERATION_FAILED",
    message:
      exitCode === 0
        ? "Read-only preflight checks completed."
        : "Preflight found failed prerequisites.",
    operation: "cloudflare preflight",
    reason:
      first?.reason ??
      "Applicable read-only checks passed; Wrangler authorization remains unverified.",
    nextAction: first?.nextAction ?? verifyWrangler,
    data: {
      target: "cloudflare-remote",
      scope: "cms-root/default-environment",
      wranglerAuth: options.wranglerAuth,
      accountId,
      laceSource,
      wranglerSource,
      sameToken,
      checks,
    },
  };
  return {
    report,
    exitCode,
    output: options.json
      ? JSON.stringify(report)
      : `${report.message}\nSelected account: ${accountId ?? "unavailable"}\nLace source: ${laceSource}; Wrangler source: ${wranglerSource}\n${checks.map((check) => `[${check.status}] ${check.id}: ${check.reason}\n  Next: ${check.nextAction}`).join("\n")}`,
  };
}
