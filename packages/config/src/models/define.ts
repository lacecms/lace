import { deepFreeze } from "@lacecms/content";
import type { FieldVisibility } from "@lacecms/content";
import type {
  FieldMap,
  ModelVisibility,
  PageModelInput,
  CollectionModelInput,
  GlobalModelInput,
  PageModelDefinition,
  CollectionModelDefinition,
  GlobalModelDefinition,
} from "./types.js";
import { fail } from "../shared/errors.js";
import { normalizePagePath, normalizeCollectionRoute } from "./routes.js";
import { normalizeCommonModel } from "./common.js";
import { normalizeRoutableSeo, normalizeSeoDefaults } from "./seo.js";
import { normalizeListFields, normalizeListOptions } from "./list-options.js";

/** Defines a detached singleton page model with inferred field values. */
export function definePage<
  const Fields extends FieldMap = FieldMap,
  const Visibility extends FieldVisibility<Fields> | undefined = undefined,
>(
  input: PageModelInput<Fields> & { readonly visibility?: Visibility },
): PageModelDefinition<Fields> & ModelVisibility<Visibility> {
  const common = normalizeCommonModel(input);
  if (Object.hasOwn(input, "listOptions"))
    fail(`page "${input.key}" must not declare listOptions.`);
  const definition: PageModelDefinition<Fields> = {
    ...common,
    kind: "page",
    path: normalizePagePath(input.path),
    ...normalizeRoutableSeo(input, common.fields),
  };
  return deepFreeze(definition) as PageModelDefinition<Fields> & ModelVisibility<Visibility>;
}

/** Defines a detached route-less singleton model, such as site settings. */
export function defineGlobal<
  const Fields extends FieldMap = FieldMap,
  const Visibility extends FieldVisibility<Fields> | undefined = undefined,
>(
  input: GlobalModelInput<Fields> & { readonly visibility?: Visibility },
): GlobalModelDefinition<Fields> & ModelVisibility<Visibility> {
  const common = normalizeCommonModel(input);
  for (const option of ["path", "route", "listFields", "listOptions", "seo", "removedSeo"]) {
    if (Object.hasOwn(input, option)) {
      fail(`global "${input.key}" must not declare ${option}.`);
    }
  }
  const seoDefaults = normalizeSeoDefaults(
    input,
    common.fields,
    common.visibility as FieldVisibility | undefined,
  );
  const definition: GlobalModelDefinition<Fields> = {
    ...common,
    kind: "global",
    ...(seoDefaults === undefined ? {} : { seoDefaults }),
  };
  return deepFreeze(definition) as GlobalModelDefinition<Fields> & ModelVisibility<Visibility>;
}

/** Defines a detached collection model with inferred field values. */
export function defineCollection<
  const Fields extends FieldMap = FieldMap,
  const Visibility extends FieldVisibility<Fields> | undefined = undefined,
>(
  input: CollectionModelInput<Fields> & { readonly visibility?: Visibility },
): CollectionModelDefinition<Fields> & ModelVisibility<Visibility> {
  const common = normalizeCommonModel(input);
  const listFields = normalizeListFields(input.listFields, common.fields);
  const listOptions = normalizeListOptions(input.listOptions, common.fields);
  const definition: CollectionModelDefinition<Fields> = {
    ...common,
    kind: "collection",
    ...(listOptions === undefined ? {} : { listOptions }),
    ...(listFields.length === 0
      ? {}
      : { listFields: listFields as readonly (keyof Fields & string)[] }),
    ...(input.route === undefined
      ? routeLessOptions(input)
      : {
          route: normalizeCollectionRoute(input.route),
          ...normalizeRoutableSeo(input, common.fields),
        }),
  };
  return deepFreeze(definition) as CollectionModelDefinition<Fields> & ModelVisibility<Visibility>;
}

/** A route-less collection has no slug-based route and therefore no SEO group. */
function routeLessOptions(input: { readonly key: string; readonly seo?: unknown }): {
  readonly removedSeo?: true;
} {
  if (input.seo !== undefined) {
    fail(`collection "${input.key}" must not declare seo without a route.`);
  }
  return normalizeRoutableSeo(input, {});
}
