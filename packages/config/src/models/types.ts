import type {
  ContentEntrySystemSort,
  ListQueryableFieldType,
  SearchableFieldType,
  SeoTextFieldType,
  BlockDefinition,
  BlockMetadata,
  BlockRegistry,
  FieldDefinition,
  FieldVisibility,
  FieldVisibilityTargets,
  FormLayout,
  FieldIsRequired,
  FieldValue,
  JsonObject,
} from "@lacecms/content";

/** Field descriptors indexed by their stable configuration field key. */
export type FieldMap = Readonly<Record<string, FieldDefinition>>;

/**
 * The values inferred from a model's field descriptors. Conditional targets
 * named by `Visibility` (for example `typeof model.visibility`) are optional:
 * published values omit them while hidden.
 */
export type ModelFieldValues<Fields extends FieldMap, Visibility = undefined> = Readonly<
  {
    [
      Key in keyof Fields as Key extends FieldVisibilityTargets<Visibility>
        ? never
        : FieldIsRequired<Fields[Key]> extends true
          ? Key
          : never
    ]: FieldValue<Fields[Key]>;
  } & {
    readonly [
      Key in keyof Fields as Key extends FieldVisibilityTargets<Visibility>
        ? Key
        : FieldIsRequired<Fields[Key]> extends true
          ? never
          : Key
    ]?: FieldValue<Fields[Key]>;
  }
>;

/** Exposes a model's inferred conditional-field rules on its definition type. */
export type ModelVisibility<Visibility> = [Visibility] extends [undefined]
  ? {}
  : { readonly visibility: Visibility };

export interface CommonModelInput<Fields extends FieldMap> {
  readonly blocks?: readonly string[];
  readonly description?: string;
  readonly fields?: Fields;
  readonly layout?: FormLayout<keyof Fields & string>;
  readonly key: string;
  readonly label?: string;
  readonly renamedFrom?: string;
  /** Temporary hint: block types whose stored blocks sync may drop. */
  readonly removedBlocks?: readonly string[];
  /** Temporary hint: former field keys whose stored values sync may prune. */
  readonly removedFields?: readonly string[];
  readonly version: number;
  /** Conditional-field rules over the model's own fields. */
  readonly visibility?: FieldVisibility<Fields>;
}

/** Fallback fields of the same model for SEO values the editor leaves unset. */
export interface ModelSeoInput<Fields extends FieldMap = FieldMap> {
  /** A `text` or `textarea` field used when the SEO description is unset. */
  readonly description?: ListQueryFieldKey<Fields, SeoTextFieldType>;
  /** A `media` field used when the SEO image is unset. */
  readonly image?: keyof Fields & string;
}

interface RoutableModelInput<Fields extends FieldMap> extends CommonModelInput<Fields> {
  /** Temporary hint: sync may clear stored SEO values after `seo` is disabled. */
  readonly removedSeo?: true;
  /** Enables the per-entry SEO system group, optionally naming fallback fields. */
  readonly seo?: boolean | ModelSeoInput<Fields>;
}

/** Input accepted by `definePage`. */
export interface PageModelInput<
  Fields extends FieldMap = FieldMap,
> extends RoutableModelInput<Fields> {
  readonly path: string;
}

/** Keys whose descriptor type supports the given operation. */
export type ListQueryFieldKey<Fields extends FieldMap, Types extends FieldDefinition["type"]> = {
  [Key in keyof Fields & string]: Extract<Fields[Key]["type"], Types> extends never ? never : Key;
}[keyof Fields & string];

/**
 * The admin list order used when a request names no sort: a system sort or a
 * field sort. A field default must also be listed in `sortableFields`.
 */
export type CollectionDefaultSort<Fields extends FieldMap = FieldMap> =
  | ContentEntrySystemSort
  | `field:${ListQueryFieldKey<Fields, ListQueryableFieldType>}`
  | `-field:${ListQueryFieldKey<Fields, ListQueryableFieldType>}`;

/** Independent admin query capabilities; visibility grants no capability. */
export interface CollectionListOptions<Fields extends FieldMap = FieldMap> {
  readonly sortableFields?: readonly ListQueryFieldKey<Fields, ListQueryableFieldType>[];
  readonly filterableFields?: readonly ListQueryFieldKey<Fields, ListQueryableFieldType>[];
  readonly searchableFields?: readonly ListQueryFieldKey<Fields, SearchableFieldType>[];
  readonly defaultSort?: CollectionDefaultSort<Fields>;
}

/** Input accepted by `defineCollection`. */
export interface CollectionModelInput<
  Fields extends FieldMap = FieldMap,
> extends RoutableModelInput<Fields> {
  /** Ordered scalar field keys shown as columns in admin entry lists. */
  readonly listFields?: readonly (keyof Fields & string)[];
  readonly listOptions?: CollectionListOptions<Fields>;
  readonly route: string;
}

/** Fields of the declaring global that supply site-wide SEO defaults. */
export interface SeoDefaultsInput<Fields extends FieldMap = FieldMap> {
  readonly description?: ListQueryFieldKey<Fields, SeoTextFieldType>;
  readonly image?: keyof Fields & string;
  readonly siteName: ListQueryFieldKey<Fields, SeoTextFieldType>;
  readonly titleTemplate?: ListQueryFieldKey<Fields, SeoTextFieldType>;
}

/** Input accepted by `defineGlobal`; a global has no path, route, or list fields. */
export interface GlobalModelInput<
  Fields extends FieldMap = FieldMap,
> extends CommonModelInput<Fields> {
  /** Maps fields of this global to site SEO defaults; at most one global declares it. */
  readonly seoDefaults?: SeoDefaultsInput<Fields>;
}

/** A normalized SEO option; its presence means SEO is enabled. */
export interface ModelSeoDefinition {
  readonly description?: string;
  readonly image?: string;
}

/** A normalized site SEO defaults mapping. */
export interface SeoDefaultsDefinition {
  readonly description?: string;
  readonly image?: string;
  readonly siteName: string;
  readonly titleTemplate?: string;
}

export interface NormalizedCommonModel<Fields extends FieldMap> {
  readonly blocks: readonly string[];
  readonly description?: string;
  readonly fields: Fields;
  readonly layout?: FormLayout<keyof Fields & string>;
  readonly key: string;
  readonly label?: string;
  readonly renamedFrom?: string;
  /** Runtime-only synchronization hint: block types removed from the allowlist. */
  readonly removedBlocks?: readonly string[];
  /** Runtime-only synchronization hint: removed field keys. */
  readonly removedFields?: readonly string[];
  /** Runtime-only synchronization hint: current field key to former field key. */
  readonly renamedFields?: Readonly<Record<string, string>>;
  readonly version: number;
  /** Conditional-field rules over the model's own fields; structural. */
  readonly visibility?: FieldVisibility<Fields>;
}

/** SEO options of a normalized page or collection. */
export interface NormalizedRoutableModel {
  /** Runtime-only synchronization hint: stored SEO values may be cleared. */
  readonly removedSeo?: true;
  readonly seo?: ModelSeoDefinition;
}

/** A normalized singleton page model. */
export type PageModelDefinition<Fields extends FieldMap = FieldMap> =
  NormalizedCommonModel<Fields> &
    NormalizedRoutableModel & {
      readonly kind: "page";
      readonly path: string;
    };

/** A normalized multi-entry collection model. */
export type CollectionModelDefinition<Fields extends FieldMap = FieldMap> =
  NormalizedCommonModel<Fields> &
    NormalizedRoutableModel & {
      readonly kind: "collection";
      readonly listFields?: readonly (keyof Fields & string)[];
      readonly listOptions?: CollectionListOptions;
      readonly route: string;
    };

/** A normalized route-less singleton model for site-wide content. */
export type GlobalModelDefinition<Fields extends FieldMap = FieldMap> =
  NormalizedCommonModel<Fields> & {
    readonly kind: "global";
    readonly seoDefaults?: SeoDefaultsDefinition;
  };

/** Any model that can be included in a Lace configuration. */
export type ContentModelDefinition<Fields extends FieldMap = FieldMap> =
  | CollectionModelDefinition<Fields>
  | GlobalModelDefinition<Fields>
  | PageModelDefinition<Fields>;

/**
 * Canonical structural definition of a model whose SHA-256 is `structureHash`.
 * It is synchronization metadata: display properties, `listFields`, and the
 * temporary hints (`renamedFrom`, `renamedFields`, `removedFields`,
 * `removedBlocks`) are excluded, and allowed block definitions are embedded.
 */
export type ContentModelStructure = JsonObject;

interface NormalizedModelHashes {
  /** Internal public identity, excluding only collection query options. */
  readonly publicProjectionHash: string;
  readonly projectionHash: string;
  /** Runtime-only canonical structure; omitted from the public projection. */
  readonly structure?: ContentModelStructure;
  readonly structureHash: string;
}

/** A normalized model ready for configuration synchronization. */
export type NormalizedContentModel<Fields extends FieldMap = FieldMap> =
  ContentModelDefinition<Fields> & NormalizedModelHashes;

/** Input accepted by the asynchronous portable configuration normalizer. */
export interface LaceConfigInput<Models extends readonly ContentModelDefinition[]> {
  readonly blocks?: readonly BlockDefinition[];
  readonly content: Models;
}

/** JSON-safe configuration sent to admin and public consumers. */
export interface PublicConfigProjection {
  readonly blocks: readonly BlockMetadata[];
  readonly content: readonly NormalizedContentModel[];
  readonly projectionHash: string;
  readonly structureHash: string;
}

/** Executable startup configuration, including runtime block validators. */
export interface RuntimeConfigProjection {
  readonly blocks: BlockRegistry;
  readonly content: readonly NormalizedContentModel[];
}

/** Complete portable configuration with explicit runtime and JSON projections. */
export interface NormalizedConfig<_Models extends readonly ContentModelDefinition[]> {
  readonly blocks: readonly BlockMetadata[];
  readonly content: readonly NormalizedContentModel[];
  readonly projectionHash: string;
  readonly public: PublicConfigProjection;
  readonly runtime: RuntimeConfigProjection;
  readonly structureHash: string;
}
