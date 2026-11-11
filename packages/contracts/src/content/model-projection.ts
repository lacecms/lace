import { normalizeFieldVisibility, normalizeFormLayout } from "@lacecms/content";
import type {
  ContentModelDto,
  ContentModelListDto,
  ModelSeoDto,
  SeoDefaultsDto,
} from "./models.js";
import type { FieldMetadataMapDto } from "./metadata.js";
import type {
  BlockMetadata,
  ContentModelKind,
  FieldVisibility,
  FormLayout,
} from "@lacecms/content";
import type { ContentModelRoute } from "@lacecms/domain";
import type { CollectionListOptionsSource, ListQueryLimits } from "./collection-queries.js";

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
            .map(([key, value]) => [key, typeof value === "string" ? value : [...value!]]),
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

export interface ContentModelSource {
  readonly blockDefinitions: readonly BlockMetadata[];
  readonly blocks: readonly string[];
  readonly description?: string;
  readonly fields: FieldMetadataMapDto;
  readonly key: string;
  readonly kind: ContentModelKind;
  readonly label?: string;
  readonly listFields?: readonly string[];
  readonly listOptions?: CollectionListOptionsSource;
  readonly layout?: FormLayout;
  readonly path?: string;
  readonly route?: string;
  readonly seo?: { readonly description?: string; readonly image?: string };
  readonly seoDefaults?: {
    readonly description?: string;
    readonly image?: string;
    readonly siteName: string;
    readonly titleTemplate?: string;
  };
  readonly version: number;
  readonly visibility?: FieldVisibility;
}

/** Maps a portable route without importing configuration or persistence types. */
export function toContentModelRouteDto(route: ContentModelRoute) {
  switch (route.kind) {
    case "page":
      return { kind: "page" as const, key: route.key, path: route.path };
    case "collection":
      return route.route === undefined
        ? { kind: "collection" as const, key: route.key }
        : { kind: "collection" as const, key: route.key, route: route.route };
    case "global":
      return { kind: "global" as const, key: route.key };
    default:
      return route satisfies never;
  }
}

/** Pure projections of the authorized application results; no lookup lives here. */
export function toContentModelDiscoveryDto(input: {
  readonly items: readonly ContentModelSource[];
  readonly listQueryLimits: ListQueryLimits;
}): ContentModelListDto {
  return { items: input.items.map(toContentModelDto), listQueryLimits: input.listQueryLimits };
}
