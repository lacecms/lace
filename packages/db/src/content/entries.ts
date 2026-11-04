import type { DecodedSortCursor } from "../shared/cursors.js";
import { failure } from "../shared/failures.js";
import { assertNonNegativeInteger, assertTimestamp, parseObject } from "../shared/values.js";
import type { SortSql } from "../shared/values.js";
import { decodeSortCursor } from "../shared/cursors.js";
import { COLLECTION_MATCHING_VERSION, NODE_LIST_QUERY_LIMITS } from "@lacecms/content";
import {
  actorDisplayName,
  collectionQueryIdentity,
  MAX_CONTENT_ENTRY_SEARCH_LENGTH,
} from "@lacecms/application";
import type {
  ContentEntryListValues,
  ContentEntrySort,
  ContentEntryStatus,
  ContentEntryStatusTotals,
  ContentEntrySummary,
  ListContentEntriesInput,
} from "@lacecms/application";
import { sha256CanonicalJson } from "@lacecms/content";
import type { JsonValue } from "@lacecms/content";
import {
  actorId,
  contentEntryId,
  contentModelKey,
  contentSnapshotId,
  unixMilliseconds,
} from "@lacecms/domain";
import type { ContentModelRoute } from "@lacecms/domain";

/** Maps the current runtime configuration to a persisted content-model identity. */
export type ContentModelResolver = (key: string) => ContentModelRoute | undefined;

export interface EntryRow {
  readonly draft_snapshot_id: string | null;
  readonly id: string;
  readonly model_key: string;
  readonly published_snapshot_id: string | null;
}

export interface SummaryRow {
  readonly draft_revision: number;
  readonly fields_json: string;
  readonly id: string;
  readonly model_key: string;
  readonly published_at: number | null;
  readonly published_snapshot_id: string | null;
  readonly slug: string | null;
  readonly sort_value: number | string;
  readonly status: string;
  readonly title: string;
  readonly updated_at: number;
  readonly updated_by: string;
  readonly updated_by_name: string | null;
}

export interface TotalsRow {
  readonly changed_count: number | null;
  readonly draft_count: number | null;
  readonly published_count: number | null;
  readonly total_count: number;
}

export const ENTRY_SOURCE_SQL = `content_entries e
  join content_snapshots d on d.id = e.draft_snapshot_id
  left join content_snapshots p on p.id = e.published_snapshot_id`;

export const ENTRY_STATUS_SQL = `case when e.published_snapshot_id is null then 'draft'
  when p.revision = d.revision then 'published' else 'changed' end`;

export const ENTRY_SEARCH_SQL =
  "(instr(lower(d.title), ?) > 0 or instr(coalesce(d.slug, ''), ?) > 0)";

export const ENTRY_SORT_SQL: Readonly<Record<string, SortSql>> = {
  publishedAt: { order: "coalesce(p.created_at, -1)", value: "coalesce(p.created_at, -1)" },
  title: { order: "d.title collate nocase", value: "d.title" },
  updatedAt: { order: "e.updated_at", value: "e.updated_at" },
};

export const ENTRY_COLUMNS_SQL =
  "select id, model_key, draft_snapshot_id, published_snapshot_id from content_entries";

export async function entryCursorKind(input: ListContentEntriesInput): Promise<string> {
  const limits = input.listQueryLimits ?? NODE_LIST_QUERY_LIMITS;
  return JSON.stringify([
    "entries",
    COLLECTION_MATCHING_VERSION,
    [limits.maxSearchLength, limits.maxLikePatternBytes],
    input.modelKey,
    input.sort,
    input.status ?? null,
    input.q ?? null,
    await sha256CanonicalJson(collectionQueryIdentity(input.query) as JsonValue),
    // Appended only when present so cursors issued before slug lookups stay valid.
    ...(input.slug === undefined ? [] : [input.slug]),
  ]);
}

export function decodeEntryCursor(
  value: string,
  kind: string,
  sort: ContentEntrySort,
): DecodedSortCursor {
  return decodeSortCursor(value, kind, (sortValue) =>
    sort.endsWith("title")
      ? typeof sortValue === "string" && sortValue.length <= MAX_CONTENT_ENTRY_SEARCH_LENGTH
      : typeof sortValue === "number" && Number.isSafeInteger(sortValue) && sortValue >= -1,
  );
}

export function entryStatus(value: string): ContentEntryStatus {
  if (value === "changed" || value === "draft" || value === "published") return value;
  failure("Entry status is invalid.");
}

function listValues(fieldsJson: string, listFields: readonly string[]): ContentEntryListValues {
  const values: Record<string, boolean | number | string> = {};
  if (listFields.length === 0) return Object.freeze(values);
  const fields = parseObject(fieldsJson, "Snapshot fields");
  for (const key of listFields) {
    const value = Object.hasOwn(fields, key) ? fields[key] : undefined;
    if (
      typeof value === "string" ||
      typeof value === "boolean" ||
      (typeof value === "number" && Number.isFinite(value))
    ) {
      values[key] = value;
    }
  }
  return Object.freeze(values);
}

export function entrySummary(row: SummaryRow, listFields: readonly string[]): ContentEntrySummary {
  const status = entryStatus(row.status);
  return Object.freeze({
    draftRevision: row.draft_revision,
    id: contentEntryId(row.id),
    listValues: listValues(row.fields_json, listFields),
    modelKey: contentModelKey(row.model_key),
    ...(row.published_snapshot_id === null || row.published_at === null
      ? {}
      : {
          publishedAt: unixMilliseconds(assertTimestamp(row.published_at, "Publication time")),
          publishedSnapshotId: contentSnapshotId(row.published_snapshot_id),
        }),
    ...(row.slug === null ? {} : { slug: row.slug }),
    status,
    title: row.title,
    updatedAt: unixMilliseconds(assertTimestamp(row.updated_at, "Entry timestamp")),
    updatedBy: Object.freeze({
      displayName: actorDisplayName(row.updated_by, row.updated_by_name),
      id: actorId(row.updated_by),
    }),
  });
}

export function entryTotals(row: TotalsRow): ContentEntryStatusTotals {
  return Object.freeze({
    all: assertNonNegativeInteger(row.total_count, "Entry total"),
    changed: assertNonNegativeInteger(row.changed_count ?? 0, "Changed entry total"),
    draft: assertNonNegativeInteger(row.draft_count ?? 0, "Draft entry total"),
    published: assertNonNegativeInteger(row.published_count ?? 0, "Published entry total"),
  });
}

/** Binds model key and, when searching, the folded term twice. */
export function entryTotalsSql(searching: boolean): string {
  return `select count(*) as total_count,
          sum(case when e.published_snapshot_id is null then 1 else 0 end) as draft_count,
          sum(case when p.revision = d.revision then 1 else 0 end) as published_count,
          sum(case when p.revision <> d.revision then 1 else 0 end) as changed_count
     from ${ENTRY_SOURCE_SQL}
    where e.model_key = ? ${searching ? `and ${ENTRY_SEARCH_SQL}` : ""}`;
}
