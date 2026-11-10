import {
  ContentValidationError,
  fieldTypeCapabilities,
  MAX_LIST_ITEMS,
  validateRichTextDocument,
} from "@lacecms/content";
import type { FieldFilterKind, FieldType } from "@lacecms/content";
import { formatAbsoluteTime, formatDate } from "../../shared/lib/index.js";
import type { FieldDefinition } from "../../shared/editor-contract/index.js";
export type {
  FieldDefinition,
  FieldPreview,
  FieldPreviewProps,
  FieldPreviewRegistry,
  ItemPreview,
} from "../../shared/editor-contract/index.js";

/** The DOM id of the control for a model or block field's form name. */
export function fieldControlId(
  name:
    | `blocks.${number}.${"anchor" | "className"}`
    | `blocks.${number}.${"data" | "settings"}.${string}`
    | `fields.${string}`,
): string {
  return `field-${name.replaceAll(".", "-")}`;
}

/** The URL forms the shared allowlist permits, as writers read them. */
const SAFE_URL_FORMS = "https://, http://, mailto:, tel:, / or #";

/** The message for a rich-text link whose URL the shared allowlist rejects. */
export const LINK_URL_MESSAGE = `Links must start with ${SAFE_URL_FORMS}.`;

/** The message for a URL field whose value the shared allowlist rejects. */
export const URL_FIELD_MESSAGE = `Enter a URL that starts with ${SAFE_URL_FORMS}.`;

function lengthProblem(minLength?: number, maxLength?: number): string {
  if (minLength !== undefined && maxLength !== undefined)
    return `Enter between ${minLength} and ${maxLength} characters.`;
  if (minLength !== undefined) return `Enter at least ${minLength} characters.`;
  if (maxLength !== undefined) return `Enter no more than ${maxLength} characters.`;
  return "Enter text.";
}

function rangeProblem(min?: number, max?: number): string {
  if (min !== undefined && max !== undefined) return `Enter a number from ${min} to ${max}.`;
  if (min !== undefined) return `Enter a number of at least ${min}.`;
  if (max !== undefined) return `Enter a number of at most ${max}.`;
  return "Enter a number.";
}

function richTextProblem(value: unknown): string {
  try {
    validateRichTextDocument(value);
  } catch (caught) {
    if (!(caught instanceof ContentValidationError)) throw caught;
    const code = caught.issues[0]?.code;
    if (code === "unsafe_url") return LINK_URL_MESSAGE;
    if (code === "unknown_node" || code === "unknown_mark" || code === "invalid_child")
      return "Remove formatting that is not supported here.";
  }
  return "This text could not be read. Undo the last change or clear the field.";
}

export interface FieldTypeSupport {
  readonly problem: (definition: FieldDefinition, value: unknown) => string;
  /** Whether the control is a group of elements rather than one labelable element. */
  readonly groupedControl: boolean;
  /** Whether the control shows a character count; an empty string is a real value. */
  readonly characterCount: boolean;
  readonly listCell?: (value: unknown) => string;
  readonly summary?: { readonly priority: 0 | 1 | 2; readonly text: (value: unknown) => string };
  readonly guidance?: (definition: FieldDefinition) => readonly string[];
  readonly draftValue?: () => unknown;
}

const stringCell = (value: unknown) =>
  typeof value === "string" && value.length > 0 ? value : "—";
const clean = (value: string) => value.replace(/\s+/gu, " ").trim();
const summaryText = (value: unknown) => (typeof value === "string" ? clean(value) : "");
function plainRichText(value: unknown): string {
  if (value === null || typeof value !== "object") return "";
  const node = value as { text?: unknown; content?: unknown };
  if (typeof node.text === "string") return node.text;
  return Array.isArray(node.content) ? node.content.map(plainRichText).join(" ") : "";
}
const textProblem = (definition: FieldDefinition) =>
  definition.type === "text" || definition.type === "textarea"
    ? lengthProblem(definition.minLength, definition.maxLength)
    : "Enter text.";
const textGuidance = (definition: FieldDefinition) => {
  const parts: string[] = [];
  if (definition.type === "text" || definition.type === "textarea") {
    if (definition.minLength !== undefined)
      parts.push(`When provided, enter at least ${definition.minLength} characters.`);
    if (definition.maxLength !== undefined)
      parts.push(`Limit: ${definition.maxLength} characters.`);
  }
  return parts;
};
const compositeProblem = () =>
  "This composite contains an invalid value. Review the saved JSON and the validation details.";
const numberFormat = new Intl.NumberFormat("en");

/** The admin filter control of each content filter kind. */
export type FilterControl = "text" | "number" | "date" | "datetime-local" | "boolean" | "select";
const filterControls: Readonly<Record<FieldFilterKind, FilterControl>> = {
  text: "text",
  number: "number",
  date: "date",
  datetime: "datetime-local",
  boolean: "boolean",
  select: "select",
};

/** The filter control of a list-queryable field type, derived from its content filter kind. */
export function fieldFilterControl(type: FieldType): FilterControl | undefined {
  const capability = fieldTypeCapabilities[type];
  return capability.listQueryable ? filterControls[capability.filterKind] : undefined;
}

/** Every kind declares support explicitly; domain eligibility lives in content capabilities. */
export const fieldTypeSupport: Readonly<Record<FieldType, FieldTypeSupport>> = {
  text: {
    groupedControl: false,
    characterCount: true,
    problem: textProblem,
    listCell: stringCell,
    summary: { priority: 0, text: summaryText },
    guidance: textGuidance,
    draftValue: () => "",
  },
  textarea: {
    groupedControl: false,
    characterCount: true,
    problem: textProblem,
    listCell: stringCell,
    summary: { priority: 0, text: summaryText },
    guidance: textGuidance,
    draftValue: () => "",
  },
  richText: {
    groupedControl: true,
    characterCount: false,
    problem: (_, value) => richTextProblem(value),
    summary: { priority: 1, text: (value) => clean(plainRichText(value)) },
  },
  number: {
    groupedControl: false,
    characterCount: false,
    problem: (definition) =>
      definition.type === "number"
        ? rangeProblem(definition.min, definition.max)
        : "Enter a number.",
    listCell: (value) =>
      typeof value === "number" && Number.isFinite(value) ? numberFormat.format(value) : "—",
    guidance: (definition) => {
      const parts: string[] = [];
      if (definition.type === "number") {
        if (definition.min !== undefined) parts.push(`Minimum: ${definition.min}.`);
        if (definition.max !== undefined) parts.push(`Maximum: ${definition.max}.`);
      }
      return parts;
    },
  },
  boolean: {
    groupedControl: false,
    characterCount: false,
    problem: () => "Choose on or off.",
    listCell: (value) => (typeof value === "boolean" ? (value ? "Yes" : "No") : "—"),
    draftValue: () => false,
  },
  date: {
    groupedControl: false,
    characterCount: false,
    problem: () => "Choose a valid date.",
    listCell: (value) => (typeof value === "string" && formatDate(value)) || "—",
  },
  datetime: {
    groupedControl: false,
    characterCount: false,
    problem: () => "Choose a valid date and time.",
    listCell: (value) => (typeof value === "string" && formatAbsoluteTime(value)) || "—",
  },
  select: {
    groupedControl: false,
    characterCount: false,
    problem: () => "Choose one of the listed options.",
    listCell: stringCell,
    summary: { priority: 2, text: summaryText },
  },
  url: {
    groupedControl: false,
    characterCount: false,
    problem: (definition) =>
      definition.type === "url" && definition.embedProviders !== undefined
        ? `Enter a valid ${definition.embedProviders.join(" or ")} video URL.`
        : URL_FIELD_MESSAGE,
    listCell: stringCell,
    summary: { priority: 2, text: summaryText },
  },
  media: { groupedControl: true, characterCount: false, problem: () => "Choose a media item." },
  group: {
    groupedControl: false,
    characterCount: false,
    problem: compositeProblem,
    draftValue: () => ({}),
  },
  list: {
    groupedControl: false,
    characterCount: false,
    problem: compositeProblem,
    guidance: (definition) =>
      definition.type === "list"
        ? [`Limit: ${definition.maxItems ?? MAX_LIST_ITEMS} items, including drafts.`]
        : [],
  },
};
