/** Runtime capabilities, independent of content-model configuration identity. */
export interface ListQueryLimits {
  readonly maxSearchLength: number;
  readonly maxLikePatternBytes: number | null;
}

export const NODE_LIST_QUERY_LIMITS: ListQueryLimits = Object.freeze({
  maxSearchLength: 200,
  maxLikePatternBytes: null,
});
export const CLOUDFLARE_LIST_QUERY_LIMITS: ListQueryLimits = Object.freeze({
  maxSearchLength: 48,
  maxLikePatternBytes: 50,
});
export const COLLECTION_MATCHING_VERSION = "sqlite-like-v1";

/** Escapes a literal substring for ordinary SQLite LIKE ... ESCAPE '\\'. */
export function literalLikePattern(value: string): string {
  return `%${value.replace(/[\\%_]/gu, "\\$&")}%`;
}

/** q is trimmed by its caller; contains must retain meaningful whitespace. */
export function fitsListQueryLimits(value: string, limits: ListQueryLimits): boolean {
  return (
    value.length <= limits.maxSearchLength &&
    (limits.maxLikePatternBytes === null ||
      utf8Bytes(literalLikePattern(value)) <= limits.maxLikePatternBytes)
  );
}

// Portable UTF-8 sizing, including replacement bytes for unpaired UTF-16 surrogates.
function utf8Bytes(value: string): number {
  let bytes = 0;
  for (const char of value) {
    const point = char.codePointAt(0)!;
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
  }
  return bytes;
}
