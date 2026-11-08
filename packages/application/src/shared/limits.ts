/** Entries one build-export page holds at most. */
export { MAX_BUILD_EXPORT_PAGE_SIZE } from "@lacecms/content";
/**
 * Stored JSON bytes (fields, SEO and visible block data and settings; globals
 * on the first page) after which a build-export page ends. It bounds the
 * memory and CPU of hydrating, validating and serializing one page.
 */
export const BUILD_EXPORT_PAGE_BYTE_BUDGET = 4_000_000;

export const MIN_IMPORT_TOKEN_LIFETIME_DAYS = 1;
export const MAX_IMPORT_TOKEN_LIFETIME_DAYS = 7;
/** `last_used_at` is written at most once per this interval per token. */
export const IMPORT_TOKEN_USE_RECORD_INTERVAL_MS = 60_000;

/** Fixed dispatcher timing keeps recovery semantics identical across runtimes. */
export const DISPATCHER_LEASE_DURATION_MS = 60_000;
export const SITE_BUILD_DEBOUNCE_MS = 5_000;
/** Leases one dispatcher event claim returns at most, whatever valid limit it asks for. */
export const MAX_DISPATCHER_CLAIMS_PER_CALL = 20;
/**
 * Leases one site-build claim returns at most. Each claim needs four guarded
 * D1 batch statements, so ten fill the 40-statement mutation budget.
 */
export const MAX_SITE_BUILD_CLAIMS_PER_CALL = 10;

export { MAX_ENTRY_SEARCH_LENGTH as MAX_CONTENT_ENTRY_SEARCH_LENGTH } from "@lacecms/content";

export { MAX_MEDIA_SEARCH_LENGTH } from "@lacecms/content";

/** Upper bound on the referencing entries returned by one media usage read. */
export { MAX_MEDIA_USAGE_ENTRIES } from "@lacecms/content";
