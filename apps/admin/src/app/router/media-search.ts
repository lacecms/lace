import {
  MAX_MEDIA_SEARCH_LENGTH,
  mediaMimeTypeSchema,
  mediaSortSchema,
  type MediaMimeTypeDto,
  type MediaSortDto,
} from "@lacecms/contracts";
import * as v from "valibot";
import { canonicalTagFilter } from "../../entities/media/index.js";
import { DEFAULT_MEDIA_SORT } from "../../shared/api/index.js";

/**
 * The media-library search, type and tag filters, sort, and view carried in the route
 * URL. Every key is present so an unsupported raw value inherited from the
 * root route's unvalidated search is overridden rather than passed through.
 */
export interface MediaSearch {
  readonly q: string | undefined;
  readonly sort: MediaSortDto | undefined;
  readonly tag: readonly string[] | undefined;
  readonly type: MediaMimeTypeDto | undefined;
  readonly view: "list" | undefined;
}

/**
 * Keeps only the library parameters the API and screen accept. Unsupported
 * values and invalid tags are dropped instead of failing the route, tags are
 * canonical (sorted, at most five), and defaults (newest first, grid view, no
 * tags) are omitted so equivalent libraries share one URL.
 */
export function parseMediaSearch(search: Record<string, unknown>): MediaSearch {
  const q = typeof search.q === "string" ? search.q.trim() : "";
  const type = v.safeParse(mediaMimeTypeSchema, search.type);
  const sort = v.safeParse(mediaSortSchema, search.sort);
  return {
    q: q.length > 0 && q.length <= MAX_MEDIA_SEARCH_LENGTH ? q : undefined,
    sort: sort.success && sort.output !== DEFAULT_MEDIA_SORT ? sort.output : undefined,
    tag: canonicalTagFilter(search.tag),
    type: type.success ? type.output : undefined,
    view: search.view === "list" ? "list" : undefined,
  };
}
