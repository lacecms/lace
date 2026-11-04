// Direction: shared ← models ← structure ← configuration.
export const packageName = "@lacecms/config";

export { ConfigurationError } from "./shared/errors.js";

export {
  normalizePagePath,
  normalizeCollectionRoute,
  resolveCollectionRoute,
} from "./models/routes.js";

export { definePage, defineGlobal, defineCollection } from "./models/define.js";

export type {
  CollectionListOptions,
  CollectionModelDefinition,
  CollectionModelInput,
  ContentModelDefinition,
  ContentModelStructure,
  FieldMap,
  GlobalModelDefinition,
  GlobalModelInput,
  LaceConfigInput,
  ListQueryFieldKey,
  ModelFieldValues,
  ModelSeoDefinition,
  ModelSeoInput,
  ModelVisibility,
  NormalizedCommonModel,
  NormalizedConfig,
  NormalizedContentModel,
  NormalizedRoutableModel,
  PageModelDefinition,
  PageModelInput,
  PublicConfigProjection,
  RuntimeConfigProjection,
  SeoDefaultsDefinition,
  SeoDefaultsInput,
} from "./models/types.js";
export { contentModelStructure } from "./structure/canonical.js";
export { defineConfig } from "./configuration/define-config.js";
