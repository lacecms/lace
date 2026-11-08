import type { FieldDefinition, ModelFieldDefinitions } from "../fields/definitions.js";
import { FIELD_KEY_PATTERN } from "../fields/definitions.js";
import { FieldConfigurationError } from "../shared/errors.js";
import { isRecord, deepFreeze } from "../shared/objects.js";
import { toFieldMetadata } from "../fields/metadata.js";
import { blockFail } from "./errors.js";

export function normalizeBlockFields(value: unknown, name = "fields"): ModelFieldDefinitions {
  if (!isRecord(value)) {
    blockFail(`${name} must be a plain object.`);
  }
  const fields: Record<string, FieldDefinition> = {};
  for (const [key, definition] of Object.entries(value)) {
    if (!FIELD_KEY_PATTERN.test(key)) {
      blockFail(`${name}.${key} must be a valid field key.`);
    }
    try {
      const metadata = toFieldMetadata(definition as FieldDefinition);
      const rejectHints = (field: FieldDefinition, path: string): void => {
        if (Object.hasOwn(field, "renamedFrom"))
          blockFail(`${path} must not declare renamedFrom; block data changes use block versions.`);
        if (field.type === "group")
          for (const [childKey, child] of Object.entries(field.fields))
            rejectHints(child, `${path}.fields.${childKey}`);
        if (field.type === "list") rejectHints(field.item, `${path}.item`);
      };
      rejectHints(metadata, `${name}.${key}`);
      fields[key] = metadata;
    } catch (error) {
      if (error instanceof FieldConfigurationError) {
        blockFail(`${name}.${key} must be a field definition.`);
      }
      throw error;
    }
  }
  return deepFreeze(fields);
}
