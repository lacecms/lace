import type { JsonValue, JsonObject } from "../shared/json.js";
import type { ContentModelKind } from "../shared/identifiers.js";
import { MAX_SLUG_LENGTH } from "../shared/identifiers.js";
import type { ValidationPathSegment } from "../shared/errors.js";
import { invalid, assertExactKeys } from "../shared/errors.js";
import { canonicalJsonByteLength } from "./canonical-json.js";
import type { ContentValidationMode } from "../fields/validation.js";
import { validateModelFields, validateSnapshotListBudget } from "../fields/validation.js";
import { isRecord, deepFreeze } from "../shared/objects.js";
import type {
  ModelFieldDefinitions,
  FieldVisibility,
  ModelFieldValues,
} from "../fields/definitions.js";
import type { BlockRegistry } from "../blocks/definition.js";
import {
  BLOCK_KEY_PATTERN,
  isBlockAnchor,
  MAX_BLOCK_ANCHOR_LENGTH,
  normalizeBlockClassName,
  MAX_BLOCK_CLASS_TOKENS,
  MAX_BLOCK_CLASS_NAME_LENGTH,
  validateBlockSettings,
  validateBlockData,
} from "../blocks/definition.js";
import { collectSnapshotInternalLinks } from "../references/internal-links.js";

/** Maximum title length shared by draft, publish, REST, and admin validation. */
export const MAX_TITLE_LENGTH = 200;
/** Maximum flat top-level block count for one entry. */
export const MAX_TOP_LEVEL_BLOCKS = 200;
/** Maximum UTF-8 bytes in fields JSON or a single block data JSON value. */
export const MAX_JSON_BYTES = 1_000_000;

/** A block-like value whose data can be limited before the Step 3 block registry exists. */
export interface EntryBlockData {
  readonly data: JsonValue;
}

/** System data validated alongside a model field record. */
export interface EntryPayloadInput {
  readonly blocks: readonly EntryBlockData[];
  readonly fields: JsonObject;
  readonly kind: ContentModelKind;
  readonly slug?: string;
  readonly title: string;
}

function assertJsonSize(value: JsonValue, path: readonly ValidationPathSegment[]): void {
  if (canonicalJsonByteLength(value) > MAX_JSON_BYTES) {
    invalid(path, "json_too_large", `must not exceed ${MAX_JSON_BYTES} UTF-8 bytes.`);
  }
}

/** Validates system entry data and shared payload limits for a draft or publish candidate. */
export function validateEntryPayload(
  input: EntryPayloadInput,
  mode: ContentValidationMode,
): EntryPayloadInput {
  if (input.kind !== "collection" && input.kind !== "global" && input.kind !== "page") {
    invalid(["kind"], "invalid_model_kind", "must be page, collection, or global.");
  }
  if (typeof input.title !== "string" || input.title.length === 0) {
    invalid(["title"], "missing_title", "is required.");
  }
  if (input.title.length > MAX_TITLE_LENGTH) {
    invalid(["title"], "title_too_long", `must not exceed ${MAX_TITLE_LENGTH} characters.`);
  }
  if (
    input.slug !== undefined &&
    (typeof input.slug !== "string" || input.slug.length > MAX_SLUG_LENGTH)
  ) {
    invalid(["slug"], "slug_too_long", `must not exceed ${MAX_SLUG_LENGTH} characters.`);
  }
  if (input.kind === "global" && input.slug !== undefined) {
    invalid(["slug"], "slug_not_allowed", "is not allowed for a global.");
  }
  if (
    mode === "publish" &&
    input.kind === "collection" &&
    (input.slug === undefined || input.slug.length === 0)
  ) {
    invalid(["slug"], "missing_slug", "is required for collection publication.");
  }
  if (!Array.isArray(input.blocks)) {
    invalid(["blocks"], "invalid_blocks", "must be an array.");
  }
  if (input.blocks.length > MAX_TOP_LEVEL_BLOCKS) {
    invalid(
      ["blocks"],
      "too_many_blocks",
      `must not contain more than ${MAX_TOP_LEVEL_BLOCKS} blocks.`,
    );
  }
  assertJsonSize(input.fields, ["fields"]);
  for (const [index, block] of input.blocks.entries()) {
    if (!isRecord(block) || !Object.hasOwn(block, "data")) {
      invalid(["blocks", index], "invalid_block", "must contain JSON data.");
    }
    assertJsonSize(block.data as JsonValue, ["blocks", index, "data"]);
  }
  return input;
}

/** Model information required to validate a complete entry aggregate. */
export interface EntryAggregateModel {
  readonly blocks: readonly string[];
  readonly fields: ModelFieldDefinitions;
  readonly kind: ContentModelKind;
  /** Conditional-field rules over the model's own fields. */
  readonly visibility?: FieldVisibility;
}

/** One ordered, typed block submitted as part of an entry aggregate. */
export interface EntryAggregateBlock {
  readonly anchor?: string;
  readonly className?: string;
  readonly data: JsonObject;
  readonly hidden?: boolean;
  readonly key: string;
  readonly schemaVersion: number;
  readonly settings?: JsonObject;
  readonly type: string;
}

/** A validated block: normalized data, settings with defaults, and the envelope. */
export interface ValidatedEntryAggregateBlock {
  readonly anchor?: string;
  readonly className?: string;
  readonly data: ModelFieldValues;
  readonly hidden: boolean;
  readonly key: string;
  readonly schemaVersion: number;
  readonly settings: JsonObject;
  readonly type: string;
}

/** A full draft or publish candidate validated against a model and its registry. */
export interface EntryAggregateInput {
  readonly blocks: readonly EntryAggregateBlock[];
  readonly fields: JsonObject;
  readonly kind: ContentModelKind;
  readonly slug?: string;
  readonly title: string;
}

/** The normalized form of a valid entry aggregate. */
export interface ValidatedEntryAggregate {
  readonly blocks: readonly ValidatedEntryAggregateBlock[];
  readonly fields: ModelFieldValues;
  readonly kind: ContentModelKind;
  readonly slug?: string;
  readonly title: string;
}

/** Validates all system, model-field, and ordered block data for one content entry. */
export function validateEntryAggregate(
  input: EntryAggregateInput,
  model: EntryAggregateModel,
  registry: BlockRegistry,
  mode: ContentValidationMode,
): ValidatedEntryAggregate {
  if (input.kind !== model.kind) {
    invalid(["kind"], "model_kind_mismatch", "must match the content model kind.");
  }
  validateEntryPayload(
    {
      blocks: input.blocks,
      fields: {},
      kind: input.kind,
      ...(input.slug === undefined ? {} : { slug: input.slug }),
      title: input.title,
    },
    mode,
  );
  const fields = validateModelFields(
    model.fields,
    input.fields,
    mode,
    ["fields"],
    model.visibility,
  );
  assertJsonSize(fields as JsonValue, ["fields"]);

  const keys = new Set<string>();
  const anchors = new Set<string>();
  const blocks: ValidatedEntryAggregateBlock[] = [];
  for (const [index, block] of input.blocks.entries()) {
    const path: readonly ValidationPathSegment[] = ["blocks", index];
    if (!isRecord(block)) {
      invalid(path, "invalid_block", "must be an object.");
    }
    assertExactKeys(
      block,
      ["data", "key", "schemaVersion", "type"],
      ["anchor", "className", "hidden", "settings"],
      path,
    );
    if (typeof block.key !== "string" || !BLOCK_KEY_PATTERN.test(block.key)) {
      invalid([...path, "key"], "invalid_block_key", "must be a stable block key.");
    }
    if (keys.has(block.key)) {
      invalid([...path, "key"], "duplicate_block_key", "must be unique within the entry.");
    }
    keys.add(block.key);
    if (typeof block.type !== "string") {
      invalid([...path, "type"], "invalid_block_type", "must be a string.");
    }
    if (!model.blocks.includes(block.type)) {
      invalid([...path, "type"], "disallowed_block_type", "is not allowed by this model.");
    }
    const definition = registry.get(block.type);
    if (definition === undefined) {
      invalid([...path, "type"], "unregistered_block_type", "is not registered.");
    }
    if (block.schemaVersion !== definition.version) {
      invalid(
        [...path, "schemaVersion"],
        "stale_block_version",
        "does not match the registered version.",
      );
    }
    if (block.anchor !== undefined) {
      if (!isBlockAnchor(block.anchor)) {
        invalid(
          [...path, "anchor"],
          "invalid_block_anchor",
          `must start with a lowercase letter and use only lowercase letters, digits and hyphens, up to ${MAX_BLOCK_ANCHOR_LENGTH} characters.`,
        );
      }
      if (anchors.has(block.anchor)) {
        invalid([...path, "anchor"], "duplicate_block_anchor", "must be unique within the entry.");
      }
      anchors.add(block.anchor);
    }
    let className: string | undefined;
    if (block.className !== undefined) {
      className = normalizeBlockClassName(block.className);
      if (className === undefined) {
        invalid(
          [...path, "className"],
          "invalid_block_class_name",
          `must hold 1 to ${MAX_BLOCK_CLASS_TOKENS} valid class tokens, up to ${MAX_BLOCK_CLASS_NAME_LENGTH} characters.`,
        );
      }
    }
    if (block.hidden !== undefined && typeof block.hidden !== "boolean") {
      invalid([...path, "hidden"], "invalid_block_hidden", "must be a boolean.");
    }
    const hidden = block.hidden === true;
    const settings = validateBlockSettings(definition, block.settings ?? {}, [...path, "settings"]);
    assertJsonSize(block.data as JsonValue, [...path, "data"]);
    // A hidden block is never delivered, so publication accepts it unfinished.
    const data = validateBlockData(definition, block.data, hidden ? "draft" : mode, [
      ...path,
      "data",
    ]);
    assertJsonSize(data as JsonValue, [...path, "data"]);
    blocks.push(
      deepFreeze({
        ...(block.anchor === undefined ? {} : { anchor: block.anchor }),
        ...(className === undefined ? {} : { className }),
        data: data as ModelFieldValues,
        hidden,
        key: block.key,
        schemaVersion: block.schemaVersion,
        settings,
        type: block.type,
      }),
    );
  }
  validateSnapshotListBudget(
    model.fields,
    fields,
    blocks.map((block, index) => ({
      fields: registry.get(block.type)!.fields,
      data: block.data,
      path: ["blocks", index, "data"],
    })),
  );
  collectSnapshotInternalLinks(
    model.fields,
    fields,
    blocks.map((block) => ({
      key: block.key,
      fields: registry.get(block.type)!.fields,
      data: block.data,
      hidden: block.hidden,
    })),
  );
  return deepFreeze({
    blocks: deepFreeze(blocks),
    fields,
    kind: input.kind,
    ...(input.slug === undefined ? {} : { slug: input.slug }),
    title: input.title,
  });
}
