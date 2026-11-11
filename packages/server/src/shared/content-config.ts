import { toModelSeoDto, toSeoDefaultsDto } from "@lacecms/contracts";
import type { ExportSeoDto, toContentModelDto } from "@lacecms/contracts";

export interface ServerModelBase {
  readonly layout?: import("@lacecms/content").FormLayout;
  readonly blocks: readonly string[];
  readonly description?: string;
  readonly fields: unknown;
  readonly key: string;
  readonly label?: string;
  readonly version: number;
}

export interface ServerModelSeo {
  readonly description?: string;
  readonly image?: string;
}

export interface ServerSeoDefaults {
  readonly description?: string;
  readonly image?: string;
  readonly siteName: string;
  readonly titleTemplate?: string;
}

export type ServerContentModel =
  | (ServerModelBase & {
      readonly kind: "collection";
      readonly listFields?: readonly string[];
      readonly listOptions?: Parameters<typeof toContentModelDto>[0]["listOptions"];
      /** Absent for a route-less collection. */
      readonly route?: string;
      readonly seo?: ServerModelSeo;
    })
  | (ServerModelBase & { readonly kind: "global"; readonly seoDefaults?: ServerSeoDefaults })
  | (ServerModelBase & {
      readonly kind: "page";
      readonly path: string;
      readonly seo?: ServerModelSeo;
    });

export interface ServerBlockMetadata {
  readonly type: string;
}

export interface ServerConfig {
  readonly blocks?: readonly ServerBlockMetadata[];
  readonly content: readonly ServerContentModel[];
}
export function contentModel(config: ServerConfig, key: string): ServerContentModel | undefined {
  return config.content.find((model) => model.key === key);
}

export function pageModel(
  config: ServerConfig,
  key: string,
): Extract<ServerContentModel, { readonly kind: "page" }> | undefined {
  const model = contentModel(config, key);
  return model?.kind === "page" ? model : undefined;
}

export function globalModel(
  config: ServerConfig,
  key: string,
): Extract<ServerContentModel, { readonly kind: "global" }> | undefined {
  const model = contentModel(config, key);
  return model?.kind === "global" ? model : undefined;
}

type ServerCollectionModel = Extract<ServerContentModel, { readonly kind: "collection" }>;

/** A collection that declares a route; route-less collections answer as unknown. */
export function collectionModel(
  config: ServerConfig,
  key: string,
): (ServerCollectionModel & { readonly route: string }) | undefined {
  const model = contentModel(config, key);
  return model?.kind === "collection" && model.route !== undefined
    ? { ...model, route: model.route }
    : undefined;
}

/** A collection without a route, whose published entries are public records. */
export function routeLessCollectionModel(
  config: ServerConfig,
  key: string,
): ServerCollectionModel | undefined {
  const model = contentModel(config, key);
  return model?.kind === "collection" && model.route === undefined ? model : undefined;
}

/** The export's SEO section: fallback fields of SEO-enabled models and the defaults global. */
export function exportSeo(config: ServerConfig): ExportSeoDto {
  const models: Record<string, { description: string | null; image: string | null }> = {};
  let defaults: ExportSeoDto["defaults"] = null;
  for (const model of [...config.content].sort((left, right) =>
    left.key < right.key ? -1 : left.key > right.key ? 1 : 0,
  )) {
    if (model.kind === "global") {
      if (model.seoDefaults !== undefined) {
        defaults = { ...toSeoDefaultsDto(model.seoDefaults), modelKey: model.key };
      }
    } else if (model.seo !== undefined) {
      models[model.key] = toModelSeoDto(model.seo);
    }
  }
  return { defaults, models };
}
