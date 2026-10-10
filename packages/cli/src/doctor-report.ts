import { CliError, EXIT, type Target } from "./index.js";

export const doctorUsage =
  "Usage: lace doctor --target node|cloudflare-local|cloudflare-remote --stage setup|ready [--mode native|compose] [--json]";
export interface DoctorOptions {
  readonly target: Target;
  readonly stage: "setup" | "ready";
  readonly mode: "native" | "compose" | null;
  readonly json: boolean;
}

export function parseDoctorArguments(argv: readonly string[]): DoctorOptions {
  const values = new Map<string, string>();
  let json = false;
  const invalid = () => new CliError("USAGE", doctorUsage, EXIT.USAGE);
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === "--json") {
      if (json) throw invalid();
      json = true;
    } else if (flag === "--target" || flag === "--stage" || flag === "--mode") {
      const value = argv[++i];
      if (!value || values.has(flag)) throw invalid();
      values.set(flag, value);
    } else throw invalid();
  }
  const target = values.get("--target");
  const stage = values.get("--stage");
  const mode = values.get("--mode");
  if (
    !target ||
    !["node", "cloudflare-local", "cloudflare-remote"].includes(target) ||
    !stage ||
    !["setup", "ready"].includes(stage) ||
    (mode !== undefined && (target !== "node" || !["native", "compose"].includes(mode)))
  )
    throw invalid();
  return {
    target: target as Target,
    stage: stage as DoctorOptions["stage"],
    mode: target === "node" ? ((mode ?? "native") as DoctorOptions["mode"]) : null,
    json,
  };
}

export const checkOrder = [
  "project",
  "node",
  "pnpm",
  "settings",
  "email",
  "site",
  "docker-compose",
  "docker-daemon",
  "wrangler",
  "cloudflare-binding",
  "migrations",
  "api-readiness",
  "build-token",
] as const;
export type CheckId = (typeof checkOrder)[number];
export interface DoctorCheck {
  readonly id: CheckId;
  readonly status: "pass" | "expected" | "fail" | "skipped";
  readonly code: string;
  readonly reason: string;
  readonly nextAction: string;
}
export interface Observation {
  readonly code: string;
  readonly reason: string;
  readonly nextAction: string;
  readonly kind: "pass" | "unfinished" | "config" | "schema" | "operation" | "skipped";
}

export function doctorReport(
  options: DoctorOptions,
  observations: ReadonlyMap<CheckId, Observation>,
) {
  let exitCode: number = EXIT.OK;
  const checks: DoctorCheck[] = checkOrder.map((id) => {
    const item = observations.get(id) ?? {
      kind: "skipped",
      code: "NOT_APPLICABLE",
      reason: "This check does not apply to the selected mode.",
      nextAction: "Continue with the applicable checks.",
    };
    const status =
      item.kind === "pass"
        ? "pass"
        : item.kind === "skipped"
          ? "skipped"
          : item.kind === "unfinished" && options.stage === "setup"
            ? "expected"
            : "fail";
    if (status === "fail") {
      const code =
        item.kind === "config"
          ? EXIT.CONFIG
          : item.kind === "schema" || (item.kind === "unfinished" && id === "migrations")
            ? EXIT.SCHEMA
            : EXIT.OPERATION;
      exitCode = exitCode === 0 ? code : Math.min(exitCode, code);
    }
    return { id, status, code: item.code, reason: item.reason, nextAction: item.nextAction };
  });
  const failed = checks.find((check) => check.status === "fail");
  const report = {
    ok: exitCode === EXIT.OK,
    code: exitCode === EXIT.OK ? "DOCTOR_OK" : "DOCTOR_FAILED",
    message:
      exitCode === EXIT.OK
        ? "Environment checks completed."
        : "Environment checks found failed prerequisites.",
    operation: "doctor",
    reason: failed?.reason ?? "Applicable checks passed or identify expected setup steps.",
    nextAction:
      failed?.nextAction ?? "Follow any expected setup steps before checking the ready stage.",
    data: { target: options.target, stage: options.stage, mode: options.mode, checks },
  };
  const output = options.json
    ? JSON.stringify(report)
    : `${report.message}\nOperation: doctor\n${checks.map((check) => `[${check.status}] ${check.id}: ${check.reason}\n  Recovery: ${check.nextAction}`).join("\n")}`;
  return { report, output, exitCode };
}
