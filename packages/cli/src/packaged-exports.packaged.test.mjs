import { readdir, readFile } from "node:fs/promises";
import { expect, test } from "vitest";

test("packaged entry point keeps its public exports", async () => {
  expect(Object.keys(await import("../dist/index.js")).sort()).toEqual([
    "CliError",
    "EXIT",
    "UpgradeError",
    "applyUpgrade",
    "loadEnvironment",
    "packageName",
    "parseArguments",
    "planUpgrade",
    "presentResult",
    "presentUpgradePlan",
    "rollbackUpgrade",
    "usage",
    "validateUpgradeManifest",
  ]);
});

test("packaged CLI carries its registry and schema subpath", async () => {
  expect(await readdir(new URL("../dist/registry/", import.meta.url))).toContain("registry.json");
  const schema = JSON.parse(
    await readFile(new URL("../schema/lace-import.schema.json", import.meta.url), "utf8"),
  );
  expect(schema).toHaveProperty("$schema");
  const publishedSchema = await import("@lacecms/cli/lace-import.schema.json", {
    with: { type: "json" },
  });
  expect(publishedSchema.default).toEqual(schema);
});
