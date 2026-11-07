import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const vitestExclusions = ["--exclude=.release-artifacts/**", "--exclude=.lace-acceptance/**"];

/** Root Vitest run over root acceptance files or a named root verification project. */
export function rootRun(...args) {
  return { args };
}

/**
 * Workspace-member run through the member's own source (or packaged) Vitest
 * config, so a phase executes exactly what `test` / `test:packaged` execute.
 * Paths are repository-relative; `<member>/src` alone runs the whole suite.
 */
export function packageRun(...paths) {
  const packaged = paths[0] === "--packaged";
  const files = packaged ? paths.slice(1) : paths;
  const member = files[0].split("/").slice(0, 2).join("/");
  assert.ok(
    files.every((path) => path.startsWith(`${member}/`)),
    `package run mixes workspace members: ${files.join(", ")}`,
  );
  const filters = files
    .filter((path) => path !== `${member}/src`)
    .map((path) => path.slice(member.length + 1));
  return { member, packaged, filters };
}

/** One required phase made of Vitest runs, each with its own JSON report. */
export function vitestPhase(output, name, runs, extraArgs = []) {
  return {
    name,
    steps: runs.map((run, index) => {
      const testReport = join(output, `${name}-${index + 1}.json`);
      const reporting = ["--reporter=default", "--reporter=json", `--outputFile=${testReport}`];
      const args =
        run.member === undefined
          ? ["exec", "vitest", "run", ...run.args, ...vitestExclusions, ...extraArgs, ...reporting]
          : [
              "--filter",
              `./${run.member}`,
              "exec",
              "vitest",
              "run",
              ...(run.packaged ? ["--config", "vitest.packaged.config.mjs"] : []),
              ...run.filters,
              ...extraArgs,
              ...reporting,
            ];
      return { name: `${name} run ${index + 1}`, command: "pnpm", args, testReport };
    }),
  };
}

/** Runs a phase's Vitest steps in order; each report must show executed, passing tests. */
export async function runPhaseSteps(phase, execute) {
  assert.ok(phase.steps.length > 0, `required phase has no test runs: ${phase.name}`);
  for (const step of phase.steps) {
    await execute(step);
    assertExecutedTests(JSON.parse(await readFile(step.testReport, "utf8")));
  }
}

/** Fail closed: later phases are never labelled successful after an earlier failure. */
export async function runPhases(phases, run, save) {
  const report = {
    complete: false,
    phases: phases.map(({ name }) => ({ name, status: "not-run" })),
  };
  try {
    for (const [index, phase] of phases.entries()) {
      report.phases[index].status = "running";
      await save(report);
      await run(phase);
      report.phases[index].status = "passed";
      await save(report);
    }
    report.complete = true;
    return report;
  } catch (error) {
    const active = report.phases.find((phase) => phase.status === "running");
    if (active) active.status = "failed";
    throw error;
  } finally {
    await save(report);
  }
}

export function assertExecutedTests(report) {
  assert.equal(report.success, true, "test reporter did not report success");
  assert.ok(report.numTotalTests > 0, "required suite executed no tests");
  assert.equal(report.numPendingTests, 0, "required suite skipped tests");
  assert.equal(report.numTodoTests ?? 0, 0, "required suite has todo tests");
  assert.equal(report.numFailedTests, 0, "required suite failed");
  assert.equal(report.numPassedTests, report.numTotalTests, "not every required test passed");
}

async function command(command, args) {
  await new Promise((done, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      detached: process.platform !== "win32",
    });
    const stop = () => {
      if (process.platform === "win32") child.kill("SIGTERM");
      else {
        try {
          process.kill(-child.pid, "SIGTERM");
        } catch (error) {
          if (error.code !== "ESRCH") throw error;
        }
      }
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    const release = () => {
      process.removeListener("SIGINT", stop);
      process.removeListener("SIGTERM", stop);
    };
    child.once("error", (error) => {
      release();
      reject(error);
    });
    child.once("exit", (code, signal) => {
      release();
      if (code === 0) done();
      else reject(new Error(`Cross-runtime command failed: ${command} (${signal ?? code})`));
    });
  });
}

export async function main(args = process.argv.slice(2)) {
  const usage =
    "usage: pnpm verify:cross-runtime --artifacts <prepared-directory> --baseline <reviewed-inventory>";
  assert.ok(args.length === 4, usage);
  assert.equal(args[0], "--artifacts", usage);
  assert.equal(args[2], "--baseline", usage);
  const baselinePath = args[3];
  const artifacts = resolve(args[1]);
  await mkdir(".lace-acceptance", { recursive: true });
  const output = await mkdtemp(resolve(".lace-acceptance/verify-cross-runtime-"));
  const provenance = {
    source: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    workingTree: execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim()
      ? "dirty"
      : "clean",
    node: process.version,
    pnpm: execFileSync("pnpm", ["--version"], { encoding: "utf8" }).trim(),
    artifacts,
  };
  const testPhase = (name, runs, extraArgs) => vitestPhase(output, name, runs, extraArgs);
  const phases = [
    {
      name: "local-prerequisites",
      async run() {
        await command("docker", ["info", "--format", "{{.ServerVersion}}"]);
        const require = createRequire(new URL("../apps/admin/package.json", import.meta.url));
        const browser = await require("@playwright/test").chromium.launch({ headless: true });
        await browser.close();
      },
    },
    {
      name: "candidate-identity",
      async run() {
        await command("pnpm", ["release:verify", "--output", artifacts]);
        const inventory = JSON.parse(await readFile(join(artifacts, "inventory.json"), "utf8"));
        const baseline = JSON.parse(await readFile(baselinePath, "utf8"));
        assert.equal(
          inventory.source.revision,
          baseline.source.revision,
          "candidate revision differs from reviewed inventory",
        );
        assert.deepEqual(
          inventory.packages,
          baseline.packages,
          "candidate package checksums differ from reviewed inventory",
        );
        assert.deepEqual(
          inventory.images,
          baseline.images,
          "candidate image identities differ from reviewed inventory",
        );
        provenance.candidateSource = inventory.source;
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
        "--filter=@lacecms/test-utils",
        "--filter=@lacecms/sdk",
        "--filter=@lacecms/render",
        "--filter=@lacecms/astro",
      ],
    },
    testPhase(
      "repositories",
      [
        packageRun("packages/platform-node/src/repository-contract.test.ts"),
        packageRun("packages/platform-cloudflare/src/repository-contract.test.ts"),
      ],
      ["--maxWorkers=2"],
    ),
    testPhase("product", [
      rootRun("--config", "vitest.verification.config.mjs", "--project", "cross-runtime"),
    ]),
    testPhase(
      "sdk-render-site",
      [
        packageRun("packages/sdk/src"),
        packageRun("packages/render/src"),
        packageRun("--packaged", "apps/site/src/fixture-build.packaged.test.mjs"),
      ],
      ["--maxWorkers=1"],
    ),
    {
      name: "exact-candidate",
      command: "pnpm",
      args: ["acceptance:release", "--artifacts", artifacts],
    },
  ];
  console.info(`Cross-runtime report: ${output}/result.json`);
  await runPhases(
    phases,
    async (phase) => {
      console.info(`Cross-runtime phase: ${phase.name}`);
      if (phase.run) await phase.run();
      else if (phase.steps) await runPhaseSteps(phase, (step) => command(step.command, step.args));
      else await command(phase.command, phase.args);
      if (phase.testReport)
        assertExecutedTests(JSON.parse(await readFile(phase.testReport, "utf8")));
    },
    (report) =>
      writeFile(
        join(output, "result.json"),
        JSON.stringify({ ...provenance, ...report }, null, 2) + "\n",
      ),
  );
  console.info(
    "Cross-runtime local verification complete; real-deployment acceptance remains owner work.",
  );
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
