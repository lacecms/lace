import { normalizeFieldVisibility, normalizeFormLayout } from "@lacecms/content";
import type { ContentModelSource, ContentModelDto, ModelSeoDto, SeoDefaultsDto } from "./index.js";

/** Maps a model's SEO fallback fields with `null` for unmapped values. */
export function toModelSeoDto(seo: NonNullable<ContentModelSource["seo"]>): ModelSeoDto {
  return { description: seo.description ?? null, image: seo.image ?? null };
}

/** Maps a site SEO defaults mapping with `null` for unmapped optional values. */
export function toSeoDefaultsDto(
  defaults: NonNullable<ContentModelSource["seoDefaults"]>,
): SeoDefaultsDto {
  return {
    description: defaults.description ?? null,
    image: defaults.image ?? null,
    siteName: defaults.siteName,
    titleTemplate: defaults.titleTemplate ?? null,
  };
}

// Preserve the existing serialized order, including listOptions before layout.
const contentModelProjection = {
  blockDefinitions: (m) => (m.blockDefinitions === undefined ? undefined : [...m.blockDefinitions]),
  blocks: (m) => [...m.blocks],
  description: (m) => m.description,
  fields: (m) => m.fields,
  key: (m) => m.key,
  kind: (m) => m.kind,
  label: (m) => m.label,
  listFields: (m) => (m.listFields === undefined ? undefined : [...m.listFields]),
  listOptions: (m) =>
    m.listOptions === undefined
      ? undefined
      : Object.fromEntries(
          Object.entries(m.listOptions)
            .filter(([, value]) => value !== undefined)
            .map(([key, value]) => [key, [...value!]]),
        ),
  layout: (m) => (m.layout === undefined ? undefined : normalizeFormLayout(m.layout, m.fields)!),
  path: (m) => m.path,
  route: (m) => m.route,
  seo: (m) => (m.seo === undefined ? undefined : toModelSeoDto(m.seo)),
  seoDefaults: (m) => (m.seoDefaults === undefined ? undefined : toSeoDefaultsDto(m.seoDefaults)),
  version: (m) => m.version,
  visibility: (m) =>
    m.visibility === undefined ? undefined : normalizeFieldVisibility(m.visibility, m.fields)!,
} satisfies { readonly [K in keyof ContentModelSource]-?: (model: ContentModelSource) => unknown };

// Internal module export: do not expand the package's public entry point.
export const CONTENT_MODEL_DTO_KEYS = Object.freeze(
  Object.keys(contentModelProjection) as (keyof typeof contentModelProjection)[],
);

export function toContentModelDto(model: ContentModelSource): ContentModelDto {
  const dto: Record<string, unknown> = {};
  for (const key of CONTENT_MODEL_DTO_KEYS) {
    const value = contentModelProjection[key](model);
    if (value !== undefined) dto[key] = value;
  }
  return dto as ContentModelDto;
}
