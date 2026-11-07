import { cp, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { relative, resolve } from "node:path";
import config from "../drizzle.config.ts";

const root = resolve(import.meta.dirname, "..");
const executable = resolve(root, "node_modules/.bin/drizzle-kit");
const source = resolve(root, "packages/db/drizzle");
const cache = resolve(root, "node_modules/.cache/lace-drizzle-check");

function run(args) {
  const result = spawnSync(executable, args, {
    cwd: root,
    encoding: "utf8",
    input: "",
    timeout: 60_000,
  });
  if (result.status !== 0) {
    throw new Error(
      `drizzle-kit ${args[0]} failed: ${result.error?.message ?? ""}\n${result.stdout}\n${result.stderr}`,
    );
  }
  return result.stdout;
}

async function inventory(directory, prefix = "") {
  const entries = await readdir(resolve(directory, prefix), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...(await inventory(directory, path)));
    else
      files.push(
        `${path} ${createHash("sha256")
          .update(await readFile(resolve(directory, path)))
          .digest("hex")}`,
      );
  }
  return files.sort();
}

run(["check", "--config", "drizzle.config.ts"]);
await import("node:fs/promises").then(({ mkdir }) => mkdir(cache, { recursive: true }));
const temporary = await mkdtemp(resolve(cache, "check-"));
try {
  const copy = resolve(temporary, "drizzle");
  await cp(source, copy, { recursive: true });
  const before = await inventory(copy);
  // The CLI accepts one `--schema` path, so a copy of the configuration with
  // only `out` redirected keeps every listed schema module.
  const checkConfig = resolve(temporary, "drizzle.config.json");
  await writeFile(checkConfig, JSON.stringify({ ...config, out: relative(root, copy) }));
  run(["generate", "--config", relative(root, checkConfig)]);
  if (JSON.stringify(before) !== JSON.stringify(await inventory(copy))) {
    throw new Error("Drizzle schema has a pending migration; generate and review it.");
  }
  console.log("Drizzle migration snapshots and schema are in sync.");
} finally {
  await rm(temporary, { recursive: true, force: true });
}
