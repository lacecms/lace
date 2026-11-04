// Directory dependencies: shared ← access, media, builds ← content.
export { LaceError } from "@lacecms/content";
export type { ContentModelKind } from "@lacecms/content";
export { isContentSlug } from "@lacecms/content";

export const packageName = "@lacecms/domain";

// shared (`shared/failures.ts` is internal and never re-exported)
export * from "./shared/brands.js";
export * from "./shared/errors.js";

// access
export * from "./access/actors.js";
export * from "./access/permissions.js";
export * from "./access/errors.js";

// media
export * from "./media/metadata.js";

// builds
export * from "./builds/diagnostics.js";
export * from "./builds/status.js";
export * from "./builds/state.js";
export * from "./builds/export-errors.js";

// content
export * from "./content/routes.js";
export {
  BLOCK_POSITION_STEP,
  BlockOrderError,
  assertOrderedBlockPositions,
  planBlockPosition,
  normalizeBlockPositions,
} from "./content/blocks.js";
export type { ContentBlock, ContentBlockInput, BlockPositionPlan } from "./content/blocks.js";
export * from "./content/collection-queries.js";
export * from "./content/seo.js";
export * from "./content/entries.js";
