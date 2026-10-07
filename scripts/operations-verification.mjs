import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { executeRequiredPhases, ownedCommand } from "./security-resilience-verification.mjs";

export const remoteCredentialNames = [
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_ACCOUNT_ID",
  "LACE_D1_DATABASE_ID",
  "LACE_CLOUDFLARE_OPERATOR_ENV",
  "LACE_PAGES_API_TOKEN",
  "LACE_DEPLOY_HOOK_URL",
];

export function assertLocalOperationsEnvironment(env) {
  assert.ok(
    remoteCredentialNames.every((name) => !env[name]),
    "34C refuses remote credentials/settings; use a clean local environment",
  );
}

/** Only a freshly created directory is eligible for automatic deletion. */
export async function withOwnedDirectory(parent, work, signal) {
  const directory = await mkdtemp(join(parent, "lace-34c-"));
  try {
    signal?.throwIfAborted();
    return await work(directory, signal);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function main() {
  assert.equal(process.argv.slice(2).length, 0, "usage: pnpm verify:34c");
  assertLocalOperationsEnvironment(process.env);
  await mkdir(".lace-acceptance", { recursive: true });
  const output = await mkdtemp(resolve(".lace-acceptance/step-34c-results-"));
  const save = (name, value) =>
    writeFile(join(output, name), JSON.stringify(value, null, 2) + "\n");
  await save("provenance.json", {
    recordedAt: new Date().toISOString(),
    scope: "local source only",
    source: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    workingTree: execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim()
      ? "dirty"
      : "clean",
    node: process.version,
    pnpm: execFileSync("pnpm", ["--version"], { encoding: "utf8" }).trim(),
  });
  const testPhase = (name, args) => ({
    name,
    command: "pnpm",
    args: [
      "exec",
      "vitest",
      "run",
      ...args,
      "--exclude=.release-artifacts/**",
      "--exclude=.lace-acceptance/**",
      "--reporter=default",
      "--reporter=json",
      `--outputFile=${join(output, name + ".json")}`,
    ],
    testReport: join(output, name + ".json"),
  });
  const phases = [
    {
      name: "local-prerequisites",
      command: "docker",
      args: ["info", "--format", "{{.ServerVersion}}"],
    },
    {
      name: "workspace-build",
      command: "pnpm",
      args: ["exec", "turbo", "run", "build", "--output-logs=errors-only"],
    },
    testPhase("harness-and-guides", [
      "tests/operations-verification.test.mjs",
      "tests/consumer-guides.test.mjs",
      "--maxWorkers=2",
    ]),
    testPhase("health-restore-rotation", ["--config", "vitest.operations.config.mjs"]),
    testPhase("forward-migration-upgrade", [
      "packages/platform-node/src/migrate.test.mjs",
      "packages/cli/src/upgrade-command.test.mjs",
      "packages/cli/src/upgrade-rollback.test.mjs",
      "--maxWorkers=2",
    ]),
  ];
  try {
    await executeRequiredPhases(
      phases,
      async (phase) =>
        ownedCommand(phase.command, phase.args, {
          env: { LACE_34C_EVIDENCE: output },
        }),
      (report) => save("results.json", report),
    );
  } finally {
    console.info(`34C local results: ${output}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await main();
