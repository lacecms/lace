import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const manifest = "revision.json";
const archive = "outputs.tar.gz";

function buildTasks(workspace, task) {
  const graph = JSON.parse(
    execFileSync("pnpm", ["exec", "turbo", "run", task, "--dry=json"], {
      cwd: workspace,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    }),
  );
  return graph.tasks.filter(({ task, command }) => task === "build" && command !== "<NONEXISTENT>");
}

function outputDirectories(workspace) {
  return buildTasks(workspace, "build").flatMap(({ directory, outputs }) =>
    outputs.map((pattern) => {
      assert.match(pattern, /^[\w-]+(?:\/[\w-]+)*\/\*\*$/u, `Unsupported build output: ${pattern}`);
      return join(directory, pattern.slice(0, -3));
    }),
  );
}

function requiredOutputs(workspace) {
  const directories = outputDirectories(workspace);
  for (const directory of directories) {
    assert.ok(readdirSync(join(workspace, directory)).length, `Empty build output: ${directory}`);
  }

  const docsInput = "apps/docs/public/reference/openapi.json";
  assert.ok(
    statSync(join(workspace, docsInput)).isFile(),
    `Missing documentation input: ${docsInput}`,
  );
  return [...directories, docsInput];
}

function buildIdentity(workspace) {
  const revision = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: workspace,
    encoding: "utf8",
  }).trim();
  return { revision, runId: process.env.GITHUB_RUN_ID ?? null };
}

function checkIdentity(workspace, directory) {
  assert.deepEqual(
    JSON.parse(readFileSync(join(directory, manifest), "utf8")),
    buildIdentity(workspace),
    "Workspace build artifact belongs to another revision or workflow run",
  );
}

export function verifyPrebuiltWorkspace(workspace, directory) {
  checkIdentity(workspace, directory);
  requiredOutputs(workspace);
}

function typecheckCache(workspace) {
  return buildTasks(workspace, "typecheck").flatMap(({ taskId, hash, cache }) => {
    assert.ok(cache.local, `Missing workspace build cache for typecheck prerequisite ${taskId}`);
    return [".tar.zst", "-meta.json", "-manifest.json"].map((suffix) =>
      join(".turbo/cache", hash + suffix),
    );
  });
}

function pack(workspace, directory) {
  mkdirSync(directory, { recursive: true });
  const files = [...requiredOutputs(workspace), ...typecheckCache(workspace)];
  execFileSync("tar", ["-czf", join(directory, archive), "--", ...files], {
    cwd: workspace,
    stdio: "inherit",
  });
  writeFileSync(join(directory, manifest), JSON.stringify(buildIdentity(workspace)) + "\n");
}

function restore(workspace, directory) {
  checkIdentity(workspace, directory);
  execFileSync("tar", ["-xzf", join(directory, archive)], { cwd: workspace, stdio: "inherit" });
  requiredOutputs(workspace);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [command, directory] = process.argv.slice(2);
  const workspace = process.cwd();
  if (command === "check-typecheck") {
    typecheckCache(workspace);
  } else {
    assert.ok(directory, "Expected the workspace build artifact directory");
    if (command === "pack") pack(workspace, resolve(directory));
    else if (command === "restore") restore(workspace, resolve(directory));
    else throw new Error(`Unknown workspace build command: ${command}`);
  }
}
