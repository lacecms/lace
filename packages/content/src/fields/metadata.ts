import type { FieldDefinition, FieldMetadata } from "./definitions.js";
import { normalizeFieldDefinition } from "./normalization.js";

/** Project a descriptor into detached JSON-safe admin metadata. */
export function toFieldMetadata(definition: FieldDefinition): FieldMetadata {
  return normalizeFieldDefinition(definition);
}
