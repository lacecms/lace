import { expect, test } from "vitest";
import { defineCollection, defineConfig } from "@lacecms/config";
import {
  normalizeFieldDefinition,
  fieldTypesWith,
  FIELD_FILTER_OPERATIONS,
  fieldTypeCapabilities,
} from "@lacecms/content";
import type { FieldDefinition } from "@lacecms/content";
import { resolveCollectionQuery } from "./collection-queries.js";

test("each queryable kind rejects unsupported operators at the operator pointer", async () => {
  for (const type of fieldTypesWith("listQueryable")) {
    const definition: FieldDefinition = normalizeFieldDefinition({
      type,
      required: false,
      ...(type === "select" ? { options: ["one"] } : {}),
    });
    const model = defineCollection({
      key: "posts",
      version: 1,
      route: "/:slug",
      fields: { target: definition },
      listOptions: { filterableFields: ["target"] },
    });
    const config = await defineConfig({ content: [model] });
    const allowed: readonly string[] =
      FIELD_FILTER_OPERATIONS[fieldTypeCapabilities[type].filterKind];
    for (const op of ["contains", "eq", "range", "in", "unknown"]) {
      if (allowed.includes(op)) continue;
      expect(() =>
        resolveCollectionQuery(config.runtime.content[0]!, undefined, [{ field: "target", op }]),
      ).toThrow(expect.objectContaining({ pointer: "/filters/0/op" }));
    }
  }
});
