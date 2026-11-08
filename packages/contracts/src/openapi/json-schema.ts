import { jsonObjectSchema, jsonValueSchema } from "../shared/json.js";

/** JSON-only constraints for converter custom-schema hooks; validation stays Valibot. */
export function contractJsonSchemaOverride(
  schema: unknown,
): { type: "object"; additionalProperties: true } | Record<string, never> | undefined {
  return schema === jsonObjectSchema
    ? { type: "object", additionalProperties: true }
    : schema === jsonValueSchema
      ? {}
      : undefined;
}
