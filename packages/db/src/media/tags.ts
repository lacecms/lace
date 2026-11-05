import { failure } from "../shared/failures.js";
import { assertPageSize } from "../shared/values.js";
import { decodeSortCursor } from "../shared/cursors.js";
import { MAX_MEDIA_TAG_FILTERS, normalizeMediaTags, normalizeMediaTag } from "@lacecms/domain";
import type { ListMediaInput } from "@lacecms/application";
import { isMediaSha256 } from "@lacecms/domain";

/** Canonical filter tags are also used to bind list cursors. */
export function normalizedMediaFilterTags(tags: readonly string[] = []): readonly string[] {
  if (tags.length > MAX_MEDIA_TAG_FILTERS) failure("Supply at most five filter tags.");
  const result = normalizeMediaTags(tags);
  if ("issue" in result) failure(`Invalid media filter tag at ${result.issue}.`);
  return result.tags;
}

export function mediaTagFilters(tags: readonly string[] = []): {
  conditions: string[];
  bindings: string[];
} {
  const normalized = normalizedMediaFilterTags(tags);
  return {
    conditions: normalized.map(
      () => "exists (select 1 from media_tags t where t.tag = ? and t.media_id = m.id)",
    ),
    bindings: [...normalized],
  };
}

/** Tag and content-hash predicates shared by both media list implementations. */
export function mediaListFilters(input: Pick<ListMediaInput, "sha256" | "tags">): {
  conditions: string[];
  bindings: string[];
} {
  const filters = mediaTagFilters(input.tags);
  if (input.sha256 === undefined) return filters;
  if (!isMediaSha256(input.sha256)) failure("Media hash filter is invalid.");
  return {
    conditions: [...filters.conditions, "m.sha256 = ? and m.status = 'active'"],
    bindings: [...filters.bindings, input.sha256],
  };
}

export function mediaTagCatalogQuery(input: { limit: number; q?: string; after?: string }): {
  sql: string;
  params: (string | number)[];
  kind: string;
} {
  const limit = assertPageSize(input.limit);
  const prefix = input.q === undefined ? undefined : normalizeMediaTag(input.q);
  if (input.q !== undefined && prefix === undefined) failure("Tag prefix is invalid.");
  const kind = JSON.stringify(["media-tags", prefix ?? null]);
  const conditions: string[] = [];
  const params: (string | number)[] = [];
  if (prefix !== undefined) {
    conditions.push("tag >= ? and tag < ?");
    params.push(
      prefix,
      prefix.slice(0, -1) + String.fromCharCode(prefix.charCodeAt(prefix.length - 1) + 1),
    );
  }
  if (input.after !== undefined) {
    const cursor = decodeSortCursor(
      input.after,
      kind,
      (value) => typeof value === "string" && normalizeMediaTag(value) === value,
    );
    conditions.push("tag > ?");
    params.push(cursor.value);
  }
  params.push(limit + 1);
  return {
    kind,
    params,
    sql: `select tag, count(*) as count from media_tags ${conditions.length ? `where ${conditions.join(" and ")}` : ""} group by tag order by tag limit ?`,
  };
}

export function normalizedMediaWriteTags(tags: readonly string[]): readonly string[] {
  const result = normalizeMediaTags(tags);
  if ("issue" in result) failure(`Invalid media tag at ${result.issue}.`);
  return result.tags;
}

/** One bounded insert, optionally conditional on the batch mutation guard. */
export function mediaTagInsert(
  id: string,
  tags: readonly string[],
  guard = "1",
  token?: string,
): { sql: string; params: (string | number)[] } | undefined {
  if (tags.length === 0) return undefined;
  return {
    sql: `insert into media_tags (media_id, tag) select ?, column1 from (values ${tags.map(() => "(?)").join(",")}) where ${guard}`,
    params: [id, ...tags, ...(token === undefined ? [] : [token])],
  };
}
