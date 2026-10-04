import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { satisfies, validRange } from "semver";
import {
  doctorReport,
  type DoctorOptions,
  type CheckId,
  type Observation,
} from "./doctor-report.js";
import { doctorIO, ProbeError, probeLimit, reportLimit, type DoctorIO } from "./doctor-io.js";
import { apiUrl, invalidSettings, type Values } from "./doctor-settings.js";
import {
  apiReadiness,
  bindingPrerequisite,
  nodeMigrations,
  observation,
  pass,
  probeFailed,
  remoteMigrations,
  skipped,
  toolVersion,
  wranglerPrerequisite,
} from "./doctor-probes.js";
import { siteCheck } from "./doctor-site.js";

/** Probe races are bounded even when an injected dependency ignores its signal. */
async function deadline<T>(
  work: (signal: AbortSignal) => Promise<T>,
  overall: AbortSignal,
  ms: number,
): Promise<T> {
  if (overall.aborted) throw new ProbeError("timeout");
  const controller = new AbortController();
  let cancel: () => void = () => undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    cancel = () => {
      controller.abort();
      reject(new ProbeError("timeout"));
    };
    overall.addEventListener("abort", cancel, { once: true });
    timer = setTimeout(cancel, ms);
  });
  try {
    return await Promise.race([timeout, work(controller.signal)]);
  } finally {
    clearTimeout(timer);
    overall.removeEventListener("abort", cancel);
  }
}

export interface DoctorRuntime {
  readonly cwd?: string;
  readonly environment?: Values;
  readonly io?: DoctorIO;
  // Shortened budgets for deterministic cancellation tests; never increase production limits.
  readonly probeMs?: number;
  readonly reportMs?: number;
}

export async function runDoctor(options: DoctorOptions, runtime: DoctorRuntime = {}) {
  const cwd = runtime.cwd ?? process.cwd();
  const io = runtime.io ?? doctorIO;
  const overall = new AbortController();
  const overallTimer = setTimeout(
    () => overall.abort(),
    Math.min(runtime.reportMs ?? reportLimit, reportLimit),
  );
  const ms = Math.min(runtime.probeMs ?? probeLimit, probeLimit);
  const run = <T>(work: (signal: AbortSignal) => Promise<T>) => deadline(work, overall.signal, ms);
  const observations = new Map<CheckId, Observation>();
  const probe = async (id: CheckId, work: (signal: AbortSignal) => Promise<Observation>) => {
    try {
      observations.set(id, await run(work));
    } catch {
      observations.set(id, probeFailed(id));
    }
  };
  let values: Values = runtime.environment ?? process.env;
  try {
    let project: { engines: { node: string; pnpm: string } } | undefined;
    try {
      const input = JSON.parse(
        await run((signal) => io.file(resolve(cwd, "package.json"), signal)),
      ) as { engines?: { node?: unknown; pnpm?: unknown } };
      if (
        typeof input?.engines?.node !== "string" ||
        typeof input.engines.pnpm !== "string" ||
        !input.engines.node.trim() ||
        !input.engines.pnpm.trim() ||
        !validRange(input.engines.node) ||
        !validRange(input.engines.pnpm)
      )
        throw new ProbeError("response");
      project = input as typeof project;
      observations.set("project", pass("Project engine declarations are valid."));
    } catch {
      observations.set(
        "project",
        observation(
          "config",
          "PROJECT_INVALID",
          "Project package.json or engines.node/engines.pnpm is missing, invalid or unreadable.",
          "Provide a regular package.json with valid engines.node and engines.pnpm declarations, then repeat doctor.",
        ),
      );
    }
    let environmentValid = true;
    try {
      const content = await run((signal) => io.file(resolve(cwd, ".env"), signal));
      values = { ...parseEnv(content), ...values };
    } catch (error) {
      if ((error as { code?: string })?.code !== "ENOENT") {
        environmentValid = false;
        observations.set(
          "settings",
          observation(
            "config",
            "ENVIRONMENT_UNREADABLE",
            "The root .env cannot be safely read.",
            "Retain existing credentials; check .env regular-file type, size and read permissions before retrying.",
          ),
        );
      }
    }
    if (project) {
      const compatible = satisfies(io.nodeVersion, project.engines.node);
      observations.set(
        "node",
        compatible
          ? pass("Installed Node satisfies the project's engine declaration.")
          : observation(
              "config",
              "VERSION_INCOMPATIBLE",
              "Installed Node does not satisfy engines.node.",
              "Use a Node version compatible with the project's engines.node declaration.",
            ),
      );
      await probe("pnpm", (signal) => toolVersion(io, cwd, signal, project.engines.pnpm));
    } else {
      observations.set("node", skipped("project"));
      observations.set("pnpm", skipped("project"));
    }
    if (environmentValid) {
      try {
        const names = await run(() => invalidSettings(options, values, cwd));
        observations.set(
          "settings",
          names.length === 0
            ? pass("Required selected-target settings are valid.")
            : observation(
                "config",
                "SETTINGS_INVALID",
                `Missing or invalid settings: ${names.join(", ")}.`,
                "Review the named settings privately for the selected target and mode, then repeat doctor.",
              ),
        );
      } catch {
        observations.set(
          "settings",
          observation(
            "config",
            "SETTINGS_INVALID",
            "Selected-target settings could not be validated.",
            "Review selected-target configuration and installed runtime packages, then retry.",
          ),
        );
      }
    }
    const settingsOk = observations.get("settings")?.kind === "pass";
    const tasks: Promise<void>[] = [probe("site", (signal) => siteCheck(io, cwd, signal))];
    if (options.mode === "compose")
      tasks.push(
        (async () => {
          await probe("docker-compose", async (signal) => {
            const version = await io.process(
              "docker",
              ["compose", "version", "--short"],
              cwd,
              signal,
            );
            return /^v?\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/u.test(version)
              ? pass("Docker Compose is installed.")
              : probeFailed("Docker Compose");
          });
          if (observations.get("docker-compose")?.kind !== "pass")
            observations.set("docker-daemon", skipped("docker-compose"));
          else
            await probe("docker-daemon", async (signal) => {
              const version = await io.process(
                "docker",
                ["info", "--format", "{{.ServerVersion}}"],
                cwd,
                signal,
              );
              return /^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/u.test(version)
                ? pass("Docker daemon is available; no service was started.")
                : probeFailed("Docker daemon");
            });
        })(),
      );
    if (options.target !== "node") {
      tasks.push(probe("wrangler", (signal) => wranglerPrerequisite(io, cwd, signal)));
      if (settingsOk)
        tasks.push(
          probe("cloudflare-binding", (signal) => bindingPrerequisite(io, cwd, values, signal)),
        );
      else observations.set("cloudflare-binding", skipped("settings"));
    }
    const transportValid =
      environmentValid && !!apiUrl(values.LACE_API_BASE_URL, options.target === "cloudflare-local");
    if (transportValid)
      tasks.push(probe("api-readiness", (signal) => apiReadiness(io, values, signal)));
    else observations.set("api-readiness", skipped("settings"));
    if (options.target === "node") {
      if (settingsOk)
        tasks.push(probe("migrations", (signal) => nodeMigrations(io, cwd, values, signal)));
      else observations.set("migrations", skipped("settings"));
    }
    observations.set(
      "build-token",
      environmentValid
        ? values.LACE_BUILD_TOKEN?.trim()
          ? observation(
              "pass",
              "TOKEN_PRESENT",
              "LACE_BUILD_TOKEN is present but unverified.",
              "Keep the token private; presence does not prove authorization or a successful build.",
            )
          : observation(
              "unfinished",
              "TOKEN_MISSING",
              "LACE_BUILD_TOKEN is empty or absent.",
              "After first-admin setup, issue a read-only build token in Admin Settings and store it privately.",
            )
        : skipped("settings"),
    );
    await Promise.all(tasks);
    if (options.target === "cloudflare-remote") {
      if (settingsOk && observations.get("cloudflare-binding")?.kind === "pass")
        await probe("migrations", (signal) => remoteMigrations(io, values, signal));
      else observations.set("migrations", skipped(settingsOk ? "cloudflare-binding" : "settings"));
    } else if (options.target === "cloudflare-local") {
      const api = observations.get("api-readiness");
      if (
        settingsOk &&
        observations.get("cloudflare-binding")?.kind === "pass" &&
        api?.kind === "pass"
      )
        observations.set(
          "migrations",
          pass(
            "Migration readiness is API-derived from the selected Worker's readiness contract; the offline ledger was not inspected.",
          ),
        );
      else
        observations.set(
          "migrations",
          skipped(
            !settingsOk
              ? "settings"
              : observations.get("cloudflare-binding")?.kind !== "pass"
                ? "cloudflare-binding"
                : "api-readiness (offline D1 ledger was not inspected)",
          ),
        );
    }
    return doctorReport(options, observations);
  } finally {
    clearTimeout(overallTimer);
  }
}
