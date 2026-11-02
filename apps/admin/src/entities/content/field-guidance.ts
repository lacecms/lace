import { fieldTypeSupport } from "./field-types.js";
import type { FieldDefinition } from "./field-types.js";

/** Describes the validator's rules without turning publication minima into save gates. */
export function fieldGuidance(definition: FieldDefinition): string | undefined {
  const { quiet, visible } = fieldGuidanceParts(definition);
  return [quiet, visible].filter(Boolean).join(" ") || undefined;
}

/**
 * Splits guidance into publication-only explanations, which editors show while
 * the field has focus or a problem, and declared bounds, which stay visible.
 */
export function fieldGuidanceParts(definition: FieldDefinition): {
  readonly quiet?: string | undefined;
  readonly visible?: string | undefined;
} {
  const quiet: string[] = [];
  const parts = fieldTypeSupport[definition.type].guidance?.(definition) ?? [];
  if (definition.required) quiet.push("Required for publication only.");
  if (definition.type === "list" && definition.minItems)
    quiet.push(`Minimum ${definition.minItems} items for publication only.`);
  return { quiet: quiet.join(" ") || undefined, visible: parts.join(" ") || undefined };
}
