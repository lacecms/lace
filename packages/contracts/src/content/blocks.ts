import { isBlockAnchor, normalizeBlockClassName } from "@lacecms/content";
import { blockKey } from "@lacecms/domain";
import type { ContentBlock } from "@lacecms/domain";
import * as v from "valibot";
import { isJsonObject, jsonObjectSchema } from "../shared/json.js";
import { identifierSchema, nonNegativeIntegerSchema } from "../shared/primitives.js";

/**
 * Presentation values shared by admin and public blocks. Omitted settings
 * parse as `{}`; the API always sends them.
 */
/** A block settings record of JSON values. */
export type BlockSettingsDto = Readonly<Record<string, unknown>>;

/**
 * Block settings; a missing value parses as `{}`. The schema is typed as a
 * plain record because a default over the recursive JSON object type exceeds
 * TypeScript's instantiation depth.
 */
const blockSettingsSchema = v.optional(
  v.custom<BlockSettingsDto>(isJsonObject),
  (): BlockSettingsDto => ({}),
);

const blockEnvelopeEntries = {
  anchor: v.optional(
    v.pipe(
      v.string(),
      v.check(
        (value: string) => isBlockAnchor(value),
        "An anchor must start with a lowercase letter and use only lowercase letters, digits and hyphens, up to 64 characters.",
      ),
    ),
  ),
  className: v.optional(
    v.pipe(
      v.string(),
      v.check(
        (value: string) => normalizeBlockClassName(value) !== undefined,
        "A class name must hold 1 to 16 valid class tokens, up to 256 characters.",
      ),
    ),
  ),
  settings: blockSettingsSchema,
};

const blockIdentityEntries = {
  data: jsonObjectSchema,
  key: identifierSchema,
  position: nonNegativeIntegerSchema,
  schemaVersion: v.pipe(v.number(), v.integer(), v.minValue(1)),
  type: identifierSchema,
};

/** An admin block; omitted envelope values default (visible, no anchor or class). */
export const contentBlockSchema = v.strictObject({
  ...blockIdentityEntries,
  ...blockEnvelopeEntries,
  hidden: v.optional(v.boolean(), false),
});

/** A delivered block: hidden blocks are never public, so there is no `hidden` key. */
export const publicBlockSchema = v.strictObject({
  ...blockIdentityEntries,
  ...blockEnvelopeEntries,
});

export type ContentBlockDto = v.InferOutput<typeof contentBlockSchema>;
export type PublicBlockDto = v.InferOutput<typeof publicBlockSchema>;
/** Shared normalization of validated block DTOs into portable command values. */
export function toContentBlockInput(
  block: ContentBlockDto,
): import("@lacecms/domain").ContentBlockInput {
  return {
    ...(block.anchor === undefined ? {} : { anchor: block.anchor }),
    ...(block.className === undefined ? {} : { className: block.className }),
    data: block.data,
    hidden: block.hidden,
    key: blockKey(block.key),
    position: block.position,
    schemaVersion: block.schemaVersion,
    settings: v.parse(jsonObjectSchema, block.settings),
    type: block.type,
  };
}

export function toContentBlockDto(block: ContentBlock): ContentBlockDto {
  return { ...toPublicBlockDto(block), hidden: block.hidden };
}

/** Maps a delivered block; callers leave hidden blocks out first. */
export function toPublicBlockDto(block: ContentBlock): PublicBlockDto {
  return {
    ...(block.anchor === undefined ? {} : { anchor: block.anchor }),
    ...(block.className === undefined ? {} : { className: block.className }),
    data: block.data,
    key: block.key,
    position: block.position,
    schemaVersion: block.schemaVersion,
    settings: block.settings,
    type: block.type,
  };
}

/** The delivered blocks of a published snapshot, ordered by position, without hidden ones. */
export function publicBlocks(blocks: readonly ContentBlock[]): PublicBlockDto[] {
  return blocks
    .filter((block) => !block.hidden)
    .sort((left, right) => left.position - right.position)
    .map(toPublicBlockDto);
}
