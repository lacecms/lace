import {
  ContentValidationError,
  isBlockAnchor,
  MAX_BLOCK_ANCHOR_LENGTH,
  MAX_BLOCK_CLASS_NAME_LENGTH,
  MAX_BLOCK_CLASS_TOKENS,
  MAX_SLUG_LENGTH,
  MAX_TITLE_LENGTH,
  normalizeBlockClassName,
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
  // Plain strings: the token scanner in scripts/check-boundaries.mjs does not
  // rescan template literals and stalls on a number sign in their text.
  anchorFormat:
    "Start with a lowercase letter and use only lowercase letters, digits and hyphens, up to " +
    String(MAX_BLOCK_ANCHOR_LENGTH) +
    " characters.",
  className:
    "Enter 1 to " +
    String(MAX_BLOCK_CLASS_TOKENS) +
    " class names separated by spaces, up to " +
    String(MAX_BLOCK_CLASS_NAME_LENGTH) +
    " characters. Class names start with a letter, _ or - and use letters, digits and _ - : / . % # [ ].",
  duplicateAnchor: "Another block in this entry already uses this anchor.",
  duplicateKey: "This block's key duplicates another block.",
  invalidKey: "This block's key is not valid.",
  invalidSettings: "This block's settings could not be read.",
  staleVersion: "This block version is not current.",
  typeNotAllowed: "This block type is not allowed by the model.",
} as const;

/**
 * Why a block anchor is not accepted, or `undefined` when it is valid or
 * blank (no anchor). `otherAnchors` are the anchors of the entry's other
 * blocks, hidden blocks included.
 */
export function anchorProblem(anchor: string, otherAnchors: Iterable<string>): string | undefined {
  if (anchor === "") return undefined;
  if (!isBlockAnchor(anchor)) return BLOCK_MESSAGES.anchorFormat;
  for (const other of otherAnchors) if (other === anchor) return BLOCK_MESSAGES.duplicateAnchor;
  return undefined;
}

/** Why a block class name is not accepted, or `undefined` when it is valid or blank. */
export function classNameProblem(className: string): string | undefined {
  if (className.trim() === "") return undefined;
  return normalizeBlockClassName(className) === undefined ? BLOCK_MESSAGES.className : undefined;
}

/** The block-level message for a settings value under a key the block does not declare. */
export function undeclaredSettingMessage(key: string): string {
  return `This block has a value for the undeclared setting “${key}”.`;
}

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
    case "unknown_field": {
      const setting = /^\/blocks\/\d+\/settings\/([^/]+)$/u.exec(issue.path ?? "");
      return setting === null
        ? "This field is not defined by the model."
        : undeclaredSettingMessage(unescapePointer(setting[1] ?? ""));
    }
    case "disallowed_block_type":
    case "unregistered_block_type":
      return BLOCK_MESSAGES.typeNotAllowed;
    case "stale_block_version":
      return BLOCK_MESSAGES.staleVersion;
    case "invalid_block_key":
      return BLOCK_MESSAGES.invalidKey;
    case "duplicate_block_key":
      return BLOCK_MESSAGES.duplicateKey;
    case "invalid_block_anchor":
      return BLOCK_MESSAGES.anchorFormat;
    case "duplicate_block_anchor":
      return BLOCK_MESSAGES.duplicateAnchor;
    case "invalid_block_class_name":
      return BLOCK_MESSAGES.className;
    case "invalid_block_hidden":
    case "invalid_block_settings":
      return BLOCK_MESSAGES.invalidSettings;
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
  const anchors = values.blocks.map((block) => block.anchor ?? "");
  for (const [index, block] of values.blocks.entries()) {
    const issues: Record<string, unknown> = {};
    const anchorIssue = anchorProblem(
      anchors[index] ?? "",
      anchors.filter((_, other) => other !== index),
    );
    if (anchorIssue !== undefined) issues.anchor = error(anchorIssue);
    const classNameIssue = classNameProblem(block.className ?? "");
    if (classNameIssue !== undefined) issues.className = error(classNameIssue);
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
      const settingIssues = validateBlockSettings(definition, block.settings);
      if (Object.keys(settingIssues).length > 0) issues.settings = settingIssues;
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

function validateBlockSettings(
  definition: BlockMetadata,
  settings: Readonly<Record<string, unknown>>,
): Record<string, { readonly message: string; readonly type: "validate" }> {
  const declared = definition.settings ?? {};
  const issues: Record<string, { readonly message: string; readonly type: "validate" }> = {};
  for (const key of Object.keys(settings)) {
    if (!Object.hasOwn(declared, key)) issues[key] = error(undeclaredSettingMessage(key));
  }
  for (const [key, settingDefinition] of Object.entries(declared)) {
    const value = settings[key];
    if (value === undefined || value === null) continue;
    const problem = fieldProblem(settingDefinition, value);
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
 * Removes cleared values from model fields, block data and block settings.
 * Controls store a cleared value as `null` in form state, because React Hook
 * Form shows the loaded default again for `undefined`; drafts never carry those
 * `null`s, so the server applies a cleared setting's default. A blank anchor or
 * class name means the block has none.
 */
export function withoutClearedValues(values: DraftEditorValues): DraftEditorValues {
  return {
    ...values,
    blocks: values.blocks.map(({ anchor, className, ...block }) => {
      const trimmedClassName = className?.trim() ?? "";
      return {
        ...block,
        ...(anchor === undefined || anchor === "" ? {} : { anchor }),
        ...(trimmedClassName === "" ? {} : { className: trimmedClassName }),
        data: withoutCleared(block.data) as ContentBlockDto["data"],
        settings: withoutCleared(block.settings) as ContentBlockDto["settings"],
      };
    }),
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
  | `blocks.${number}.${"anchor" | "block" | "className" | "key" | "schemaVersion" | "type"}`
  | `blocks.${number}.data.${string}`
  | `blocks.${number}.settings.${string}`
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
  if (
    third === "key" ||
    third === "type" ||
    third === "schemaVersion" ||
    third === "anchor" ||
    third === "className"
  )
    return segments.length === 3 ? `blocks.${index}.${third}` : undefined;
  if (third === "hidden") return `blocks.${index}.block`;
  if (third === "settings") {
    // A declared setting has a control in the Settings tab; anything else stays on the block.
    const definition = model.blockDefinitions?.find((item) => item.type === blocks[index]?.type);
    return fourth !== undefined &&
      fieldKeyPattern.test(fourth) &&
      Object.hasOwn(definition?.settings ?? {}, fourth)
      ? `blocks.${index}.settings.${fourth}`
      : `blocks.${index}.block`;
  }
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
  const match = /^blocks\.(\d+)\.(data|settings)\.(.+)$/u.exec(location);
  if (match === null) return undefined;
  const block = blocks[Number(match[1])];
  const definition = model.blockDefinitions?.find((item) => item.type === block?.type);
  const descriptors = match[2] === "settings" ? definition?.settings : definition?.fields;
  return descriptors?.[match[3] ?? ""] as FieldMetadata | undefined;
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
