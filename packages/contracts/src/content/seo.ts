import { isCanonicalUrl, MAX_SEO_CANONICAL_LENGTH, normalizeSeoText } from "@lacecms/domain";
import type { EntrySeo } from "@lacecms/domain";
import * as v from "valibot";
import { identifierSchema } from "../shared/primitives.js";

/** Collapses whitespace runs and trims a string value; anything else, or blank text, is absent. */
export function seoText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.replace(/\s+/gu, " ").trim();
  return text === "" ? undefined : text;
}

/** The site default values that shape an entry's search title. */
export interface SeoTitleDefaults {
  readonly siteName?: string | undefined;
  readonly titleTemplate?: string | undefined;
}

/**
 * Formats an entry title for search results (ADR 0011): a title template
 * applies only when it contains `%s`, which is replaced literally; otherwise
 * `{title} | {siteName}`, or the bare title without a site name.
 */
export function formatSeoTitle(title: string, defaults: SeoTitleDefaults | undefined): string {
  const template = seoText(defaults?.titleTemplate);
  // A function replacer keeps `$&` and similar sequences in titles literal.
  if (template?.includes("%s") === true) return template.replace("%s", () => title);
  const siteName = seoText(defaults?.siteName);
  return siteName === undefined ? title : `${title} | ${siteName}`;
}

/**
 * The SEO group of an entry of an SEO-enabled model as clients read it:
 * every value is present, `null` when unset.
 */
export const seoValueSchema = v.strictObject({
  canonical: v.nullable(
    v.pipe(
      v.string(),
      v.check((value: string) => isCanonicalUrl(value), "Invalid canonical URL."),
    ),
  ),
  description: v.nullable(v.pipe(v.string(), v.minLength(1))),
  image: v.nullable(identifierSchema),
  noindex: v.boolean(),
  title: v.nullable(v.pipe(v.string(), v.minLength(1))),
});

function seoTextSchema(kind: "description" | "title") {
  return v.nullable(
    v.pipe(
      v.string(),
      v.check(
        (value) => normalizeSeoText(value, kind) !== undefined,
        kind === "title"
          ? "An SEO title must be single-line plain text of at most 200 characters."
          : "An SEO description must be single-line plain text of at most 500 characters.",
      ),
    ),
  );
}

/** A submitted SEO group: each value is optional, and `null` or empty text clears it. */
export const seoInputSchema = v.strictObject({
  canonical: v.optional(
    v.nullable(
      v.pipe(
        v.string(),
        v.maxLength(MAX_SEO_CANONICAL_LENGTH + 64),
        v.check(
          (value) => value.trim().length === 0 || isCanonicalUrl(value.trim()),
          "A canonical URL must be an absolute http or https URL without credentials or fragment.",
        ),
      ),
    ),
  ),
  description: v.optional(seoTextSchema("description")),
  image: v.optional(v.nullable(identifierSchema)),
  noindex: v.optional(v.boolean()),
  title: v.optional(seoTextSchema("title")),
});

export type SeoValueDto = v.InferOutput<typeof seoValueSchema>;
export type SeoInputDto = v.InferOutput<typeof seoInputSchema>;
/** Maps a stored SEO group to the complete client shape with `null` for unset values. */
export function toSeoDto(seo: EntrySeo | undefined): SeoValueDto {
  return {
    canonical: seo?.canonical ?? null,
    description: seo?.description ?? null,
    image: seo?.image ?? null,
    noindex: seo?.noindex === true,
    title: seo?.title ?? null,
  };
}

/** Whether an entry's model enables SEO, which decides if its DTOs carry `seo`. */
export interface SeoMappingOptions {
  readonly seo?: boolean;
}
