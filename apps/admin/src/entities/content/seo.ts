import {
  isCanonicalUrl,
  MAX_SEO_CANONICAL_LENGTH,
  MAX_SEO_DESCRIPTION_LENGTH,
  MAX_SEO_TITLE_LENGTH,
  normalizeSeoText,
} from "@lacecms/contracts";
import type { ContentModelDto, SeoInputDto, SeoValueDto } from "@lacecms/contracts";

/** The SEO group as the editor form holds it: text inputs need strings. */
export interface SeoFormValues {
  canonical: string;
  description: string;
  image: string | null;
  noindex: boolean;
  title: string;
}

/** The SEO group a save sends; every value is present. */
export interface SeoSaveInput extends SeoInputDto {
  readonly canonical: string | null;
  readonly description: string | null;
  readonly image: string | null;
  readonly noindex: boolean;
  readonly title: string | null;
}

/** Lengths above which search results usually shorten the text. */
export const SEO_TITLE_RECOMMENDED = 60;
export const SEO_DESCRIPTION_RECOMMENDED = 160;

/** The editor control of each SEO value, in card order. */
export const SEO_CONTROLS = [
  { id: "seo-title", key: "title", label: "SEO title" },
  { id: "seo-description", key: "description", label: "SEO description" },
  { id: "seo-image", key: "image", label: "SEO image" },
  { id: "seo-canonical", key: "canonical", label: "Canonical URL" },
  { id: "seo-noindex", key: "noindex", label: "Hide from search engines" },
] as const;

export type SeoKey = (typeof SEO_CONTROLS)[number]["key"];

export const SEO_MESSAGES = {
  canonical:
    "Enter an absolute URL that starts with https:// or http://, without credentials or a # fragment.",
  canonicalTooLong: `Enter no more than ${MAX_SEO_CANONICAL_LENGTH.toLocaleString("en-US")} characters.`,
  descriptionTooLong: `Enter no more than ${MAX_SEO_DESCRIPTION_LENGTH} characters.`,
  image: "Choose a media item.",
  notAllowed: "SEO is no longer enabled for this model. Reload the entry to continue.",
  singleLine: "Use a single line of plain text without line breaks.",
  titleTooLong: `Enter no more than ${MAX_SEO_TITLE_LENGTH} characters.`,
} as const;

/** Form values of a loaded SEO group; unset values become empty inputs. */
export function seoFormValues(seo: SeoValueDto | undefined): SeoFormValues {
  return {
    canonical: seo?.canonical ?? "",
    description: seo?.description ?? "",
    image: seo?.image ?? null,
    noindex: seo?.noindex === true,
    title: seo?.title ?? "",
  };
}

function blankToNull(value: string): string | null {
  const text = value.trim();
  return text === "" ? null : text;
}

/** The complete SEO group a save sends: trimmed text, and `null` for every unset value. */
export function seoInput(values: SeoFormValues): SeoSaveInput {
  return {
    canonical: blankToNull(values.canonical),
    description: blankToNull(values.description),
    image: values.image ?? null,
    noindex: values.noindex,
    title: blankToNull(values.title),
  };
}

export { seoTextLength } from "@lacecms/content";

function textProblem(value: string, kind: "description" | "title"): string | undefined {
  if (normalizeSeoText(value, kind) !== undefined) return undefined;
  if (/\p{Cc}|\p{Cs}/u.test(value.trim())) return SEO_MESSAGES.singleLine;
  return kind === "title" ? SEO_MESSAGES.titleTooLong : SEO_MESSAGES.descriptionTooLong;
}

/** The sentence for a canonical URL the API would reject, or `undefined`. */
export function canonicalProblem(value: string): string | undefined {
  const url = value.trim();
  const length = url.length;
  if (url === "" || isCanonicalUrl(url)) return undefined;
  return length > MAX_SEO_CANONICAL_LENGTH ? SEO_MESSAGES.canonicalTooLong : SEO_MESSAGES.canonical;
}

/** Local validation of the SEO group with the API's rules; messages never repeat the value. */
export function seoProblems(values: SeoFormValues): Partial<Record<SeoKey, string>> {
  const problems: Partial<Record<SeoKey, string>> = {};
  const title = textProblem(values.title, "title");
  if (title !== undefined) problems.title = title;
  const description = textProblem(values.description, "description");
  if (description !== undefined) problems.description = description;
  const canonical = canonicalProblem(values.canonical);
  if (canonical !== undefined) problems.canonical = canonical;
  return problems;
}

const DEFAULT_ANNOTATIONS = {
  description: "Default description for search and social previews.",
  image: "Default image for social previews.",
  siteName: "Site name used in search and social titles.",
  titleTemplate: "Title template for search results; %s stands for the entry title.",
} as const;

/** Which site SEO defaults a field of the defaults global provides, as one sentence or more. */
export function seoDefaultsAnnotation(model: ContentModelDto, key: string): string | undefined {
  const mapping = model.seoDefaults;
  if (mapping === undefined) return undefined;
  const sentences = (["siteName", "titleTemplate", "description", "image"] as const)
    .filter((role) => mapping[role] === key)
    .map((role) => DEFAULT_ANNOTATIONS[role]);
  return sentences.length === 0 ? undefined : sentences.join(" ");
}
