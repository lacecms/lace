// Generates the JSON Schema of the `lace import` package format from its Valibot
// schema. `--check` fails when the committed schema differs from the source.
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { toJsonSchema } from "@valibot/to-json-schema";
import { importPackageSchema } from "../dist/import-format.js";

export const schemaPath = fileURLToPath(
  new URL("../schema/lace-import.schema.json", import.meta.url),
);

/** The published schema: structure only, since models come from lace.config.ts. */
export function importJsonSchema() {
  // The key pattern is ASCII-only, so dropping its `u` flag keeps its meaning.
  const { $schema, ...schema } = toJsonSchema(importPackageSchema, { errorMode: "ignore" });
  return {
    $schema,
    title: "Lace import package v1",
    description:
      "lace-import.json of a lace import package. Field, block and SEO values are validated against the project's lace.config.ts by `lace import`.",
    ...schema,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const expected = importJsonSchema();
  if (process.argv.includes("--check")) {
    const committed = JSON.parse(await readFile(schemaPath, "utf8"));
    if (!isDeepStrictEqual(committed, expected)) {
      console.error(
        "schema/lace-import.schema.json is stale; run pnpm --filter @lacecms/cli schema.",
      );
      process.exitCode = 1;
    }
  } else {
    await writeFile(schemaPath, `${JSON.stringify(expected, null, 2)}\n`);
    // Keep the committed file in the repository format; --check compares values.
    spawnSync("pnpm", ["exec", "oxfmt", schemaPath], { stdio: "inherit" });
  }
}
