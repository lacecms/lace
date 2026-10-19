import { MAX_LIST_ITEMS } from "@lacecms/content";
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
  const parts: string[] = [];
  if (definition.required) quiet.push("Required for publication only.");
  if (definition.type === "text" || definition.type === "textarea") {
    if (definition.minLength !== undefined)
      parts.push(`When provided, enter at least ${definition.minLength} characters.`);
    if (definition.maxLength !== undefined)
      parts.push(`Limit: ${definition.maxLength} characters.`);
  }
  if (definition.type === "number") {
    if (definition.min !== undefined) parts.push(`Minimum: ${definition.min}.`);
    if (definition.max !== undefined) parts.push(`Maximum: ${definition.max}.`);
  }
  if (definition.type === "list") {
    if (definition.minItems)
      quiet.push(`Minimum ${definition.minItems} items for publication only.`);
    parts.push(`Limit: ${definition.maxItems ?? MAX_LIST_ITEMS} items, including drafts.`);
  }
  return { quiet: quiet.join(" ") || undefined, visible: parts.join(" ") || undefined };
}
