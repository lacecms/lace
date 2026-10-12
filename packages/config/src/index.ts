import {
  defineBlockRegistry,
  parseSchemaPath,
  encodeSchemaPath,
  schemaFieldAt,
  MAX_SLUG_LENGTH,
  sha256CanonicalJson,
  toBlockMetadata,
  toBlockRegistryMetadata,
  toFieldMetadata,
} from "@lacecms/content";
import type {
  BlockDefinition,
  BlockMetadata,
  BlockRegistry,
  FieldDefinition,
  FieldIsRequired,
  FieldValue,
  JsonObject,
  JsonValue,
} from "@lacecms/content";

export const packageName = "@lacecms/config";

const STABLE_KEY_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
const FIELD_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9]*$/u;
const BLOCK_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9-]*$/u;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

/** Field types whose values are plain JSON scalars suitable for list columns. */
export const LIST_FIELD_TYPES: ReadonlySet<FieldDefinition["type"]> = new Set([
  "boolean",
  "date",
  "datetime",
  "number",
  "select",
  "text",
  "textarea",
  "url",
]);

/** Field types that may supply SEO text: site names, title templates and descriptions. */
export const SEO_TEXT_FIELD_TYPES: ReadonlySet<FieldDefinition["type"]> = new Set([
  "text",
  "textarea",
]);

/** Thrown when `lace.config.ts` contains an invalid or ambiguous definition. */
export class ConfigurationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

/** Field descriptors indexed by their stable configuration field key. */
export type FieldMap = Readonly<Record<string, FieldDefinition>>;

/** The values inferred from a model's field descriptors. */
export type ModelFieldValues<Fields extends FieldMap> = Readonly<
  {
    [Key in keyof Fields as FieldIsRequired<Fields[Key]> extends true ? Key : never]: FieldValue<
      Fields[Key]
    >;
  } & {
    readonly [
      Key in keyof Fields as FieldIsRequired<Fields[Key]> extends true ? never : Key
    ]?: FieldValue<Fields[Key]>;
  }
>;

interface CommonModelInput<Fields extends FieldMap> {
  readonly blocks?: readonly string[];
  readonly description?: string;
  readonly fields?: Fields;
  readonly key: string;
  readonly label?: string;
  readonly renamedFrom?: string;
  /** Temporary hint: block types whose stored blocks sync may drop. */
  readonly removedBlocks?: readonly string[];
  /** Temporary hint: former field keys whose stored values sync may prune. */
  readonly removedFields?: readonly string[];
  readonly version: number;
}

/** Fallback fields of the same model for SEO values the editor leaves unset. */
export interface ModelSeoInput<Fields extends FieldMap = FieldMap> {
  /** A `text` or `textarea` field used when the SEO description is unset. */
  readonly description?: keyof Fields & string;
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

/** Input accepted by `defineCollection`. */
export interface CollectionModelInput<
  Fields extends FieldMap = FieldMap,
> extends RoutableModelInput<Fields> {
  /** Ordered scalar field keys shown as columns in admin entry lists. */
  readonly listFields?: readonly (keyof Fields & string)[];
  readonly route: string;
}

/** Fields of the declaring global that supply site-wide SEO defaults. */
export interface SeoDefaultsInput<Fields extends FieldMap = FieldMap> {
  readonly description?: keyof Fields & string;
  readonly image?: keyof Fields & string;
  readonly siteName: keyof Fields & string;
  readonly titleTemplate?: keyof Fields & string;
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

interface NormalizedCommonModel<Fields extends FieldMap> {
  readonly blocks: readonly string[];
  readonly description?: string;
  readonly fields: Fields;
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
}

/** SEO options of a normalized page or collection. */
interface NormalizedRoutableModel {
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
  /**
   * Structural hash produced by the pre-baseline algorithm that removed every
   * `label` and `description` key at any depth. Present on runtime models only
   * when it differs from `structureHash`; never part of the public projection.
   */
  readonly legacyStructureHash?: string;
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

type MutableJsonObject = { [key: string]: MutableJsonValue };
type MutableJsonValue = boolean | null | number | string | MutableJsonObject | MutableJsonValue[];

function fail(message: string): never {
  throw new ConfigurationError(message);
}

function isPlainObject(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || prototype === Object.prototype;
}

function deepFreeze<Value>(value: Value): Value {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nestedValue of Object.values(value)) {
      deepFreeze(nestedValue);
    }
    Object.freeze(value);
  }
  return value;
}

function assertString(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string") {
    fail(`${name} must be a string.`);
  }
}

function assertOptionalDisplayValue(value: unknown, name: string): void {
  if (value !== undefined && typeof value !== "string") {
    fail(`${name} must be a string when provided.`);
  }
}

function assertStableKey(value: unknown, name: string): asserts value is string {
  assertString(value, name);
  if (!STABLE_KEY_PATTERN.test(value)) {
    fail(`${name} must be a lowercase kebab-case key.`);
  }
}

function assertVersion(value: unknown): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    fail("version must be a positive integer.");
  }
}

interface NormalizedFields<Fields extends FieldMap> {
  readonly fields: Fields;
  /** Current field key to former key, from field-level `renamedFrom` hints. */
  readonly renamedFields: Readonly<Record<string, string>>;
}

/** Normalizes field descriptors and moves their `renamedFrom` hints out of the definitions. */
function normalizeFields<Fields extends FieldMap>(
  value: Fields | undefined,
): NormalizedFields<Fields> {
  if (value === undefined) {
    return { fields: deepFreeze({}) as Fields, renamedFields: {} };
  }
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !isPlainObject(value)
  ) {
    fail("fields must be a plain object.");
  }

  const normalized: Record<string, FieldDefinition> = {};
  const renamedFields: Record<string, string> = {};
  const extract = (definition: FieldDefinition, path: readonly string[]): FieldDefinition => {
    const { renamedFrom, ...metadata } = definition as FieldDefinition & {
      readonly renamedFrom?: string;
    };
    if (renamedFrom !== undefined) {
      const address = encodeSchemaPath(path);
      renamedFields[address] = encodeSchemaPath([...path.slice(0, -1), renamedFrom]);
    }
    if (metadata.type === "group")
      return {
        ...metadata,
        fields: Object.fromEntries(
          Object.entries(metadata.fields).map(([key, child]) => [
            key,
            extract(child, [...path, key]),
          ]),
        ),
      };
    if (metadata.type === "list")
      return { ...metadata, item: extract(metadata.item, [...path, "*"]) as typeof metadata.item };
    return metadata;
  };
  for (const [key, definition] of Object.entries(value)) {
    if (!FIELD_KEY_PATTERN.test(key)) fail(`fields.${key} must be a valid field key.`);
    normalized[key] = extract(toFieldMetadata(definition as FieldDefinition), [key]);
  }
  return { fields: deepFreeze(normalized) as Fields, renamedFields };
}

function normalizeKeyList(
  value: readonly string[] | undefined,
  name: string,
  pattern: RegExp,
): readonly string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) fail(`${name} must be an array of keys.`);
  const seen = new Set<string>();
  for (const key of value) {
    if (typeof key !== "string" || !pattern.test(key)) {
      fail(`${name} must contain valid keys.`);
    }
    if (seen.has(key)) fail(`${name} contains duplicate key "${key}".`);
    seen.add(key);
  }
  return [...seen].sort();
}

function normalizeRemovedFields(value: readonly string[] | undefined): readonly string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) fail("removedFields must be an array of keys.");
  const paths = value
    .map((path) => {
      try {
        const parts = parseSchemaPath(path);
        if (parts.at(-1) === "*") fail("removedFields must name a field, not a list item.");
        return encodeSchemaPath(parts);
      } catch {
        fail("removedFields must contain valid keys or schema paths.");
      }
    })
    .sort();
  for (let index = 0; index < paths.length; index++) {
    const path = paths[index]!;
    if (paths.indexOf(path) !== index) fail(`removedFields contains duplicate key "${path}".`);
    const prefix = `/${parseSchemaPath(path).join("/")}/`;
    if (paths.some((other) => `/${parseSchemaPath(other).join("/")}`.startsWith(prefix)))
      fail(`removedFields contains overlapping path "${path}".`);
  }
  return paths;
}

/** Rejects synchronization hints that contradict the model's own configuration. */
function assertSynchronizationHints(
  modelKey: string,
  fields: FieldMap,
  blocks: readonly string[],
  renamedFields: Readonly<Record<string, string>>,
  removedFields: readonly string[],
  removedBlocks: readonly string[],
): void {
  const sources = new Map<string, string>();
  for (const [key, former] of Object.entries(renamedFields)) {
    if (former === key) {
      fail(`model "${modelKey}" field "${key}" is renamed from its own key.`);
    }
    if (schemaFieldAt(fields, parseSchemaPath(former)) !== undefined) {
      fail(`model "${modelKey}" field "${key}" is renamed from configured field "${former}".`);
    }
    const other = sources.get(former);
    if (other !== undefined) {
      fail(`model "${modelKey}" fields "${other}" and "${key}" share renamedFrom "${former}".`);
    }
    sources.set(former, key);
  }
  for (const key of removedFields) {
    if (schemaFieldAt(fields, parseSchemaPath(key)) !== undefined) {
      fail(`model "${modelKey}" removedFields lists configured field "${key}".`);
    }
    if (sources.has(key)) {
      fail(`model "${modelKey}" removedFields lists rename source "${key}".`);
    }
  }
  for (const type of removedBlocks) {
    if (blocks.includes(type)) {
      fail(`model "${modelKey}" removedBlocks lists allowed block type "${type}".`);
    }
  }
}

function normalizeBlocks(value: readonly string[] | undefined): readonly string[] {
  if (value === undefined) {
    return deepFreeze([]);
  }
  if (!Array.isArray(value)) {
    fail("blocks must be an array of block keys.");
  }

  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const blockKey of value) {
    if (typeof blockKey !== "string" || !BLOCK_KEY_PATTERN.test(blockKey)) {
      fail("blocks must contain valid block keys.");
    }
    if (seen.has(blockKey)) {
      fail(`blocks contains duplicate block key "${blockKey}".`);
    }
    seen.add(blockKey);
    normalized.push(blockKey);
  }
  return deepFreeze(normalized);
}

function assertCanonicalRouteValue(value: unknown, name: string): asserts value is string {
  assertString(value, name);
  if (
    value.length === 0 ||
    !value.startsWith("/") ||
    value.includes("?") ||
    value.includes("#") ||
    value.includes("\\") ||
    /\s/u.test(value) ||
    value.includes("//") ||
    (value.length > 1 && value.endsWith("/"))
  ) {
    fail(`${name} must be a canonical absolute path.`);
  }

  for (const segment of value.slice(1).split("/")) {
    if (segment === "." || segment === "..") {
      fail(`${name} must not contain dot segments.`);
    }
  }
}

/** Validates and returns a canonical fixed page path. */
export function normalizePagePath(path: string): string {
  assertCanonicalRouteValue(path, "path");
  if (path.includes(":")) {
    fail("path must not contain parameter segments.");
  }
  return path;
}

/** Validates and returns a canonical collection route with one `:slug` segment. */
export function normalizeCollectionRoute(route: string): string {
  assertCanonicalRouteValue(route, "route");
  const segments = route === "/" ? [] : route.slice(1).split("/");
  const slugSegments = segments.filter((segment) => segment === ":slug");
  if (
    slugSegments.length !== 1 ||
    segments.some((segment) => segment.includes(":") && segment !== ":slug")
  ) {
    fail("route must contain exactly one :slug segment and no other parameters.");
  }
  return route;
}

/** Resolves a validated collection route to one canonical public path. */
export function resolveCollectionRoute(route: string, slug: string): string {
  const normalizedRoute = normalizeCollectionRoute(route);
  if (
    typeof slug !== "string" ||
    slug.length === 0 ||
    slug.length > MAX_SLUG_LENGTH ||
    !SLUG_PATTERN.test(slug)
  ) {
    fail("slug must use lowercase ASCII letters, digits, and single hyphens.");
  }
  const resolved = normalizedRoute.replace(":slug", slug);
  return normalizePagePath(resolved);
}

function normalizeCommonModel<Fields extends FieldMap>(
  input: CommonModelInput<Fields>,
): Omit<NormalizedCommonModel<Fields>, "values"> {
  if (
    input === null ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    !isPlainObject(input)
  ) {
    fail("model must be a plain object.");
  }
  assertStableKey(input.key, "key");
  assertVersion(input.version);
  if (input.renamedFrom !== undefined) {
    assertStableKey(input.renamedFrom, "renamedFrom");
    if (input.renamedFrom === input.key) {
      fail("renamedFrom must differ from key.");
    }
  }
  assertOptionalDisplayValue(input.label, "label");
  assertOptionalDisplayValue(input.description, "description");

  const blocks = normalizeBlocks(input.blocks);
  const { fields, renamedFields } = normalizeFields(input.fields);
  const removedFields = normalizeRemovedFields(input.removedFields);
  const removedBlocks = normalizeKeyList(input.removedBlocks, "removedBlocks", BLOCK_KEY_PATTERN);
  assertSynchronizationHints(
    input.key,
    fields,
    blocks,
    renamedFields,
    removedFields,
    removedBlocks,
  );

  const normalized: NormalizedCommonModel<Fields> = {
    blocks,
    ...(input.description === undefined ? {} : { description: input.description }),
    fields,
    key: input.key,
    ...(input.label === undefined ? {} : { label: input.label }),
    ...(input.renamedFrom === undefined ? {} : { renamedFrom: input.renamedFrom }),
    ...(removedBlocks.length === 0 ? {} : { removedBlocks }),
    ...(removedFields.length === 0 ? {} : { removedFields }),
    ...(Object.keys(renamedFields).length === 0 ? {} : { renamedFields }),
    version: input.version,
  };
  return deepFreeze(normalized);
}

function seoFieldReference(
  modelKey: string,
  option: string,
  key: unknown,
  fields: FieldMap,
  media: boolean,
): string {
  if (typeof key !== "string") {
    fail(`model "${modelKey}" ${option} must name a field.`);
  }
  const definition = Object.hasOwn(fields, key) ? fields[key] : undefined;
  if (definition === undefined) {
    fail(`model "${modelKey}" ${option} references undeclared field "${key}".`);
  }
  const allowed = media ? definition.type === "media" : SEO_TEXT_FIELD_TYPES.has(definition.type);
  if (!allowed) {
    fail(
      `model "${modelKey}" ${option} field "${key}" must be ${media ? "a media field" : "a text or textarea field"}, not ${definition.type}.`,
    );
  }
  return key;
}

function assertOnlyKeys(value: object, allowed: readonly string[], label: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) fail(`${label} must not declare "${key}".`);
  }
}

/** Normalizes the routable-model SEO option and its temporary removal hint. */
function normalizeRoutableSeo(
  input: { readonly key: string; readonly removedSeo?: unknown; readonly seo?: unknown },
  fields: FieldMap,
): NormalizedRoutableModel {
  if (Object.hasOwn(input, "seoDefaults")) {
    fail(`model "${input.key}" must not declare seoDefaults; only a global can.`);
  }
  let seo: ModelSeoDefinition | undefined;
  const option: unknown = input.seo;
  if (option === true) {
    seo = {};
  } else if (option !== undefined && option !== false) {
    if (
      option === null ||
      typeof option !== "object" ||
      Array.isArray(option) ||
      !isPlainObject(option)
    ) {
      fail(`model "${input.key}" seo must be a boolean or an object.`);
    }
    const mapping = option as Record<string, unknown>;
    assertOnlyKeys(mapping, ["description", "image"], `model "${input.key}" seo`);
    seo = {
      ...(mapping.description === undefined
        ? {}
        : {
            description: seoFieldReference(
              input.key,
              "seo.description",
              mapping.description,
              fields,
              false,
            ),
          }),
      ...(mapping.image === undefined
        ? {}
        : { image: seoFieldReference(input.key, "seo.image", mapping.image, fields, true) }),
    };
  }
  const hint: unknown = input.removedSeo;
  if (hint !== undefined && hint !== true) {
    fail(`model "${input.key}" removedSeo must be true when declared.`);
  }
  if (hint === true && seo !== undefined) {
    fail(`model "${input.key}" must not declare removedSeo while seo is enabled.`);
  }
  return {
    ...(hint === true ? { removedSeo: true as const } : {}),
    ...(seo === undefined ? {} : { seo }),
  };
}

function normalizeSeoDefaults(
  input: { readonly key: string; readonly seoDefaults?: unknown },
  fields: FieldMap,
): SeoDefaultsDefinition | undefined {
  const option: unknown = input.seoDefaults;
  if (option === undefined) return undefined;
  if (
    option === null ||
    typeof option !== "object" ||
    Array.isArray(option) ||
    !isPlainObject(option)
  ) {
    fail(`global "${input.key}" seoDefaults must be an object.`);
  }
  const mapping = option as Record<string, unknown>;
  assertOnlyKeys(
    mapping,
    ["description", "image", "siteName", "titleTemplate"],
    `global "${input.key}" seoDefaults`,
  );
  if (mapping.siteName === undefined) {
    fail(`global "${input.key}" seoDefaults must name a siteName field.`);
  }
  const text = (name: string): string =>
    seoFieldReference(input.key, `seoDefaults.${name}`, mapping[name], fields, false);
  return {
    ...(mapping.description === undefined ? {} : { description: text("description") }),
    ...(mapping.image === undefined
      ? {}
      : { image: seoFieldReference(input.key, "seoDefaults.image", mapping.image, fields, true) }),
    siteName: text("siteName"),
    ...(mapping.titleTemplate === undefined ? {} : { titleTemplate: text("titleTemplate") }),
  };
}

/** Defines a detached singleton page model with inferred field values. */
export function definePage<const Fields extends FieldMap = FieldMap>(
  input: PageModelInput<Fields>,
): PageModelDefinition<Fields> {
  const common = normalizeCommonModel(input);
  const definition: PageModelDefinition<Fields> = {
    ...common,
    kind: "page",
    path: normalizePagePath(input.path),
    ...normalizeRoutableSeo(input, common.fields),
  };
  return deepFreeze(definition);
}

/** Defines a detached route-less singleton model, such as site settings. */
export function defineGlobal<const Fields extends FieldMap = FieldMap>(
  input: GlobalModelInput<Fields>,
): GlobalModelDefinition<Fields> {
  const common = normalizeCommonModel(input);
  for (const option of ["path", "route", "listFields", "seo", "removedSeo"]) {
    if (Object.hasOwn(input, option)) {
      fail(`global "${input.key}" must not declare ${option}.`);
    }
  }
  const seoDefaults = normalizeSeoDefaults(input, common.fields);
  const definition: GlobalModelDefinition<Fields> = {
    ...common,
    kind: "global",
    ...(seoDefaults === undefined ? {} : { seoDefaults }),
  };
  return deepFreeze(definition);
}

function normalizeListFields(value: unknown, fields: FieldMap): readonly string[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    fail("listFields must be an array of field keys.");
  }

  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const key of value) {
    if (typeof key !== "string") {
      fail("listFields must contain field keys.");
    }
    if (seen.has(key)) {
      fail(`listFields contains duplicate field "${key}".`);
    }
    const definition = Object.hasOwn(fields, key) ? fields[key] : undefined;
    if (definition === undefined) {
      fail(`listFields references undeclared field "${key}".`);
    }
    if (!LIST_FIELD_TYPES.has(definition.type)) {
      fail(`listFields field "${key}" must be a scalar field, not ${definition.type}.`);
    }
    seen.add(key);
    normalized.push(key);
  }
  return normalized;
}

/** Defines a detached collection model with inferred field values. */
export function defineCollection<const Fields extends FieldMap = FieldMap>(
  input: CollectionModelInput<Fields>,
): CollectionModelDefinition<Fields> {
  const common = normalizeCommonModel(input);
  const listFields = normalizeListFields(input.listFields, common.fields);
  const definition: CollectionModelDefinition<Fields> = {
    ...common,
    kind: "collection",
    ...(listFields.length === 0
      ? {}
      : { listFields: listFields as readonly (keyof Fields & string)[] }),
    route: normalizeCollectionRoute(input.route),
    ...normalizeRoutableSeo(input, common.fields),
  };
  return deepFreeze(definition);
}

function pageMatchesCollection(pagePath: string, collectionRoute: string): boolean {
  const pageSegments = pagePath === "/" ? [] : pagePath.slice(1).split("/");
  const routeSegments = collectionRoute === "/" ? [] : collectionRoute.slice(1).split("/");
  return (
    pageSegments.length === routeSegments.length &&
    pageSegments.every(
      (segment, index) => routeSegments[index] === ":slug" || routeSegments[index] === segment,
    )
  );
}

function assertUniqueModels(models: readonly ContentModelDefinition[]): void {
  const currentKeys = new Map<string, ContentModelDefinition>();
  const formerKeys = new Map<string, ContentModelDefinition>();
  const pagePaths = new Map<string, PageModelDefinition>();
  const collectionRoutes = new Map<string, CollectionModelDefinition>();
  let seoDefaultsGlobal: GlobalModelDefinition | undefined;

  for (const model of models) {
    const duplicateCurrent = currentKeys.get(model.key);
    if (duplicateCurrent !== undefined) {
      fail(`models "${duplicateCurrent.key}" and "${model.key}" share key "${model.key}".`);
    }
    if (formerKeys.has(model.key)) {
      fail(`model key "${model.key}" duplicates a renamedFrom key.`);
    }
    currentKeys.set(model.key, model);

    if (model.renamedFrom !== undefined) {
      if (currentKeys.has(model.renamedFrom)) {
        fail(`renamedFrom "${model.renamedFrom}" duplicates a model key.`);
      }
      const duplicateFormer = formerKeys.get(model.renamedFrom);
      if (duplicateFormer !== undefined) {
        fail(
          `models "${duplicateFormer.key}" and "${model.key}" share renamedFrom "${model.renamedFrom}".`,
        );
      }
      formerKeys.set(model.renamedFrom, model);
    }

    switch (model.kind) {
      case "page": {
        const duplicatePath = pagePaths.get(model.path);
        if (duplicatePath !== undefined) {
          fail(`pages "${duplicatePath.key}" and "${model.key}" share path "${model.path}".`);
        }
        pagePaths.set(model.path, model);
        break;
      }
      case "collection": {
        const duplicateRoute = collectionRoutes.get(model.route);
        if (duplicateRoute !== undefined) {
          fail(
            `collections "${duplicateRoute.key}" and "${model.key}" share route "${model.route}".`,
          );
        }
        collectionRoutes.set(model.route, model);
        break;
      }
      case "global":
        if (model.seoDefaults !== undefined) {
          if (seoDefaultsGlobal !== undefined) {
            fail(
              `globals "${seoDefaultsGlobal.key}" and "${model.key}" both declare seoDefaults; at most one global may.`,
            );
          }
          seoDefaultsGlobal = model;
        }
        break;
      default:
        model satisfies never;
    }
  }

  for (const page of pagePaths.values()) {
    for (const collection of collectionRoutes.values()) {
      if (pageMatchesCollection(page.path, collection.route)) {
        fail(
          `page "${page.key}" path "${page.path}" collides with collection "${collection.key}".`,
        );
      }
    }
  }
}

function assertRegisteredModelBlocks(
  models: readonly ContentModelDefinition[],
  registry: BlockRegistry,
): void {
  for (const model of models) {
    for (const type of model.blocks) {
      if (registry.get(type) === undefined) {
        fail(`model "${model.key}" references unregistered block type "${type}".`);
      }
    }
  }
}

function asJsonValue(value: unknown): JsonValue {
  return value as JsonValue;
}

function omitDisplayMetadata(value: JsonValue): MutableJsonValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(omitDisplayMetadata);
  }
  const projection: MutableJsonObject = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    if (key !== "description" && key !== "label") {
      projection[key] = omitDisplayMetadata(nestedValue);
    }
  }
  return projection;
}

/**
 * Removes model-level presentation metadata that must not affect structural
 * identity: `listFields`, the SEO fallback mapping (only whether SEO is enabled
 * is structural) and `seoDefaults`.
 */
function omitListFields(model: JsonValue): JsonValue {
  if (model === null || typeof model !== "object" || Array.isArray(model)) {
    return model;
  }
  const {
    listFields: _listFields,
    seo,
    seoDefaults: _seoDefaults,
    ...structure
  } = model as JsonObject;
  return seo === undefined ? structure : { ...structure, seo: true };
}

/** The pre-baseline structural value, kept only to recognise legacy stored hashes. */
function legacyStructureForHash(projection: JsonValue): MutableJsonValue {
  return omitDisplayMetadata(omitListFields(projection));
}

function withoutDisplayProperties(value: JsonValue): MutableJsonObject {
  const { description: _description, label: _label, ...rest } = value as JsonObject;
  return JSON.parse(JSON.stringify(rest)) as MutableJsonObject;
}

function fieldDefinitionStructure(definition: JsonValue): MutableJsonObject {
  const result = withoutDisplayProperties(definition);
  if (result.type === "group") result.fields = fieldMapStructure(result.fields);
  if (result.type === "list") {
    delete result.itemLabel;
    if (result.item !== undefined) result.item = fieldDefinitionStructure(result.item);
  }
  return result;
}

function fieldMapStructure(fields: JsonValue | undefined): MutableJsonObject {
  const structure: MutableJsonObject = {};
  for (const [key, definition] of Object.entries((fields ?? {}) as JsonObject)) {
    structure[key] = fieldDefinitionStructure(definition);
  }
  return structure;
}

/**
 * Builds the canonical structure of a model. Display metadata is removed only
 * from the model, field, block, and block-field definitions, so field keys and
 * default values named `label` or `description` remain structural.
 */
export function contentModelStructure(
  model: ContentModelDefinition,
  registry: BlockRegistry,
): ContentModelStructure {
  const projection = modelForHash(model, registry) as JsonObject;
  const structure = withoutDisplayProperties(omitListFields(projection));
  structure.fields = fieldMapStructure(projection.fields);
  structure.blockDefinitions = (projection.blockDefinitions as readonly JsonObject[]).map(
    (definition) => ({
      ...withoutDisplayProperties(definition),
      fields: fieldMapStructure(definition.fields),
    }),
  );
  return deepFreeze(structure) as ContentModelStructure;
}

function modelForHash(model: ContentModelDefinition, registry: BlockRegistry): JsonValue {
  const {
    legacyStructureHash: _legacyStructureHash,
    projectionHash: _projectionHash,
    removedBlocks: _removedBlocks,
    removedFields: _removedFields,
    removedSeo: _removedSeo,
    renamedFields: _renamedFields,
    renamedFrom: _renamedFrom,
    structure: _structure,
    structureHash: _structureHash,
    ...identityModel
  } = model as NormalizedContentModel & NormalizedRoutableModel;
  return asJsonValue({
    ...identityModel,
    blockDefinitions: model.blocks.map((type) => toBlockMetadata(registry.get(type)!)),
  });
}

function normalizedModelForHash(model: NormalizedContentModel): JsonValue {
  const {
    legacyStructureHash: _legacyStructureHash,
    projectionHash: _projectionHash,
    removedBlocks: _removedBlocks,
    removedFields: _removedFields,
    removedSeo: _removedSeo,
    renamedFields: _renamedFields,
    renamedFrom: _renamedFrom,
    structure: _structure,
    structureHash: _structureHash,
    ...serializableModel
  } = model as NormalizedContentModel & NormalizedRoutableModel;
  return asJsonValue(serializableModel);
}

function publicModel(model: NormalizedContentModel): NormalizedContentModel {
  const {
    legacyStructureHash: _legacyStructureHash,
    removedBlocks: _removedBlocks,
    removedFields: _removedFields,
    removedSeo: _removedSeo,
    renamedFields: _renamedFields,
    renamedFrom: _renamedFrom,
    structure: _structure,
    ...projection
  } = model as NormalizedContentModel & NormalizedRoutableModel;
  return deepFreeze(projection) as NormalizedContentModel;
}

/**
 * Normalizes models and produces hashes with the same asynchronous Web Crypto
 * implementation in Node and Cloudflare Workers. Callers can use top-level
 * `await` when exporting `lace.config.ts`.
 */
export async function defineConfig<const Models extends readonly ContentModelDefinition[]>(
  input: LaceConfigInput<Models>,
): Promise<NormalizedConfig<Models>> {
  if (
    input === null ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    !isPlainObject(input)
  ) {
    fail("config must be a plain object.");
  }
  if (!Array.isArray(input.content)) {
    fail("config.content must be an array of models.");
  }

  const registry = defineBlockRegistry(input.blocks ?? []);
  const models = [...input.content];
  assertUniqueModels(models);
  assertRegisteredModelBlocks(models, registry);
  models.sort((left, right) => left.key.localeCompare(right.key));

  const normalizedModels = await Promise.all(
    models.map(async (model) => {
      const projection = modelForHash(model, registry);
      const structure = contentModelStructure(model, registry);
      const structureHash = await sha256CanonicalJson(structure);
      const legacyStructureHash = await sha256CanonicalJson(legacyStructureForHash(projection));
      const normalized: NormalizedContentModel = {
        ...model,
        ...(legacyStructureHash === structureHash ? {} : { legacyStructureHash }),
        projectionHash: await sha256CanonicalJson(projection),
        structure,
        structureHash,
      };
      return deepFreeze(normalized);
    }),
  );

  const blocks = toBlockRegistryMetadata(registry);
  const publicModels = normalizedModels.map(publicModel);
  const hashModels = publicModels.map(normalizedModelForHash);
  const projection = { blocks, content: hashModels } as unknown as JsonValue;
  const structure = {
    blocks,
    content: hashModels.map(omitListFields),
  } as unknown as JsonValue;
  // Preserve scalar-only global hashes; composite identity visits descriptor positions
  // so content/default keys named label or description remain structural.
  const publicProjection: PublicConfigProjection = {
    blocks,
    content: deepFreeze(publicModels),
    projectionHash: await sha256CanonicalJson(projection),
    structureHash: await sha256CanonicalJson(
      [...blocks, ...publicModels].some((definition) =>
        Object.values(definition.fields).some(
          (field) => field.type === "group" || field.type === "list",
        ),
      )
        ? {
            blocks: blocks.map((block) => ({
              ...withoutDisplayProperties(block as unknown as JsonValue),
              fields: fieldMapStructure(block.fields as unknown as JsonValue),
              ...(block.settings === undefined
                ? {}
                : { settings: fieldMapStructure(block.settings as unknown as JsonValue) }),
            })),
            content: hashModels.map((model) => ({
              ...withoutDisplayProperties(omitListFields(model)),
              fields: fieldMapStructure((model as JsonObject).fields),
            })),
          }
        : omitDisplayMetadata(structure),
    ),
  };
  const normalized: NormalizedConfig<Models> = {
    ...publicProjection,
    public: deepFreeze({ ...publicProjection }),
    runtime: deepFreeze({ blocks: registry, content: deepFreeze(normalizedModels) }),
  };
  return deepFreeze(normalized);
}
