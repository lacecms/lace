import {
  ContentValidationError,
  MAX_SLUG_LENGTH,
  MAX_TITLE_LENGTH,
  validateFieldValue,
  validateRichTextDocument,
} from "@lacecms/content";
import type { BlockMetadata, FieldMetadata, JsonObject } from "@lacecms/content";
import type { ContentBlockDto, ContentModelDto, ContractValidationIssue } from "@lacecms/contracts";
import type { FieldErrors, Resolver } from "react-hook-form";
import { SEO_MESSAGES, seoProblems, type SeoFormValues, type SeoKey } from "./seo.js";

export interface DraftEditorValues {
  blocks: ContentBlockDto[];
  fields: Record<string, unknown>;
  /** Present for entries of models with SEO enabled. */
  seo?: SeoFormValues;
  slug?: string;
  title: string;
}

/** The URL forms the shared allowlist permits, as writers read them. */
const SAFE_URL_FORMS = "https://, http://, mailto:, tel:, / or #";

/** The message for a rich-text link whose URL the shared allowlist rejects. */
export const LINK_URL_MESSAGE = `Links must start with ${SAFE_URL_FORMS}.`;

/** The message for a URL field whose value the shared allowlist rejects. */
export const URL_FIELD_MESSAGE = `Enter a URL that starts with ${SAFE_URL_FORMS}.`;

/** Block-level messages shared by local validation and server issue mapping. */
export const BLOCK_MESSAGES = {
  duplicateKey: "This block's key duplicates another block.",
  invalidKey: "This block's key is not valid.",
  staleVersion: "This block version is not current.",
  typeNotAllowed: "This block type is not allowed by the model.",
} as const;

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

/**
 * Returns a sentence describing why a present value violates its field
 * descriptor, or `undefined` when the value is valid. Messages never repeat
 * the value.
 */
export function fieldProblem(definition: FieldMetadata, value: unknown): string | undefined {
  try {
    validateFieldValue(definition, value);
    return undefined;
  } catch (caught) {
    if (!(caught instanceof ContentValidationError)) throw caught;
  }
  switch (definition.type) {
    case "text":
    case "textarea":
      return lengthProblem(definition.minLength, definition.maxLength);
    case "number":
      return rangeProblem(definition.min, definition.max);
    case "select":
      return "Choose one of the listed options.";
    case "date":
      return "Choose a valid date.";
    case "datetime":
      return "Choose a valid date and time.";
    case "url":
      return URL_FIELD_MESSAGE;
    case "media":
      return "Choose a media item.";
    case "boolean":
      return "Choose on or off.";
    case "richText":
      return richTextProblem(value);
  }
}

function sentence(message: string): string {
  const trimmed = message.trim();
  return trimmed.length === 0
    ? "The submitted value was rejected."
    : trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/**
 * Turns a server validation issue into the sentence shown at its location.
 * When the field and its current value are known, the local descriptor
 * message is preferred.
 */
export function serverIssueMessage(
  issue: Pick<ContractValidationIssue, "code" | "message"> &
    Partial<Pick<ContractValidationIssue, "path">>,
  field?: { readonly definition: FieldMetadata; readonly value: unknown },
): string {
  switch (issue.code) {
    case "invalid_field_value": {
      const local = field === undefined ? undefined : fieldProblem(field.definition, field.value);
      return local ?? "This value is not valid for this field.";
    }
    case "missing_required_field":
      return "This field is required to publish.";
    case "missing_slug":
      return "A slug is required to publish.";
    case "missing_title":
      return "Title is required.";
    case "unknown_field":
      return "This field is not defined by the model.";
    case "disallowed_block_type":
    case "unregistered_block_type":
      return BLOCK_MESSAGES.typeNotAllowed;
    case "stale_block_version":
      return BLOCK_MESSAGES.staleVersion;
    case "invalid_block_key":
      return BLOCK_MESSAGES.invalidKey;
    case "duplicate_block_key":
      return BLOCK_MESSAGES.duplicateKey;
    case "invalid_seo_text":
      return SEO_MESSAGES.singleLine;
    case "seo_text_too_long":
      return issue.path === "/seo/description"
        ? SEO_MESSAGES.descriptionTooLong
        : SEO_MESSAGES.titleTooLong;
    case "invalid_canonical_url":
      return SEO_MESSAGES.canonical;
    case "canonical_too_long":
      return SEO_MESSAGES.canonicalTooLong;
    case "invalid_seo_image":
      return SEO_MESSAGES.image;
    case "seo_not_allowed":
      return SEO_MESSAGES.notAllowed;
    default:
      return sentence(issue.message);
  }
}

function error(message: string): { readonly message: string; readonly type: "validate" } {
  return { message, type: "validate" };
}

function fieldErrors(
  model: ContentModelDto,
  values: DraftEditorValues,
): FieldErrors<DraftEditorValues> {
  const errors: Record<string, unknown> = {};
  if (values.title.length === 0) errors.title = error("Title is required.");
  else if (values.title.length > MAX_TITLE_LENGTH)
    errors.title = error(`Title must not exceed ${MAX_TITLE_LENGTH} characters.`);
  if (
    model.kind === "collection" &&
    values.slug !== undefined &&
    values.slug.length > MAX_SLUG_LENGTH
  )
    errors.slug = error(`Slug must not exceed ${MAX_SLUG_LENGTH} characters.`);

  const fieldIssues: Record<string, { readonly message: string; readonly type: "validate" }> = {};
  for (const [key, definition] of Object.entries(model.fields)) {
    const value = values.fields[key];
    if (value === undefined || value === null) continue;
    const problem = fieldProblem(definition as FieldMetadata, value);
    if (problem !== undefined) fieldIssues[key] = error(problem);
  }
  if (Object.keys(fieldIssues).length > 0) errors.fields = fieldIssues;
  if (values.seo !== undefined) {
    const seoIssues = Object.fromEntries(
      Object.entries(seoProblems(values.seo)).map(([key, message]) => [key, error(message)]),
    );
    if (Object.keys(seoIssues).length > 0) errors.seo = seoIssues;
  }
  const blockIssues: Record<string, unknown> = {};
  const definitions = new Map(
    (model.blockDefinitions ?? []).map((definition) => [definition.type, definition]),
  );
  const keys = new Set<string>();
  for (const [index, block] of values.blocks.entries()) {
    const issues: Record<string, unknown> = {};
    if (!isUlid(block.key)) issues.key = error(BLOCK_MESSAGES.invalidKey);
    else if (keys.has(block.key)) issues.key = error(BLOCK_MESSAGES.duplicateKey);
    keys.add(block.key);
    const definition = definitions.get(block.type);
    if (definition === undefined || !model.blocks.includes(block.type)) {
      issues.type = error(BLOCK_MESSAGES.typeNotAllowed);
    } else if (block.schemaVersion !== definition.version) {
      issues.schemaVersion = error(BLOCK_MESSAGES.staleVersion);
    } else {
      const dataIssues = validateBlockData(definition, block.data);
      if (Object.keys(dataIssues).length > 0) issues.data = dataIssues;
    }
    if (Object.keys(issues).length > 0) blockIssues[index] = issues;
  }
  if (Object.keys(blockIssues).length > 0) errors.blocks = blockIssues;
  return errors as FieldErrors<DraftEditorValues>;
}

/** The block-level message for data stored under a key the block does not define. */
export function undefinedDataMessage(key: string): string {
  return `This block has data for the undefined field “${key}”.`;
}

function validateBlockData(
  definition: BlockMetadata,
  data: JsonObject,
): Record<string, { readonly message: string; readonly type: "validate" }> {
  const issues: Record<string, { readonly message: string; readonly type: "validate" }> = {};
  for (const key of Object.keys(data)) {
    if (!Object.hasOwn(definition.fields, key)) issues[key] = error(undefinedDataMessage(key));
  }
  for (const [key, fieldDefinition] of Object.entries(definition.fields)) {
    const value = data[key];
    if (value === undefined || value === null) continue;
    const problem = fieldProblem(fieldDefinition, value);
    if (problem !== undefined) issues[key] = error(problem);
  }
  return issues;
}

function withoutCleared<Value>(record: Record<string, Value>): Record<string, Value> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== null && value !== undefined),
  );
}

/**
 * Removes cleared values from model fields and block data. Controls store a
 * cleared value as `null` in form state, because React Hook Form shows the
 * loaded default again for `undefined`; drafts never carry those `null`s.
 */
export function withoutClearedValues(values: DraftEditorValues): DraftEditorValues {
  return {
    ...values,
    blocks: values.blocks.map((block) => ({
      ...block,
      data: withoutCleared(block.data) as ContentBlockDto["data"],
    })),
    fields: withoutCleared(values.fields),
  };
}

export function validateDraftValues(
  model: ContentModelDto,
  values: DraftEditorValues,
): FieldErrors<DraftEditorValues> {
  return fieldErrors(model, values);
}

/** Builds the local draft-mode resolver from validated, serializable model metadata. */
export function createDraftResolver(
  model: ContentModelDto,
): Resolver<DraftEditorValues, unknown, DraftEditorValues> {
  return async (values) => {
    const errors = fieldErrors(model, values);
    return Object.keys(errors).length === 0
      ? { errors: {}, values }
      : ({ errors, values: {} } as never);
  };
}

/** Applies descriptor defaults only when an entry draft has no value for the field. */
export function initialModelFieldValues(
  model: ContentModelDto,
  fields: JsonObject,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(model.fields).map(([key, definition]) => [
      key,
      fields[key] ??
        (Object.hasOwn(definition, "defaultValue") ? definition.defaultValue : undefined),
    ]),
  );
}

/** A form location that a server validation issue can be shown at. */
export type IssueLocation =
  | "blocks.root"
  | "slug"
  | "title"
  | `blocks.${number}.${"block" | "key" | "schemaVersion" | "type"}`
  | `blocks.${number}.data.${string}`
  | `fields.${string}`
  | `seo.${SeoKey}`;

function unescapePointer(segment: string): string {
  return segment.replaceAll("~1", "/").replaceAll("~0", "~");
}

const seoKeys: ReadonlySet<string> = new Set<SeoKey>([
  "canonical",
  "description",
  "image",
  "noindex",
  "title",
]);

const fieldKeyPattern = /^[A-Za-z][A-Za-z0-9]*$/u;

const blockEnvelopeKeys: ReadonlySet<string> = new Set([
  "anchor",
  "className",
  "hidden",
  "settings",
]);

/**
 * Maps a server JSON Pointer to the form location that shows it. Pointers
 * below a field (for example into a rich-text document) map to the field.
 */
export function issueLocation(
  path: string,
  model: ContentModelDto,
  blocks: readonly ContentBlockDto[],
): IssueLocation | undefined {
  if (!path.startsWith("/")) return undefined;
  const segments = path.slice(1).split("/").map(unescapePointer);
  const [root, second, third, fourth] = segments;
  if (root === "title" && segments.length === 1) return "title";
  if (root === "slug" && segments.length === 1) return "slug";
  if (root === "seo") {
    // An issue about the group as a whole (for example `seo_not_allowed`) has no control.
    return segments.length === 2 && seoKeys.has(second ?? "")
      ? `seo.${second as SeoKey}`
      : undefined;
  }
  if (root === "fields") {
    return second !== undefined &&
      fieldKeyPattern.test(second) &&
      Object.hasOwn(model.fields, second)
      ? `fields.${second}`
      : undefined;
  }
  if (root !== "blocks") return undefined;
  if (second === undefined) return "blocks.root";
  if (!/^(?:0|[1-9]\d*)$/u.test(second)) return undefined;
  const index = Number(second);
  if (index >= blocks.length) return undefined;
  if (third === undefined) return `blocks.${index}.block`;
  if (third === "key" || third === "type" || third === "schemaVersion")
    return segments.length === 3 ? `blocks.${index}.${third}` : undefined;
  // Envelope values have no control of their own yet; their issues stay on the block.
  if (blockEnvelopeKeys.has(third)) return `blocks.${index}.block`;
  if (third !== "data") return undefined;
  if (fourth === undefined) return `blocks.${index}.block`;
  return fieldKeyPattern.test(fourth) ? `blocks.${index}.data.${fourth}` : `blocks.${index}.block`;
}

/** The descriptor of the field an issue location names, when it names one. */
export function locationField(
  location: IssueLocation,
  model: ContentModelDto,
  blocks: readonly ContentBlockDto[],
): FieldMetadata | undefined {
  if (location.startsWith("fields."))
    return model.fields[location.slice("fields.".length)] as FieldMetadata | undefined;
  const match = /^blocks\.(\d+)\.data\.(.+)$/u.exec(location);
  if (match === null) return undefined;
  const block = blocks[Number(match[1])];
  const definition = model.blockDefinitions?.find((item) => item.type === block?.type);
  return definition?.fields[match[2] ?? ""];
}

/** ULID is the browser-created stable identity format for a block snapshot. */
export function isUlid(value: string): boolean {
  return /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/u.test(value);
}

export function suggestSlug(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[^\w\s-]/gu, "")
    .toLowerCase()
    .trim()
    .replace(/[\s_-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, MAX_SLUG_LENGTH);
}
