import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";

test("packaged entry point keeps its public exports", async () => {
  expect(Object.keys(await import("../dist/index.js")).sort()).toEqual([
    "ConfigurationError",
    "contentModelStructure",
    "defineCollection",
    "defineConfig",
    "defineGlobal",
    "definePage",
    "normalizeCollectionRoute",
    "normalizePagePath",
    "packageName",
    "resolveCollectionRoute",
  ]);
});

/** Names the emitted entry declaration exports, including type-only exports. */
function exportedDeclarationNames(text) {
  const source = text.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/\/\/.*$/gmu, "");
  if (/export\s+\*/u.test(source)) throw new Error("Unexpected export * in the entry declaration");
  const names = [];
  for (const match of source.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/gu))
    for (const part of match[1].split(",").map((value) => value.trim()))
      if (part !== "")
        names.push(
          part
            .replace(/^type\s+/u, "")
            .split(/\s+as\s+/u)
            .at(-1),
        );
  for (const match of source.matchAll(
    /export\s+(?:declare\s+)?(?:const|let|function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gu,
  ))
    names.push(match[1]);
  return [...new Set(names)].sort();
}

test("packaged entry declaration keeps its exported names, including types", async () => {
  const declaration = await readFile(new URL("../dist/index.d.ts", import.meta.url), "utf8");
  expect(exportedDeclarationNames(declaration)).toEqual([
    "CollectionListOptions",
    "CollectionModelDefinition",
    "CollectionModelInput",
    "ConfigurationError",
    "ContentModelDefinition",
    "ContentModelStructure",
    "FieldMap",
    "GlobalModelDefinition",
    "GlobalModelInput",
    "LaceConfigInput",
    "ListQueryFieldKey",
    "ModelFieldValues",
    "ModelSeoDefinition",
    "ModelSeoInput",
    "ModelVisibility",
    "NormalizedCommonModel",
    "NormalizedConfig",
    "NormalizedContentModel",
    "NormalizedRoutableModel",
    "PageModelDefinition",
    "PageModelInput",
    "PublicConfigProjection",
    "RuntimeConfigProjection",
    "SeoDefaultsDefinition",
    "SeoDefaultsInput",
    "contentModelStructure",
    "defineCollection",
    "defineConfig",
    "defineGlobal",
    "definePage",
    "normalizeCollectionRoute",
    "normalizePagePath",
    "packageName",
    "resolveCollectionRoute",
  ]);
});
