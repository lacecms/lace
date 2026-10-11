import type { FieldDefinition } from "./field-types.js";

/**
 * The media field whose alt text a block's `alt` field overrides: a block with
 * exactly one media field and a text field keyed `alt` (the built-in `image`
 * shape). Other shapes have no inherited alt text.
 */
export function mediaAltPair(
  fields: Readonly<Record<string, FieldDefinition>>,
): string | undefined {
  if (fields.alt?.type !== "text") return undefined;
  const media = Object.entries(fields).filter(([, definition]) => definition.type === "media");
  return media.length === 1 ? media[0]![0] : undefined;
}
