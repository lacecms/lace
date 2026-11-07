import { MAX_DRAFT_MEDIA_REFERENCES, MAX_PAGE_SIZE, MAX_TOP_LEVEL_BLOCKS } from "@lacecms/content";
export const SQL_CURSOR_VERSION = 1;
export const SQL_SORT_CURSOR_VERSION = 2;
export const SQL_MAX_PAGE_SIZE = MAX_PAGE_SIZE;
export const SQL_MAX_MEDIA_FILENAME_LENGTH = 255;
/** Architecture caps that keep one complete draft within one D1 batch. */
export const SQL_MAX_DRAFT_BLOCKS = MAX_TOP_LEVEL_BLOCKS;
export const SQL_MAX_DRAFT_MEDIA_REFERENCES = MAX_DRAFT_MEDIA_REFERENCES;
export const PUBLICATION_IDEMPOTENCY_TTL_MS = 86_400_000;
