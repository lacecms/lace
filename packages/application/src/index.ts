// Directory dependencies: shared ← ports ← content, media, accounts, builds, outbox, configuration.
export const packageName = "@lacecms/application";

/** Build-export page failures the HTTP boundary maps to stable responses. */
export { BuildExportCursorError, BuildExportVersionChangedError } from "@lacecms/domain";
/** Portable helpers that import clients apply exactly as the server does. */
export { isMediaFocalCoordinate, normalizeMediaTags, normalizeMediaText } from "@lacecms/domain";
export { canonicalizeJson, encodeEntryLink } from "@lacecms/content";

// Shared
export * from "./shared/brands.js";
export * from "./shared/pagination.js";
export * from "./shared/limits.js";
export * from "./shared/actors.js";
export * from "./shared/text.js";
export * from "./shared/permissions.js";

// Ports
export * from "./ports/infrastructure.js";
export * from "./ports/outbox.js";
export * from "./ports/links.js";
export * from "./ports/content.js";
export * from "./ports/media.js";
export * from "./ports/builds.js";
export * from "./ports/security.js";

// Content
export * from "./content/authority.js";
export * from "./content/collection-queries.js";
export * from "./content/internal-links.js";
export { routeLessModelKeys } from "./content/route-less-links.js";
export * from "./content/published-projection.js";
export * from "./content/use-case-inputs.js";
export {
  duplicateTitle,
  contentModelRoute,
  normalizeDraftCandidate,
  type NormalizeDraftCandidateInput,
  type NormalizedDraftCandidate,
} from "./content/draft-normalization.js";
export * from "./content/use-cases.js";

// Media
export * from "./media/use-cases.js";
export * from "./media/types.js";
export * from "./media/limits.js";
export { detectMediaMimeType, sanitizeMediaFilename, collectMediaBytes } from "./media/upload.js";
export { normalizeMediaMetadataPatch } from "./media/metadata.js";
export { CompleteImageContainerInspector } from "./media/image-container.js";

// Accounts
export * from "./accounts/use-cases.js";
export * from "./accounts/email.js";
export * from "./accounts/oauth.js";
export * from "./accounts/import-tokens.js";

// Builds
export * from "./builds/export-pages.js";
export * from "./builds/use-cases.js";
export * from "./builds/tracker.js";

// Outbox
export * from "./outbox/retry-policy.js";
export * from "./outbox/dispatchers.js";

// Configuration
export * from "./configuration/limits.js";
export * from "./configuration/types.js";
export * from "./configuration/fields.js";
export * from "./configuration/structure-diff.js";
export * from "./configuration/structure-hints.js";
export * from "./configuration/evidence.js";
export * from "./configuration/migration.js";
export * from "./configuration/links.js";
export { contentSyncActor } from "./configuration/model-state.js";
export * from "./configuration/plan.js";
export * from "./configuration/report.js";
export * from "./configuration/apply.js";
