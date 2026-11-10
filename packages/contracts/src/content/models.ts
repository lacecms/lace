import {
  canonicalizeJson,
  fieldTypeCapabilities,
  normalizeFieldVisibility,
  normalizeFormLayout,
} from "@lacecms/content";
import type {
  BlockMetadata,
  ContentModelKind,
  FieldVisibility,
  FormLayout,
  JsonValue,
} from "@lacecms/content";
import * as v from "valibot";
import { isJsonObject } from "../shared/json.js";
import { identifierSchema } from "../shared/primitives.js";
import {
  collectionListOptionsSchema,
  listQueryLimitsSchema,
  NODE_LIST_QUERY_LIMITS,
} from "./collection-queries.js";
import { blockMetadataSchema, fieldMetadataMapSchema, fieldVisibilitySchema } from "./metadata.js";
import type { FieldMetadataMapDto } from "./metadata.js";

function hasValidListFields<
  Value extends {
    readonly fields: FieldMetadataMapDto;
    readonly kind: ContentModelKind;
    readonly listFields?: readonly string[] | undefined;
  },
>(value: Value): boolean {
  if (value.listFields === undefined) return true;
  return (
    value.kind === "collection" &&
    value.listFields.length > 0 &&
    new Set(value.listFields).size === value.listFields.length &&
    value.listFields.every(
      (key) =>
        Object.hasOwn(value.fields, key) &&
        fieldTypeCapabilities[value.fields[key]!.type].listQueryable,
    )
  );
}

/** A global is route-less: it carries neither a page path nor a collection route. */
function hasGlobalRouting<
  Value extends {
    readonly kind: ContentModelKind;
    readonly path?: string | undefined;
    readonly route?: string | undefined;
  },
>(value: Value): boolean {
  return value.kind !== "global" || (value.path === undefined && value.route === undefined);
}

function hasMatchingBlockDefinitions<
  Value extends {
    blockDefinitions?: BlockMetadata[] | undefined;
    blocks: string[];
  },
>(value: Value): boolean {
  if (value.blockDefinitions === undefined) return true;
  const allowed = new Set(value.blocks);
  const defined = new Set(value.blockDefinitions.map((definition) => definition.type));
  return (
    allowed.size === value.blocks.length &&
    defined.size === value.blockDefinitions.length &&
    defined.size === allowed.size &&
    [...defined].every((type) => allowed.has(type))
  );
}

export const contentModelRouteSchema = v.union([
  v.strictObject({ kind: v.literal("page"), key: identifierSchema, path: v.string() }),
  v.strictObject({ kind: v.literal("collection"), key: identifierSchema, route: v.string() }),
  v.strictObject({ kind: v.literal("global"), key: identifierSchema }),
]);

function hasValidFormLayout<
  Value extends { fields: FieldMetadataMapDto; layout?: FormLayout | undefined },
>(value: Value): boolean {
  try {
    const normalized = normalizeFormLayout(value.layout, value.fields);
    return (
      normalized === undefined ||
      canonicalizeJson(normalized as unknown as JsonValue) ===
        canonicalizeJson(value.layout as unknown as JsonValue)
    );
  } catch {
    return false;
  }
}

function hasValidFieldVisibility<
  Value extends { fields: FieldMetadataMapDto; visibility?: FieldVisibility | undefined },
>(value: Value): boolean {
  try {
    const normalized = normalizeFieldVisibility(value.visibility, value.fields);
    return (
      normalized === undefined ||
      canonicalizeJson(normalized as unknown as JsonValue) ===
        canonicalizeJson(value.visibility as unknown as JsonValue)
    );
  } catch {
    return false;
  }
}

export const modelSeoSchema = v.strictObject({
  description: v.nullable(identifierSchema),
  image: v.nullable(identifierSchema),
});
export const seoDefaultsSchema = v.strictObject({
  description: v.nullable(identifierSchema),
  image: v.nullable(identifierSchema),
  siteName: identifierSchema,
  titleTemplate: v.nullable(identifierSchema),
});

export const contentModelSchema = v.pipe(
  v.strictObject({
    blockDefinitions: v.optional(v.array(blockMetadataSchema)),
    blocks: v.array(identifierSchema),
    description: v.optional(v.string()),
    fields: fieldMetadataMapSchema,
    key: identifierSchema,
    kind: v.picklist(["collection", "global", "page"]),
    label: v.optional(v.string()),
    listFields: v.optional(v.array(identifierSchema)),
    listOptions: v.optional(collectionListOptionsSchema),
    layout: v.optional(v.custom<FormLayout>((value) => isJsonObject(value))),
    path: v.optional(v.string()),
    route: v.optional(v.string()),
    /** SEO fallback fields of a page or collection with SEO enabled. */
    seo: v.optional(modelSeoSchema),
    /** Site SEO defaults mapped by the one global that declares them. */
    seoDefaults: v.optional(seoDefaultsSchema),
    version: v.pipe(v.number(), v.integer(), v.minValue(1)),
    /** Conditional-field rules over the model's own fields. */
    visibility: v.optional(fieldVisibilitySchema),
  }),
  v.check(hasMatchingBlockDefinitions, "Block definitions must match the model's allowed blocks."),
  v.check(hasValidFormLayout, "Layout must place distinct immediate fields in valid groups."),
  v.check(
    hasValidFieldVisibility,
    "Visibility rules must name sibling targets and unconditional select or boolean controllers.",
  ),
  v.check(hasValidListFields, "List fields must name distinct fields of a collection."),
  v.check(
    (model) =>
      model.listOptions === undefined ||
      (model.kind === "collection" &&
        Object.entries(model.listOptions).every(
          ([operation, keys]) =>
            keys === undefined ||
            typeof keys === "string" ||
            keys.every(
              (key) =>
                Object.hasOwn(model.fields, key) &&
                fieldTypeCapabilities[model.fields[key]!.type][
                  operation === "searchableFields" ? "searchable" : "listQueryable"
                ],
            ),
        )),
    "List options must name supported collection fields.",
  ),
  v.check(hasGlobalRouting, "A global model carries no path or route."),
  v.check(
    (model) =>
      model.kind === "global" ? model.seo === undefined : model.seoDefaults === undefined,
    "Only pages and collections carry seo, and only a global carries seoDefaults.",
  ),
);
export const contentModelListSchema = v.strictObject({
  items: v.array(contentModelSchema),
  listQueryLimits: v.optional(listQueryLimitsSchema, () => ({ ...NODE_LIST_QUERY_LIMITS })),
});

export type ContentModelDto = v.InferOutput<typeof contentModelSchema>;
export type ContentModelListDto = v.InferOutput<typeof contentModelListSchema>;
export type ModelSeoDto = v.InferOutput<typeof modelSeoSchema>;
export type SeoDefaultsDto = v.InferOutput<typeof seoDefaultsSchema>;
