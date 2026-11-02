import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vitest/config";

const sourcePath = (path) => fileURLToPath(new URL(path, import.meta.url));

export const workspaceAliases = [
  ...readdirSync(new URL("./packages/", import.meta.url), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const manifest = JSON.parse(
        readFileSync(new URL(`./packages/${entry.name}/package.json`, import.meta.url), "utf8"),
      );
      return {
        find: new RegExp(`^${manifest.name}$`, "u"),
        replacement: sourcePath(`./packages/${entry.name}/src/index.ts`),
      };
    }),
  {
    find: "@lacecms/platform-node/test",
    replacement: sourcePath("./packages/platform-node/src/test-actors.ts"),
  },
  {
    find: /^@lacecms\/astro\/(\w+\.astro)$/u,
    replacement: `${sourcePath("./packages/astro/src/")}$1`,
  },
  {
    find: "@lacecms/cli/lace-import.schema.json",
    replacement: sourcePath("./packages/cli/schema/lace-import.schema.json"),
  },
];

export function sharedTestConfig(extra = {}) {
  return mergeConfig(
    defineConfig({
      resolve: { alias: workspaceAliases },
      test: { include: ["src/**/*.test.ts"] },
    }),
    extra,
  );
}

export function packagedTestConfig(extra = {}) {
  return mergeConfig(defineConfig({ test: { include: ["src/**/*.packaged.test.mjs"] } }), extra);
}
