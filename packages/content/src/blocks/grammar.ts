/** Block type grammar without anchors, for OpenAPI strings and composed grammars. */
export const BLOCK_TYPE_SOURCE = "[A-Za-z][A-Za-z0-9-]*";
/** Block types: an ASCII letter followed by ASCII letters, digits or hyphens. */
export const BLOCK_TYPE_PATTERN = new RegExp(`^${BLOCK_TYPE_SOURCE}$`, "u");
/** A block instance key: a block type or a ULID. */
export const BLOCK_KEY_PATTERN = new RegExp(
  `^(?:${BLOCK_TYPE_SOURCE}|[0-7][0-9A-HJKMNP-TV-Z]{25})$`,
  "u",
);

/** Maximum length of a block anchor. */
export const MAX_BLOCK_ANCHOR_LENGTH = 64;
/** Maximum length of a normalized block class name. */
export const MAX_BLOCK_CLASS_NAME_LENGTH = 256;
/** Maximum number of class tokens in a block class name. */
export const MAX_BLOCK_CLASS_TOKENS = 16;
/** Maximum length of one block class token. */
export const MAX_BLOCK_CLASS_TOKEN_LENGTH = 64;

const BLOCK_ANCHOR_PATTERN = /^[a-z][a-z0-9-]{0,63}$/u;
const BLOCK_CLASS_TOKEN_PATTERN = /^[A-Za-z_-][A-Za-z0-9_\-:/.%#[\]]*$/u;

/** Whether a value is a block anchor: a lowercase letter, then lowercase letters, digits and hyphens. */
export function isBlockAnchor(value: unknown): value is string {
  return typeof value === "string" && BLOCK_ANCHOR_PATTERN.test(value);
}

/**
 * Normalizes a block class name: whitespace-separated class tokens, repeats
 * dropped, joined with single spaces. Returns `undefined` for a non-string,
 * blank or invalid value.
 */
export function normalizeBlockClassName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const tokens = [...new Set(value.split(/[\t\n\f\r ]+/u).filter((token) => token !== ""))];
  if (
    tokens.length === 0 ||
    tokens.length > MAX_BLOCK_CLASS_TOKENS ||
    tokens.some(
      (token) =>
        token.length > MAX_BLOCK_CLASS_TOKEN_LENGTH || !BLOCK_CLASS_TOKEN_PATTERN.test(token),
    )
  ) {
    return undefined;
  }
  const normalized = tokens.join(" ");
  return normalized.length > MAX_BLOCK_CLASS_NAME_LENGTH ? undefined : normalized;
}
