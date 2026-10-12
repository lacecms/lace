import type { ContentBlockDto, ContentModelDto } from "@lacecms/contracts";
import {
  BoxIcon,
  ImageIcon,
  MousePointerClickIcon,
  PanelTopIcon,
  PilcrowIcon,
  QuoteIcon,
  type LucideIcon,
} from "lucide-react";
import { fieldLabel } from "../../entities/content/index.js";

export type BlockDefinitionDto = NonNullable<ContentModelDto["blockDefinitions"]>[number];

const builtInIcons: Readonly<Record<string, LucideIcon>> = {
  cta: MousePointerClickIcon,
  hero: PanelTopIcon,
  image: ImageIcon,
  quote: QuoteIcon,
  richText: PilcrowIcon,
};

/** Keys whose text best names a block, tried before other text fields. */
const preferredTextKeys = ["title", "heading", "name", "quote", "caption", "alt"];
const MAX_SUMMARY_LENGTH = 120;

/** The admin-owned icon for a block type; unknown types share a default icon. */
export function blockIcon(type: string): LucideIcon {
  return builtInIcons[type] ?? BoxIcon;
}

/** The declared settings of a new block, each at its default. */
export function defaultSettings(
  definition: Pick<BlockDefinitionDto, "settings">,
): ContentBlockDto["settings"] {
  return Object.fromEntries(
    Object.entries(definition.settings ?? {}).map(([key, setting]) => [
      key,
      structuredClone(setting.defaultValue),
    ]),
  );
}

/** The configured label, or one derived from the stable type. */
export function blockLabel(definition: Pick<BlockDefinitionDto, "label" | "type">): string {
  return fieldLabel(definition.type, definition.label);
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function richTextPlainText(value: unknown): string {
  const parts: string[] = [];
  const walk = (node: unknown) => {
    if (node === null || typeof node !== "object") return;
    const record = node as { readonly content?: unknown; readonly text?: unknown };
    if (typeof record.text === "string") parts.push(record.text);
    if (Array.isArray(record.content)) {
      for (const child of record.content) {
        walk(child);
        parts.push(" ");
      }
    }
  };
  walk(value);
  return collapseWhitespace(parts.join(""));
}

function truncate(value: string): string {
  return value.length > MAX_SUMMARY_LENGTH
    ? `${value.slice(0, MAX_SUMMARY_LENGTH - 1).trimEnd()}…`
    : value;
}

/**
 * A one-line description of a block's current data so collapsed blocks stay
 * recognizable. It never exposes stored media identifiers.
 */
export function blockSummary(
  definition: Pick<BlockDefinitionDto, "fields">,
  data: Readonly<Record<string, unknown>> | undefined,
): string {
  const entries = Object.entries(definition.fields);
  const values = data ?? {};
  const text = (key: string) => {
    const value = values[key];
    return typeof value === "string" ? collapseWhitespace(value) : "";
  };
  const textKeys = entries
    .filter(([, field]) => field.type === "text" || field.type === "textarea")
    .map(([key]) => key)
    .sort((left, right) => {
      const rank = (key: string) => {
        const index = preferredTextKeys.indexOf(key);
        return index === -1 ? preferredTextKeys.length : index;
      };
      return rank(left) - rank(right);
    });
  for (const key of textKeys) {
    const value = text(key);
    if (value !== "") return truncate(value);
  }
  for (const [key, field] of entries) {
    if (field.type !== "richText") continue;
    const value = richTextPlainText(values[key]);
    if (value !== "") return truncate(value);
  }
  for (const [key, field] of entries) {
    if (field.type !== "url" && field.type !== "select") continue;
    const value = text(key);
    if (value !== "") return truncate(value);
  }
  if (entries.some(([key, field]) => field.type === "media" && text(key) !== "")) {
    return "Media selected";
  }
  return "Empty block";
}

/** Case-insensitive match over a block's label, type, and description. */
export function matchesBlockFilter(definition: BlockDefinitionDto, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === "") return true;
  return [blockLabel(definition), definition.type, definition.description ?? ""].some((value) =>
    value.toLowerCase().includes(needle),
  );
}
