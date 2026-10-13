import { MAX_LIST_ITEMS } from "@lacecms/content";
import type { FieldDefinition } from "./field-types.js";

/** Describes the validator's rules without turning publication minima into save gates. */
export function fieldGuidance(definition: FieldDefinition): string | undefined {
  const parts: string[] = [];
  if (definition.required) parts.push("Required for publication only.");
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
      parts.push(`Minimum ${definition.minItems} items for publication only.`);
    parts.push(`Limit: ${definition.maxItems ?? MAX_LIST_ITEMS} items, including drafts.`);
  }
  return parts.join(" ") || undefined;
}
