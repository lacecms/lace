import { unixMilliseconds } from "@lacecms/domain";
import type { UnixMilliseconds } from "@lacecms/domain";
import { MAX_PAGE_SIZE } from "@lacecms/content";
import * as v from "valibot";

export const identifierSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(255));
export const nonNegativeIntegerSchema = v.pipe(v.number(), v.integer(), v.minValue(0));
const utcTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const entityTagPattern = /^(?:W\/)?"[0-9]+"$/u;
const idempotencyKeyPattern = /^[\x21-\x7e]{1,255}$/u;
const jsonPointerPattern = /^(?:\/(?:[^~/]|~[01])*)*$/u;

export const positiveIntegerSchema = v.pipe(v.number(), v.integer(), v.minValue(1));

function isUtcTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    utcTimestampPattern.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}

export const identifierSchemaPublic = identifierSchema;
export const expectedRevisionSchema = nonNegativeIntegerSchema;
export const opaqueCursorSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(4_096));
/**
 * An admin list page limit from 1 to `MAX_PAGE_SIZE` as a canonical decimal
 * query string. The grammar spells the three-digit bound `MAX_PAGE_SIZE`
 * (100); a contracts test pins the accepted range to the constant.
 */
export const pageLimitQuerySchema = v.pipe(
  v.string(),
  v.regex(new RegExp(`^(?:[1-9]|[1-9][0-9]|${MAX_PAGE_SIZE})$`, "u")),
);
export const isoTimestampSchema = v.custom<string>(isUtcTimestamp);
/** A media content hash: 64 lowercase hexadecimal characters. */
export const mediaSha256Schema = v.pipe(v.string(), v.regex(/^[0-9a-f]{64}(?![\s\S])/u));
/** A single strong or weak validator encoding a safe published-state version. */
export const entityTagSchema = v.pipe(
  v.string(),
  v.regex(entityTagPattern),
  v.check((value) => Number.isSafeInteger(Number(value.replace(/^W\//u, "").slice(1, -1)))),
);
export const idempotencyKeySchema = v.pipe(v.string(), v.regex(idempotencyKeyPattern));
export const jsonPointerSchema = v.pipe(v.string(), v.regex(jsonPointerPattern));

export type OpaqueCursorDto = v.InferOutput<typeof opaqueCursorSchema>;
export type IsoTimestamp = v.InferOutput<typeof isoTimestampSchema>;
export type EntityTag = v.InferOutput<typeof entityTagSchema>;
export type IdempotencyKey = v.InferOutput<typeof idempotencyKeySchema>;

/** Converts a portable Unix-millisecond value into the canonical JSON timestamp. */
export function toIsoTimestamp(value: UnixMilliseconds | number): IsoTimestamp {
  const timestamp = new Date(value);
  if (!Number.isFinite(value) || Number.isNaN(timestamp.getTime())) {
    throw new TypeError("A timestamp must be a finite Unix-millisecond value.");
  }
  return timestamp.toISOString() as IsoTimestamp;
}

/** Parses a canonical JSON timestamp into a portable Unix-millisecond value. */
export function fromIsoTimestamp(value: string): UnixMilliseconds {
  const parsed = v.safeParse(isoTimestampSchema, value);
  if (!parsed.success) throw new TypeError("A timestamp must be canonical ISO-8601 UTC.");
  return unixMilliseconds(Date.parse(parsed.output));
}

export function cursorPageSchema<
  ItemSchema extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>,
>(itemSchema: ItemSchema) {
  return v.strictObject({
    items: v.array(itemSchema),
    nextCursor: v.optional(opaqueCursorSchema),
  });
}
