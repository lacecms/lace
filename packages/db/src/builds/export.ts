import { opaqueCursor } from "@lacecms/application";
import { SQL_CURSOR_VERSION } from "../shared/limits.js";
import { encodeBase64Url } from "../shared/base64.js";
import { parseCursorObject } from "../shared/cursors.js";
import { selectBuildExportPage } from "@lacecms/application";
import type { BuildContentExportPage } from "@lacecms/application";
import {
  BuildExportCursorError,
  BuildExportVersionChangedError,
  DomainError,
} from "@lacecms/domain";
import type { ContentModelResolver, EntryRow } from "../content/entries.js";
import { SNAPSHOT_COLUMNS_SQL, storedSnapshots, hydrateEntries } from "../content/snapshots.js";
import type { SnapshotRow } from "../content/snapshots.js";
import { BLOCK_COLUMNS_SQL } from "../content/blocks.js";
import type { BlockRow } from "../content/blocks.js";
import { MEDIA_COLUMNS_SQL } from "../media/catalog.js";
import {
  PUBLIC_INTERNAL_LINKS_JSON_SQL,
  PUBLIC_ROUTE_SQL,
  DELIVERED_REFERENCE_SQL,
  publicSnapshotMedia,
  publicContentEntry,
  publicGlobalContent,
} from "../delivery/public.js";
import type { PublicRow, PublicGlobalRow } from "../delivery/public.js";

/**
 * Stored JSON bytes of published snapshot `s`: fields, SEO, and the data and
 * settings of its visible blocks. A stable, cheap proxy for the memory and CPU
 * one entry costs a build-export page.
 */
const STORED_EXPORT_BYTES_SQL = `(length(cast(s.fields_json as blob))
    + coalesce(length(cast(s.seo_json as blob)), 0)
    + length(cast(${PUBLIC_INTERNAL_LINKS_JSON_SQL} as blob))
    + coalesce((select sum(length(cast(b.data_json as blob)) + length(cast(b.settings_json as blob)))
                  from content_blocks b
                 where b.snapshot_id = s.id and b.hidden = 0), 0))`;

const EXPORT_VERSION_SQL =
  "coalesce((select version from published_state where singleton_key = 1), 0)";

/** The published-state version of a continuation page. */
export const BUILD_EXPORT_VERSION_SQL = `select ${EXPORT_VERSION_SQL} as version`;

/** The version and the stored bytes of every published global, for a first page. */
export const BUILD_EXPORT_FIRST_PAGE_VERSION_SQL = `select ${EXPORT_VERSION_SQL} as version,
    coalesce((select sum(${STORED_EXPORT_BYTES_SQL})
                from content_models cm
                cross join content_entries e on e.model_key = cm.key
                join content_snapshots s on s.id = e.published_snapshot_id
               where cm.kind = 'global'), 0) as globals_bytes`;

/** Binds the exclusive path and a row limit; routed entries after it, with their sizes. */
export const BUILD_EXPORT_CANDIDATES_SQL = `select r.path, ${STORED_EXPORT_BYTES_SQL} as stored_bytes
   from published_routes r
   join content_entries e on e.id = r.entry_id and e.published_snapshot_id = r.snapshot_id
   join content_snapshots s on s.id = r.snapshot_id
  where r.path > ?
  order by r.path asc
  limit ?`;

/** Binds the exclusive first and inclusive last path of a page. */
const EXPORT_RANGE_SNAPSHOTS_SQL = `select pr.snapshot_id
     from published_routes pr
     join content_entries pe on pe.id = pr.entry_id and pe.published_snapshot_id = pr.snapshot_id
    where pr.path > ? and pr.path <= ?`;

/**
 * Global models drive these reads (`cross join` fixes SQLite's join order), so
 * the rows they read depend on the globals, not on the number of entries.
 */
const EXPORT_GLOBAL_SNAPSHOTS_SQL = `select ge.published_snapshot_id
     from content_models gm
     cross join content_entries ge on ge.model_key = gm.key
    where gm.kind = 'global' and ge.published_snapshot_id is not null`;

function exportSnapshotFilter(column: string, globals: boolean): string {
  return `(${column} in (${EXPORT_RANGE_SNAPSHOTS_SQL})${
    globals ? ` or ${column} in (${EXPORT_GLOBAL_SNAPSHOTS_SQL})` : ""
  })`;
}

/**
 * Range-bounded statements that read one build-export page without identifier
 * lists. Every statement except the global rows binds the page's exclusive
 * first and inclusive last path, so the statement count and bindings stay
 * constant however many entries, blocks and media the page holds.
 */
export function buildExportPageSql(globals: boolean): {
  readonly blocks: string;
  readonly globals?: string;
  readonly media: string;
  readonly routes: string;
  readonly snapshots: string;
} {
  return {
    blocks: `${BLOCK_COLUMNS_SQL}
  where hidden = 0 and ${exportSnapshotFilter("snapshot_id", globals)}
  order by snapshot_id asc, position asc`,
    ...(globals
      ? {
          globals: `select e.id, e.model_key, e.draft_snapshot_id, e.published_snapshot_id,
        s.created_at as published_created_at, ${PUBLIC_INTERNAL_LINKS_JSON_SQL} as internal_links_json
   from content_models m
   cross join content_entries e on e.model_key = m.key
   join content_snapshots s on s.id = e.published_snapshot_id
  where m.kind = 'global'
  order by e.model_key asc`,
        }
      : {}),
    media: `select distinct r.snapshot_id as public_snapshot_id, ${MEDIA_COLUMNS_SQL}
   from content_media_references r
   join media m on m.id = r.media_id
  where ${exportSnapshotFilter("r.snapshot_id", globals)}
    and m.status = 'active' and ${DELIVERED_REFERENCE_SQL}
  order by r.snapshot_id asc, m.id asc`,
    routes: `${PUBLIC_ROUTE_SQL} where r.path > ? and r.path <= ? order by r.path asc`,
    snapshots: `${SNAPSHOT_COLUMNS_SQL} where ${exportSnapshotFilter("s.id", globals)}`,
  };
}

export const BUILD_EXPORT_CURSOR_KIND = "build-export";

export interface DecodedBuildExportCursor {
  /** The last delivered path; the empty string selects every routed path. */
  readonly path: string;
  /** The published-state version the page sequence is bound to. */
  readonly version: number;
}

/** Binds a build-export page sequence to its published version and last path. */
export function encodeBuildExportCursor(
  version: number,
  lastPath: string,
): ReturnType<typeof opaqueCursor> {
  return opaqueCursor(
    encodeBase64Url(
      JSON.stringify({
        id: lastPath,
        kind: BUILD_EXPORT_CURSOR_KIND,
        value: version,
        version: SQL_CURSOR_VERSION,
      }),
    ),
  );
}

export function decodeBuildExportCursor(value: string): DecodedBuildExportCursor {
  let candidate: Record<string, unknown>;
  try {
    candidate = parseCursorObject(value);
  } catch (error) {
    if (error instanceof DomainError) throw new BuildExportCursorError(error.message);
    throw error;
  }
  if (
    candidate.version !== SQL_CURSOR_VERSION ||
    candidate.kind !== BUILD_EXPORT_CURSOR_KIND ||
    typeof candidate.id !== "string" ||
    (candidate.id !== "" && !candidate.id.startsWith("/")) ||
    typeof candidate.value !== "number" ||
    !Number.isSafeInteger(candidate.value) ||
    candidate.value < 0
  ) {
    throw new BuildExportCursorError("Cursor is unsupported or belongs to a different list.");
  }
  return { path: candidate.id, version: candidate.value };
}

/** Candidate row of `BUILD_EXPORT_CANDIDATES_SQL`. */
export interface BuildExportCandidateRow {
  readonly path: string;
  readonly stored_bytes: number;
}

/** The page's path range chosen from candidate rows read with `limit + 1` rows. */
export interface BuildExportPageRange {
  /** Exclusive lower path bound. */
  readonly after: string;
  /** Inclusive upper path bound; equals `after` when the page holds no entry. */
  readonly last: string;
  readonly more: boolean;
}

export function buildExportPageRange(
  after: string,
  candidates: readonly BuildExportCandidateRow[],
  limit: number,
  globalsBytes: number,
): BuildExportPageRange {
  const { count, more } = selectBuildExportPage(
    candidates.map((row) => ({ bytes: Number(row.stored_bytes) })),
    limit,
    globalsBytes,
  );
  return { after, last: count === 0 ? after : candidates[count - 1]!.path, more };
}

/** Fails a page whose read observed a published state other than the expected one. */
export function assertBuildExportVersion(expected: number, actual: number): void {
  if (expected !== actual) throw new BuildExportVersionChangedError(expected, actual);
}

/** Rows read for one build-export page by `buildExportPageSql`. */
export interface BuildExportPageRows {
  readonly blocks: readonly BlockRow[];
  readonly globals?: readonly PublicGlobalRow[];
  readonly media: readonly Record<string, unknown>[];
  readonly routes: readonly PublicRow[];
  readonly snapshots: readonly SnapshotRow[];
}

/**
 * Assembles a page from range-bounded rows. Only published snapshots are read,
 * so each row hydrates with its published snapshot standing in for the draft,
 * which the public projection replaces anyway.
 */
export function buildExportPage(
  rows: BuildExportPageRows,
  range: BuildExportPageRange,
  version: number,
  resolveModel: ContentModelResolver,
): BuildContentExportPage {
  const published = (row: EntryRow): EntryRow => ({
    ...row,
    draft_snapshot_id: row.published_snapshot_id,
  });
  const entryRows = [...rows.routes, ...(rows.globals ?? [])].map(published);
  const entries = hydrateEntries(
    entryRows,
    storedSnapshots(rows.snapshots, rows.blocks),
    resolveModel,
  );
  const media = publicSnapshotMedia(rows.media);
  return Object.freeze({
    entries: Object.freeze(rows.routes.map((row) => publicContentEntry(row, entries, media))),
    ...(rows.globals === undefined
      ? {}
      : {
          globals: Object.freeze(
            rows.globals.map((row) => publicGlobalContent(row, entries, media)),
          ),
        }),
    ...(range.more ? { nextCursor: encodeBuildExportCursor(version, range.last) } : {}),
    version,
  });
}
