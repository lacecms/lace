import type { ActorId, MediaId, UnixMilliseconds } from "../shared/brands.js";

export type MediaStatus = "active" | "delete_failed" | "deleting";

/** A point on the displayed image; `{0, 0}` is the top-left corner, each axis runs 0–1. */
export interface MediaFocalPoint {
  readonly x: number;
  readonly y: number;
}

export const MAX_MEDIA_ALT_LENGTH = 1_000;
export const MAX_MEDIA_CAPTION_LENGTH = 2_000;

/** Plain-text media metadata: alt text is single-line, captions may contain line breaks. */
export type MediaTextKind = "alt" | "caption";

/**
 * Normalizes submitted media text: trims, converts caption `CRLF`/`CR` to `LF`
 * and maps empty text to `null`. Returns `undefined` for text with control
 * characters (other than caption line breaks), unpaired surrogates, or more
 * code points than the limit, which matches SQLite `length()`.
 */
export function normalizeMediaText(value: string, kind: MediaTextKind): string | null | undefined {
  const text = (kind === "caption" ? value.replace(/\r\n?/gu, "\n") : value).trim();
  if (text.length === 0) return null;
  const forbidden = kind === "caption" ? /[^\P{Cc}\n]|\p{Cs}/u : /\p{Cc}|\p{Cs}/u;
  if (forbidden.test(text)) return undefined;
  const limit = kind === "caption" ? MAX_MEDIA_CAPTION_LENGTH : MAX_MEDIA_ALT_LENGTH;
  return [...text].length > limit ? undefined : text;
}

/** ASCII-only media organization; reject controls before trimming can hide them. */
export function normalizeMediaTag(value: unknown): string | undefined {
  if (typeof value !== "string" || /\p{Cc}/u.test(value)) return undefined;
  const tag = value.trim().replace(/[A-Z]/g, (letter) => letter.toLowerCase());
  return /^[a-z0-9-]{1,40}$/.test(tag) ? tag : undefined;
}

/** Reports the original input position, including the first excessive distinct tag. */
export function normalizeMediaTags(
  values: readonly unknown[],
): { readonly tags: readonly string[] } | { readonly issue: number } {
  const tags = new Set<string>();
  for (const [index, value] of values.entries()) {
    const tag = normalizeMediaTag(value);
    if (tag === undefined) return { issue: index };
    tags.add(tag);
    if (tags.size > 20) return { issue: index };
  }
  return { tags: Object.freeze([...tags].sort()) };
}

/** A focal-point coordinate is a finite number from 0 to 1 inclusive. */
export function isMediaFocalCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

/** A media content hash: a SHA-256 digest as 64 lowercase hexadecimal characters. */
export function isMediaSha256(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
}

/** Metadata for an object-store asset; binary data never belongs in this value. */
export interface MediaMetadata {
  readonly tags: readonly string[];
  readonly alt?: string;
  readonly caption?: string;
  readonly createdAt: UnixMilliseconds;
  readonly createdBy: ActorId;
  readonly filename: string;
  readonly focalPoint?: MediaFocalPoint;
  readonly height?: number;
  readonly id: MediaId;
  readonly mimeType: string;
  /** SHA-256 of the stored bytes as lowercase hex; absent for media uploaded before 0015. */
  readonly sha256?: string;
  readonly size: number;
  readonly status: MediaStatus;
  readonly storageKey: string;
  readonly updatedAt: UnixMilliseconds;
  readonly width?: number;
}
