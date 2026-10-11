import { formatSeoTitle, seoText } from "@lacecms/contracts";
import type { ContentModelDto } from "@lacecms/contracts";
import { fieldLabel, siteUrlFor } from "./draft.js";
import type { DraftEditorValues } from "./editor-form.js";

/** Site SEO default values read from the published defaults global. */
export interface SeoSiteDefaults {
  readonly description?: string;
  readonly image?: string;
  readonly siteName?: string;
  readonly titleTemplate?: string;
}

/** The search result the site would show for the current form values. */
export interface SeoPreview {
  readonly description: string | undefined;
  readonly hidden: boolean;
  readonly title: string;
  readonly url: string | undefined;
}

/** What each empty SEO value inherits, and the resulting search-result preview. */
export interface SeoInheritance {
  readonly canonicalPlaceholder: string;
  readonly descriptionPlaceholder: string | undefined;
  /** A sentence naming the inherited image, or saying there is none. */
  readonly imageInheritance: string;
  readonly preview: SeoPreview;
  readonly titlePlaceholder: string;
}

function editorPath(
  model: ContentModelDto,
  values: { readonly slug: string | undefined },
): string | undefined {
  if (model.kind === "page") return model.path;
  const slug = values.slug?.trim() ?? "";
  if (model.kind !== "collection" || model.route === undefined || slug === "") return undefined;
  return model.route.replace(":slug", slug);
}

/**
 * Applies the ADR 0011 fallback chain to unsaved form values, as the site's
 * SEO resolver does: stored SEO values, then the model's mapped fields, then
 * the site defaults.
 */
export function seoInheritance({
  defaults,
  model,
  siteUrl,
  values,
}: {
  readonly defaults: SeoSiteDefaults | undefined;
  readonly model: ContentModelDto;
  readonly siteUrl: string | undefined;
  readonly values: {
    readonly fields: DraftEditorValues["fields"];
    readonly seo: DraftEditorValues["seo"] | undefined;
    readonly slug: string | undefined;
    readonly title: string;
  };
}): SeoInheritance {
  const mapping = model.seo;
  const stored = values.seo;
  const entryTitle = values.title.trim();
  const formattedTitle = formatSeoTitle(entryTitle === "" ? "Untitled" : entryTitle, defaults);

  const descriptionKey = mapping?.description ?? undefined;
  const mappedDescription =
    descriptionKey === undefined ? undefined : seoText(values.fields[descriptionKey]);
  const descriptionPlaceholder =
    descriptionKey !== undefined && mappedDescription !== undefined
      ? `Uses ${fieldLabel(descriptionKey, model.fields[descriptionKey]?.label)}: ${mappedDescription}`
      : defaults?.description === undefined
        ? undefined
        : `Uses site description: ${defaults.description}`;

  const imageKey = mapping?.image ?? undefined;
  const mappedImage = imageKey === undefined ? undefined : values.fields[imageKey];
  const imageInheritance =
    imageKey !== undefined && typeof mappedImage === "string" && mappedImage !== ""
      ? `Uses the image from ${fieldLabel(imageKey, model.fields[imageKey]?.label)}`
      : defaults?.image === undefined
        ? "No image is shared"
        : "Uses the site image";

  const path = editorPath(model, values);
  const pageUrl =
    siteUrl === undefined || path === undefined ? undefined : siteUrlFor(siteUrl, path);
  const canonical = stored?.canonical.trim() ?? "";
  return {
    canonicalPlaceholder:
      pageUrl === undefined ? "Uses this page's URL" : `Uses this page's URL: ${pageUrl}`,
    descriptionPlaceholder,
    imageInheritance,
    preview: {
      description:
        seoText(stored?.description) ?? mappedDescription ?? seoText(defaults?.description),
      hidden: stored?.noindex === true,
      title: seoText(stored?.title) ?? formattedTitle,
      url: canonical === "" ? (pageUrl ?? path) : canonical,
    },
    titlePlaceholder:
      entryTitle === ""
        ? "Uses entry title"
        : `Uses entry title: ${formatSeoTitle(entryTitle, defaults)}`,
  };
}
