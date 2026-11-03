import { MAX_BUILD_EXPORT_PAGE_SIZE } from "@lacecms/content";
import { DomainError } from "@lacecms/domain";
import { BUILD_EXPORT_PAGE_BYTE_BUDGET } from "../shared/limits.js";
import type { BuildExportCandidate } from "../ports/content.js";

/**
 * Chooses how many of the ordered candidates (read with `limit + 1` rows) one
 * page holds: at most `limit`, ending before an entry would raise the page's
 * stored bytes above the budget, but always at least one entry. `initialBytes`
 * counts the first page's globals.
 */
export function selectBuildExportPage(
  candidates: readonly BuildExportCandidate[],
  limit: number,
  initialBytes = 0,
): { readonly count: number; readonly more: boolean } {
  let total = initialBytes;
  let count = 0;
  for (const candidate of candidates.slice(0, limit)) {
    if (count > 0 && total + candidate.bytes > BUILD_EXPORT_PAGE_BYTE_BUDGET) break;
    total += candidate.bytes;
    count += 1;
  }
  return { count, more: candidates.length > count };
}

/** Rejects a build-export page size outside 1–100. */
export function assertBuildExportPageSize(limit: number): number {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_BUILD_EXPORT_PAGE_SIZE) {
    throw new DomainError(
      "CONTENT_INVALID_STATE",
      `Build-export page size must be between 1 and ${MAX_BUILD_EXPORT_PAGE_SIZE}.`,
    );
  }
  return limit;
}
