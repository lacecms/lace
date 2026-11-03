import * as v from "valibot";
import { errorCodeSchema, errorEnvelopeSchema } from "../errors/envelope.js";
import type { TolerantErrorEnvelope } from "../errors/envelope.js";
import { publicBlockSchema } from "../content/blocks.js";
import { seoValueSchema } from "../content/seo.js";
import {
  buildExportFormatVersionSchema,
  exportEntrySchema,
  exportGlobalSchema,
  buildExportSchema,
  buildExportContinuationPageSchema,
  buildExportFirstPageSchema,
  exportSeoSchema,
} from "./build-export.js";
import {
  publicEntrySchema,
  publicGlobalSchema,
  publicContentEntrySchema,
  publicContentListSchema,
  publicGlobalContentSchema,
  publicMediaSchema,
  publicMediaDictionarySchema,
} from "./public.js";

type AnySchema = v.GenericSchema;

/**
 * Rebuilds a strict read schema so that every contract-defined object strips
 * unknown keys instead of rejecting them. Required keys, value types, defaults,
 * pipes and consumer-owned JSON (custom leaves) are unchanged; `substitutions`
 * replace specific leaves, such as the closed error-code picklist.
 */
function toTolerantSchema(
  schema: AnySchema,
  substitutions: ReadonlyMap<AnySchema, AnySchema>,
): AnySchema {
  const replacement = substitutions.get(schema);
  if (replacement !== undefined) return replacement;
  const node = schema as AnySchema & {
    readonly default?: unknown;
    readonly entries?: Readonly<Record<string, AnySchema>>;
    readonly item?: AnySchema;
    readonly key?: AnySchema;
    readonly options?: readonly AnySchema[];
    readonly pipe?: readonly [AnySchema, ...v.PipeItem<unknown, unknown, v.BaseIssue<unknown>>[]];
    readonly value?: AnySchema;
    readonly wrapped?: AnySchema;
  };
  const tolerant = (child: AnySchema) => toTolerantSchema(child, substitutions);
  if (node.pipe !== undefined) {
    const [root, ...actions] = node.pipe;
    return (v.pipe as unknown as (...items: unknown[]) => AnySchema)(tolerant(root), ...actions);
  }
  switch (node.type) {
    case "loose_object":
    case "object":
    case "strict_object":
      return v.object(
        Object.fromEntries(
          Object.entries(node.entries!).map(([key, child]) => [key, tolerant(child)]),
        ),
      );
    case "array":
      return v.array(tolerant(node.item!));
    case "record":
      return v.record(
        node.key as v.GenericSchema<string, string | number | symbol>,
        tolerant(node.value!),
      );
    case "optional":
      return v.optional(tolerant(node.wrapped!), node.default as never);
    case "nullable":
      return v.nullable(tolerant(node.wrapped!), node.default as never);
    case "nullish":
      return v.nullish(tolerant(node.wrapped!), node.default as never);
    case "union":
      return v.union(node.options!.map(tolerant));
    default:
      return schema;
  }
}

/**
 * A newer server may report an error code or export format this release does
 * not know. A delivered block carrying `hidden` is rejected rather than
 * stripped: removing the flag would render content the CMS marked as hidden.
 */
const tolerantSubstitutions = new Map<AnySchema, AnySchema>([
  [errorCodeSchema, v.pipe(v.string(), v.minLength(1), v.maxLength(128))],
  [buildExportFormatVersionSchema, v.pipe(v.number(), v.safeInteger(), v.minValue(1))],
]);
tolerantSubstitutions.set(
  publicBlockSchema,
  v.pipe(
    v.unknown(),
    v.check(
      (value) => !(typeof value === "object" && value !== null && Object.hasOwn(value, "hidden")),
      "A hidden block is never delivered.",
    ),
    toTolerantSchema(publicBlockSchema, tolerantSubstitutions),
  ),
);

function tolerant<Schema extends AnySchema>(schema: Schema): Schema {
  // The derived schema has the strict schema's output type; only unknown keys differ.
  return toTolerantSchema(schema, tolerantSubstitutions) as Schema;
}

/**
 * Consumer variants of the public read schemas. They ignore and remove object
 * keys a newer API may add, while enforcing every key, type and constraint of
 * the strict variants the API validates its output with.
 */
function tolerantBuild<Schema extends AnySchema>(schema: Schema): Schema {
  const substitutions = new Map(tolerantSubstitutions);
  substitutions.set(exportEntrySchema, tolerant(publicEntrySchema));
  substitutions.set(exportGlobalSchema, tolerant(publicGlobalSchema));
  return v.pipe(
    v.unknown(),
    v.check((value) => {
      if (value === null || typeof value !== "object") return false;
      const input = value as Record<string, unknown>;
      if (input.formatVersion === 1) return true;
      return [input.entries, input.globals ?? []].every(
        (items) =>
          Array.isArray(items) &&
          items.every(
            (item: unknown) =>
              item !== null && typeof item === "object" && Object.hasOwn(item, "internalLinks"),
          ),
      );
    }, "Format 2 requires local internal-link manifests."),
    toTolerantSchema(schema, substitutions),
  ) as unknown as Schema;
}
export const tolerantPublicSchemas = Object.freeze({
  buildExport: tolerantBuild(buildExportSchema),
  buildExportContinuationPage: tolerantBuild(buildExportContinuationPageSchema),
  buildExportFirstPage: tolerantBuild(buildExportFirstPageSchema),
  errorEnvelope: tolerant(errorEnvelopeSchema) as unknown as v.GenericSchema<
    unknown,
    TolerantErrorEnvelope
  >,
  exportSeo: tolerant(exportSeoSchema),
  publicBlock: tolerant(publicBlockSchema),
  publicContentEntry: tolerant(publicContentEntrySchema),
  publicContentList: tolerant(publicContentListSchema),
  publicEntry: tolerant(publicEntrySchema),
  publicGlobal: tolerant(publicGlobalSchema),
  publicGlobalContent: tolerant(publicGlobalContentSchema),
  publicMedia: tolerant(publicMediaSchema),
  publicMediaDictionary: tolerant(publicMediaDictionarySchema),
  seoValue: tolerant(seoValueSchema),
});
