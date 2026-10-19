import { formFieldKeys } from "@lacecms/content";
import { record } from "./composite-values.js";
import type { FieldDefinition, FieldPreviewRegistry, ItemPreview } from "./field-types.js";

/** Plain-text lines of a list item, before any leaf preview is applied. */
export interface ItemSummary {
  /** The item label or first useful text anywhere in the item. */
  readonly primary?: string | undefined;
  /** The next useful text of another direct child field. */
  readonly secondary?: string | undefined;
  /** Whether the item holds media, so a generic label can stand in for it. */
  readonly media: boolean;
}

const clean = (text: string) => text.replace(/\s+/gu, " ").trim();

function plainRichText(node: unknown): string {
  if (!record(node)) return "";
  if (typeof node.text === "string") return node.text;
  return Array.isArray(node.content) ? node.content.map(plainRichText).join(" ") : "";
}

/** The useful text of one value with its priority: text, rich text, then URL/select. */
function texts(definition: FieldDefinition, value: unknown): { priority: number; text: string }[] {
  if (definition.type === "group" && record(value))
    return Object.entries(definition.fields).flatMap(([key, child]) => texts(child, value[key]));
  if (definition.type === "list" && Array.isArray(value))
    return value.flatMap((item) => texts(definition.item, item));
  if (["text", "textarea", "url", "select"].includes(definition.type) && typeof value === "string")
    return clean(value)
      ? [
          {
            priority: definition.type === "text" || definition.type === "textarea" ? 0 : 2,
            text: clean(value),
          },
        ]
      : [];
  if (definition.type === "richText" && record(value)) {
    const text = clean(plainRichText(value));
    return text ? [{ priority: 1, text }] : [];
  }
  return [];
}

function first(found: { priority: number; text: string }[]): string | undefined {
  return [...found].sort((a, b) => a.priority - b.priority)[0]?.text;
}

function holdsMedia(definition: FieldDefinition, value: unknown): boolean {
  if (definition.type === "media") return typeof value === "string" && value !== "";
  if (definition.type === "group" && record(value))
    return Object.entries(definition.fields).some(([key, child]) => holdsMedia(child, value[key]));
  if (definition.type === "list" && Array.isArray(value))
    return value.some((item) => holdsMedia(definition.item, item));
  return false;
}

/**
 * Summarizes a list item from its values only: the declared item label or the
 * first useful text, and a second line from another direct child field.
 * Media IDs and rich-text JSON never appear.
 */
export function itemSummary(
  definition: FieldDefinition,
  value: unknown,
  itemLabel?: string,
): ItemSummary {
  const media = holdsMedia(definition, value);
  const labelled =
    itemLabel && record(value) && typeof value[itemLabel] === "string"
      ? clean(value[itemLabel])
      : "";
  const primary = labelled || first(texts(definition, value));
  if (primary === undefined || definition.type !== "group" || !record(value))
    return { media, primary };
  const ordered = formFieldKeys(definition.fields, definition.layout);
  const source = labelled
    ? itemLabel
    : ordered.find((key) =>
        texts(definition.fields[key]!, value[key]).some((t) => t.text === primary),
      );
  const secondary = first(
    ordered
      .filter((key) => key !== source)
      .flatMap((key) => {
        const child = definition.fields[key]!;
        return child.type === "group" || child.type === "list" ? [] : texts(child, value[key]);
      }),
  );
  return { media, primary, secondary };
}

const present = (value: unknown) => value !== undefined && value !== null && value !== "";

/** The first direct child of a group item, in rendered order, that has a preview and a value. */
export function previewLeaf(
  definition: FieldDefinition,
  value: unknown,
  previews: FieldPreviewRegistry | undefined,
):
  | { readonly key: string; readonly definition: FieldDefinition; readonly value: unknown }
  | undefined {
  if (!previews || definition.type !== "group" || !record(value)) return undefined;
  for (const key of formFieldKeys(definition.fields, definition.layout)) {
    const child = definition.fields[key]!;
    if (previews[child.type] && present(value[key]))
      return { key, definition: child, value: value[key] };
  }
  return undefined;
}

/** Merges the text summary with a leaf preview into the two lines of a collapsed row. */
export function rowLines(
  summary: ItemSummary,
  preview: ItemPreview | undefined,
): { readonly primary: string; readonly secondary?: string | undefined } {
  if (summary.primary)
    return { primary: summary.primary, secondary: preview?.title ?? summary.secondary };
  if (preview?.title) return { primary: preview.title, secondary: preview.detail };
  return { primary: summary.media ? "Media selected" : "Empty item" };
}
