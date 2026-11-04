import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertExecutedTests,
  packageRun,
  rootRun,
  runPhaseSteps,
  runPhases,
  vitestPhase,
} from "./cross-runtime-verification.mjs";

export async function ownedCommand(command, args, { signal, env = {} } = {}) {
  await new Promise((done, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      detached: process.platform !== "win32",
      env: { ...process.env, ...env },
    });
    let interrupted = false;
    const stop = () => {
      interrupted = true;
      try {
        if (process.platform === "win32") child.kill("SIGTERM");
        else process.kill(-child.pid, "SIGTERM");
      } catch (error) {
        if (error.code !== "ESRCH") reject(error);
      }
    };
    signal?.addEventListener("abort", stop, { once: true });
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    const release = () => {
      signal?.removeEventListener("abort", stop);
      process.removeListener("SIGINT", stop);
      process.removeListener("SIGTERM", stop);
    };
    child.once("error", () => {
      release();
      reject(new Error(`Could not start required command: ${command}`));
    });
    child.once("exit", (code, cause) => {
      release();
      if (code === 0 && !interrupted) done();
      else
        reject(
          new Error(
            `Required command failed: ${command} (${cause ?? code}${interrupted ? ", interrupted" : ""})`,
          ),
        );
    });
    if (signal?.aborted) stop();
  });
}
export async function executeRequiredPhases(phases, run, save) {
  assert.ok(phases.length > 0, "required phase list is empty");
  assert.equal(
    new Set(phases.map((phase) => phase.name)).size,
    phases.length,
    "duplicate required phase",
  );
  return runPhases(
    phases,
    async (phase) => {
      assert.ok(
        phase.name && (phase.run || phase.steps || (phase.command && phase.args)),
        "required phase is unavailable",
      );
      if (phase.steps) await runPhaseSteps(phase, run);
      else await run(phase);
      if (phase.testReport)
        assertExecutedTests(JSON.parse(await readFile(phase.testReport, "utf8")));
    },
    save,
  );
}
export async function main() {
  await mkdir(".lace-acceptance", { recursive: true });
  const output = await mkdtemp(resolve(".lace-acceptance/verify-security-"));
  const provenance = {
    recordedAt: new Date().toISOString(),
    scope: "local source only",
    source: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    workingTree: execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim()
      ? "dirty"
      : "clean",
    node: process.version,
    pnpm: execFileSync("pnpm", ["--version"], { encoding: "utf8" }).trim(),
  };
  const phase = (name, runs, extraArgs) => vitestPhase(output, name, runs, extraArgs);
  const phases = [
    {
      name: "local-prerequisites",
      async run() {
        assert.ok(
          process.env.LACE_VERIFY_API_IMAGE && process.env.LACE_VERIFY_BUILDER_IMAGE,
          "explicit local Compose fixture images are required",
        );
        await ownedCommand("docker", ["info", "--format", "{{.ServerVersion}}"]);
        const require = createRequire(new URL("../apps/admin/package.json", import.meta.url));
        const browser = await require("@playwright/test").chromium.launch({ headless: true });
        await browser.close();
      },
    },
    {
      name: "workspace-build",
      command: "pnpm",
      args: [
        "exec",
        "turbo",
        "run",
        "build",
        "--filter=@lacecms/app-api",
        "--filter=@lacecms/cli",
        "--filter=@lacecms/test-utils",
        "--filter=@lacecms/sdk",
        "--filter=@lacecms/render",
        "--filter=@lacecms/astro",
        "--output-logs=errors-only",
      ],
    },
    phase(
      "security",
      [
        rootRun(
          "tests/security-boundary.test.mjs",
          "tests/cli-database-safety.test.mjs",
          "tests/consumer-security.test.mjs",
        ),
        packageRun("packages/auth/src"),
        packageRun(
          "packages/platform-node/src/client-address.test.ts",
          "packages/platform-node/src/host-database-safety.test.ts",
          "packages/platform-node/src/image-inspector.test.ts",
          "packages/platform-node/src/index.test.ts",
        ),
        packageRun("packages/platform-cloudflare/src/image-inspector.test.ts"),
        packageRun("packages/test-utils/src/index.test.ts"),
        packageRun("packages/render/src"),
        packageRun("apps/builder/src/runner.test.ts"),
      ],
      ["--maxWorkers=2"],
    ),
    phase(
      "repositories",
      [
        packageRun(
          "packages/platform-node/src/repository-contract.test.ts",
          "packages/platform-node/src/security-contract.test.ts",
        ),
        packageRun(
          "packages/platform-cloudflare/src/repository-contract.test.ts",
          "packages/platform-cloudflare/src/security-contract.test.ts",
        ),
        rootRun("tests/durable-restart.test.mjs"),
      ],
      ["--maxWorkers=2"],
    ),
    phase(
      "provider",
      [
        packageRun(
          "packages/platform-cloudflare/src/deploy-hook.test.ts",
          "packages/platform-cloudflare/src/pages-deployments.test.ts",
          "packages/platform-cloudflare/src/worker.test.ts",
        ),
        packageRun(
          "--packaged",
          "packages/platform-cloudflare/src/worker-assets.packaged.test.mjs",
          "packages/platform-cloudflare/src/worker-internal-links.packaged.test.mjs",
        ),
        packageRun("packages/application/src"),
      ],
      ["--maxWorkers=2"],
    ),
    { name: "compose-host-safety", command: "node", args: ["scripts/compose-database-safety.mjs"] },
    phase("storage-and-admin-recovery", [
      rootRun("--config", "vitest.verification.config.mjs", "--project", "resilience"),
    ]),
    phase("static-secret-exclusion", [
      rootRun("--config", "vitest.verification.config.mjs", "--project", "security-static"),
    ]),
    phase("d1-http-budgets", [
      rootRun("--config", "vitest.verification.config.mjs", "--project", "d1-budgets"),
    ]),
    {
      name: "dependency-audit",
      command: "node",
      args: ["scripts/dependency-audit.mjs", "--output", join(output, "dependency-audit.json")],
    },
  ];
  console.info(`Security report: ${output}/result.json`);
  await executeRequiredPhases(
    phases,
    async (item) => {
      console.info(`Security phase: ${item.name}`);
      if (item.run) await item.run();
      else await ownedCommand(item.command, item.args);
    },
    (report) =>
      writeFile(
        join(output, "result.json"),
        JSON.stringify({ ...provenance, ...report }, null, 2) + "\n",
      ),
  );
  console.info(
    "Security local source suite passed; exact artifacts and real deployment acceptance are separate gates.",
  );
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
