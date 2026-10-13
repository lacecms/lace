import { ContentValidationError, seoTextLength } from "@lacecms/content";
import type { Brand } from "./index.js";

export const MAX_SEO_TITLE_LENGTH = 200;
export const MAX_SEO_DESCRIPTION_LENGTH = 500;
export const MAX_SEO_CANONICAL_LENGTH = 2_048;

type SeoMediaId = Brand<string, "MediaId">;

/**
 * The per-entry SEO system group stored with a snapshot outside its fields.
 * Values are normalized: unset values are absent and `noindex` is present only
 * when `true`. A snapshot without any value carries no group.
 */
export interface EntrySeo {
  readonly canonical?: string;
  readonly description?: string;
  readonly image?: SeoMediaId;
  readonly noindex?: true;
  readonly title?: string;
}

export type SeoTextKind = "description" | "title";

/**
 * Normalizes single-line SEO text: trims and maps empty text to `null`.
 * Returns `undefined` for text with control characters (line breaks included),
 * unpaired surrogates, or more code points than the limit.
 */
export function normalizeSeoText(value: string, kind: SeoTextKind): string | null | undefined {
  const text = value.trim();
  if (text.length === 0) return null;
  if (/\p{Cc}|\p{Cs}/u.test(text)) return undefined;
  const limit = kind === "title" ? MAX_SEO_TITLE_LENGTH : MAX_SEO_DESCRIPTION_LENGTH;
  return seoTextLength(text) > limit ? undefined : text;
}

/** The subset of the WHATWG URL API used here; compiles without DOM or Node types. */
interface ParsedUrl {
  readonly host: string;
  readonly password: string;
  readonly protocol: string;
  readonly username: string;
}
declare const URL: new (value: string) => ParsedUrl;

/**
 * Whether a trimmed value is an allowed canonical URL: an absolute `http:` or
 * `https:` URL with a host, without credentials, fragment, whitespace or
 * control characters, at most 2,048 characters. A query is allowed.
 */
export function isCanonicalUrl(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_SEO_CANONICAL_LENGTH ||
    /[\s\p{Cc}]/u.test(value) ||
    value.includes("#") ||
    !/^https?:\/\/[^/]/iu.test(value)
  ) {
    return false;
  }
  let url: ParsedUrl;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (
    (url.protocol === "http:" || url.protocol === "https:") &&
    url.host.length > 0 &&
    url.username.length === 0 &&
    url.password.length === 0
  );
}

const SEO_KEYS = ["canonical", "description", "image", "noindex", "title"] as const;
const MEDIA_ID_PATTERN = /^\S{1,255}$/u;

function invalid(path: readonly string[], code: string, message: string): never {
  throw new ContentValidationError([{ code, message, path: ["seo", ...path] }]);
}

/**
 * Validates and normalizes a submitted SEO group for a model. `null` and
 * `undefined` mean no group; a non-null group for a model without SEO fails
 * with `seo_not_allowed`. Every value may be `null` to clear it. Returns
 * `undefined` when nothing remains set.
 */
export function normalizeEntrySeo(
  input: unknown,
  options: { readonly enabled: boolean },
): EntrySeo | undefined {
  if (input === null || input === undefined) return undefined;
  if (!options.enabled) invalid([], "seo_not_allowed", "is not enabled for this content model.");
  if (typeof input !== "object" || Array.isArray(input)) {
    invalid([], "invalid_seo", "must be an object.");
  }
  const values = input as Record<string, unknown>;
  for (const key of Object.keys(values)) {
    if (!(SEO_KEYS as readonly string[]).includes(key)) {
      invalid([key], "unknown_key", "is not allowed.");
    }
  }
  const result: { -readonly [Key in keyof EntrySeo]: EntrySeo[Key] } = {};
  for (const kind of ["title", "description"] as const) {
    const value = values[kind];
    if (value === null || value === undefined) continue;
    if (typeof value !== "string") invalid([kind], "invalid_seo_text", "must be plain text.");
    const text = normalizeSeoText(value, kind);
    if (text === undefined) {
      const limit = kind === "title" ? MAX_SEO_TITLE_LENGTH : MAX_SEO_DESCRIPTION_LENGTH;
      if (/\p{Cc}|\p{Cs}/u.test(value.trim())) {
        invalid([kind], "invalid_seo_text", "must be single-line plain text.");
      }
      invalid([kind], "seo_text_too_long", `must not exceed ${limit} characters.`);
    }
    if (text !== null) result[kind] = text;
  }
  const canonical = values.canonical;
  if (canonical !== null && canonical !== undefined) {
    if (typeof canonical !== "string") {
      invalid(["canonical"], "invalid_canonical_url", "must be an absolute http or https URL.");
    }
    const trimmed = canonical.trim();
    if (trimmed.length > MAX_SEO_CANONICAL_LENGTH) {
      invalid(
        ["canonical"],
        "canonical_too_long",
        `must not exceed ${MAX_SEO_CANONICAL_LENGTH} characters.`,
      );
    }
    if (trimmed.length > 0) {
      if (!isCanonicalUrl(trimmed)) {
        invalid(
          ["canonical"],
          "invalid_canonical_url",
          "must be an absolute http or https URL without credentials or fragment.",
        );
      }
      result.canonical = trimmed;
    }
  }
  const image = values.image;
  if (image !== null && image !== undefined) {
    if (typeof image !== "string" || !MEDIA_ID_PATTERN.test(image)) {
      invalid(["image"], "invalid_seo_image", "must be a media identifier.");
    }
    result.image = image as SeoMediaId;
  }
  const noindex = values.noindex;
  if (noindex !== null && noindex !== undefined) {
    if (typeof noindex !== "boolean") invalid(["noindex"], "invalid_noindex", "must be a boolean.");
    if (noindex) result.noindex = true;
  }
  return Object.keys(result).length === 0 ? undefined : Object.freeze(result);
}

/** Copies a normalized SEO group. */
export function cloneEntrySeo(seo: EntrySeo): EntrySeo {
  return {
    ...(seo.canonical === undefined ? {} : { canonical: seo.canonical }),
    ...(seo.description === undefined ? {} : { description: seo.description }),
    ...(seo.image === undefined ? {} : { image: seo.image }),
    ...(seo.noindex === true ? { noindex: true as const } : {}),
    ...(seo.title === undefined ? {} : { title: seo.title }),
  };
}
