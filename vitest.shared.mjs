import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vitest/config";

const packagesDirectory = new URL("./packages/", import.meta.url);

export const sourceConditionName = "@lacecms/source";

// Each workspace package declares a first `@lacecms/source` export condition
// naming the TypeScript module its compiled target is built from. Source tests
// resolve workspace specifiers through it, whatever the importer's location
// (registry components live outside any package). Vite's and Vitest's default
// conditions stay untouched; Vitest forwards server conditions to its workers
// as Node `--conditions`.
function workspaceSourceExports() {
  const entries = new Map();
  for (const entry of readdirSync(packagesDirectory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const directory = new URL(`${entry.name}/`, packagesDirectory);
    const manifest = JSON.parse(readFileSync(new URL("package.json", directory), "utf8"));
    for (const [key, target] of Object.entries(manifest.exports ?? {})) {
      if (
        typeof target !== "object" ||
        target === null ||
        typeof target[sourceConditionName] !== "string"
      ) {
        continue;
      }
      const specifier = key === "." ? manifest.name : `${manifest.name}${key.slice(1)}`;
      entries.set(specifier, fileURLToPath(new URL(target[sourceConditionName], directory)));
    }
  }
  return entries;
}

/** Vite plugin that resolves workspace packages through their `@lacecms/source` condition. */
export function sourceCondition() {
  const entries = workspaceSourceExports();
  return {
    name: "lace:source-condition",
    enforce: "pre",
    resolveId(id) {
      return entries.get(id) ?? null;
    },
  };
}

export function sharedTestConfig(extra = {}) {
  return mergeConfig(
    defineConfig({
      plugins: [sourceCondition()],
      test: { include: ["src/**/*.test.ts"] },
    }),
    extra,
  );
}

export function packagedTestConfig(extra = {}) {
  return mergeConfig(defineConfig({ test: { include: ["src/**/*.packaged.test.mjs"] } }), extra);
}
