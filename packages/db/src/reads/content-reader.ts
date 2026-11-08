import {
  actorDisplayName,
  ALLOWED_MEDIA_MIME_TYPES,
  assertBuildExportPageSize,
  foldAscii,
  MAX_MEDIA_USAGE_ENTRIES,
} from "@lacecms/application";
import type {
  ActorSummary,
  BuildContentExportPage,
  ContentLinkReadPort,
  CursorPage,
  ExportBuildContentPageInput,
  LinkImpactQuery,
  LinkTargetQuery,
  ListMediaInput,
  ListMediaTagsInput,
  ListPublicContentInput,
  LoadContentEntryInput,
  LoadMediaUsageInput,
  MediaCatalogItem,
  MediaTagCount,
  MediaUsageEntry,
  PublicContentEntry,
  PublicGlobalContent,
  SiteBuildRecord,
} from "@lacecms/application";
import { MAX_PAGE_SIZE } from "@lacecms/content";
import type {
  ActorId,
  ContentEntry,
  ContentModelKey,
  DraftSnapshot,
  MediaMetadata,
  PublishedSnapshot,
  SiteBuildId,
} from "@lacecms/domain";
import {
  assertBuildExportVersion,
  BUILD_EXPORT_CANDIDATES_SQL,
  BUILD_EXPORT_FIRST_PAGE_VERSION_SQL,
  BUILD_EXPORT_VERSION_SQL,
  buildExportPage,
  buildExportPageRange,
  buildExportPageSql,
  decodeBuildExportCursor,
} from "../builds/export.js";
import type { BuildExportCandidateRow, BuildExportPageRange } from "../builds/export.js";
import { siteBuildRecord } from "../builds/site-builds.js";
import type { SiteBuildRow } from "../builds/site-builds.js";
import { BLOCK_COLUMNS_SQL } from "../content/blocks.js";
import type { BlockRow } from "../content/blocks.js";
import { ENTRY_COLUMNS_SQL } from "../content/entries.js";
import type { ContentModelResolver, EntryRow } from "../content/entries.js";
import {
  hydrateEntries,
  SNAPSHOT_COLUMNS_SQL,
  snapshotIdsOf,
  storedSnapshots,
} from "../content/snapshots.js";
import type { SnapshotRow, StoredSnapshot } from "../content/snapshots.js";
import {
  PUBLIC_GLOBAL_SQL,
  PUBLIC_MEDIA_SQL,
  PUBLIC_ROUTE_SQL,
  publicContentEntry,
  publicGlobalContent,
  publicSnapshotMedia,
  publicSnapshotMediaSql,
} from "../delivery/public.js";
import type { PublicGlobalRow, PublicRow } from "../delivery/public.js";
import { SqlContentLinkReader } from "../links/reader.js";
import type { LinkReadSql } from "../links/reader.js";
import {
  decodeMediaCursor,
  MEDIA_BY_ID_SQL,
  MEDIA_CATALOG_SQL,
  MEDIA_SORT_SQL,
  mediaCatalogItem,
  mediaCursorKind,
  mediaMetadata,
} from "../media/catalog.js";
import { mediaListFilters, mediaTagCatalogQuery } from "../media/tags.js";
import { MEDIA_USAGE_SQL, mediaUsageEntries } from "../media/usage.js";
import type { MediaUsageRow } from "../media/usage.js";
import { decodeCursor, encodeCursor, encodeSortCursor } from "../shared/cursors.js";
import { failure } from "../shared/failures.js";
import { assertPageSize, chunks } from "../shared/values.js";

/** One read statement with its positional parameters. */
export interface SqlReadStatement {
  readonly sql: string;
  readonly params: readonly unknown[];
}

/** Rows of each statement of one read group, in statement order. */
export type SqlReadGroupRows = readonly (readonly unknown[])[];

/** Native read capability a runtime supplies to `SqlContentReader`. */
export interface ContentReadSql extends LinkReadSql {
  /** Largest identifier group bound into one `in (...)` list. */
  readonly bindChunk: number;
  /**
   * Runs `first`, then the statements `next` derives from its rows, as one
   * consistent read: one SQLite read transaction on Node, two atomic batches
   * on D1. An error thrown by `next` ends the read before the second group.
   */
  readGroups(
    first: readonly SqlReadStatement[],
    next: (rows: SqlReadGroupRows) => readonly SqlReadStatement[],
  ): Promise<readonly [SqlReadGroupRows, SqlReadGroupRows]>;
}

/**
 * Bounded content, media, delivery and build reads shared by the Node and D1
 * repositories; adapters supply only their native execution capability.
 */
export class SqlContentReader implements ContentLinkReadPort {
  private readonly links: SqlContentLinkReader;

  public constructor(
    private readonly sql: ContentReadSql,
    private readonly resolveModel: ContentModelResolver,
  ) {
    this.links = new SqlContentLinkReader(sql);
  }

  public resolveLinkTargets(ids: readonly string[]) {
    return this.links.resolveLinkTargets(ids);
  }
  public listLinkTargets(input: LinkTargetQuery) {
    return this.links.listLinkTargets(input);
  }
  public readLinkImpact(input: LinkImpactQuery & { readonly actorId: string }) {
    return this.links.readLinkImpact(input);
  }

  public async load(input: LoadContentEntryInput): Promise<ContentEntry | null> {
    return this.loadEntry(input.entryId);
  }

  public async loadDraft(input: LoadContentEntryInput): Promise<DraftSnapshot | null> {
    return (await this.loadEntry(input.entryId))?.draft ?? null;
  }

  public async loadPublished(input: LoadContentEntryInput): Promise<PublishedSnapshot | null> {
    return (await this.loadEntry(input.entryId))?.published ?? null;
  }

  public async describeActors(ids: readonly ActorId[]): Promise<readonly ActorSummary[]> {
    const names = new Map<string, string>();
    for (const group of chunks([...new Set(ids)], this.sql.bindChunk)) {
      const rows = await this.sql.all<{ readonly id: string; readonly name: string }>(
        `select id, name from user where id in (${group.map(() => "?").join(", ")})`,
        ...group,
      );
      for (const row of rows) names.set(row.id, row.name);
    }
    return Object.freeze(
      ids.map((id) => Object.freeze({ displayName: actorDisplayName(id, names.get(id)), id })),
    );
  }

  public async listPublic(input: ListPublicContentInput): Promise<CursorPage<PublicContentEntry>> {
    const limit = assertPageSize(input.limit);
    const cursorKind = `public:${input.modelKey}`;
    const after = input.after === undefined ? undefined : decodeCursor(input.after, cursorKind);
    const rows = await this.sql.all<PublicRow>(
      `${PUBLIC_ROUTE_SQL}
        where e.model_key = ?
          ${after === undefined ? "" : "and (s.created_at < ? or (s.created_at = ? and e.id < ?))"}
        order by s.created_at desc, e.id desc limit ?`,
      ...(after === undefined
        ? [input.modelKey, limit + 1]
        : [input.modelKey, after.timestamp, after.timestamp, after.id, limit + 1]),
    );
    const pageRows = rows.slice(0, limit);
    const entries = await this.hydrate(pageRows);
    const media = await this.publicMedia(pageRows);
    const items = pageRows.map((row) => publicContentEntry(row, entries, media));
    const last = pageRows.at(-1);
    return Object.freeze({
      items: Object.freeze(items),
      ...(rows.length > limit && last !== undefined
        ? { nextCursor: encodeCursor(cursorKind, last.published_created_at, last.id) }
        : {}),
    });
  }

  public async publishedContentVersion(): Promise<number> {
    const row = await this.first<{ readonly version: number }>(
      "select version from published_state where singleton_key = 1",
    );
    return row?.version ?? 0;
  }

  public async loadPublic(path: string): Promise<PublicContentEntry | null> {
    const row = await this.first<PublicRow>(`${PUBLIC_ROUTE_SQL} where r.path = ? limit 1`, path);
    if (row === undefined) return null;
    const entries = await this.hydrate([row]);
    return entries.has(row.id)
      ? publicContentEntry(row, entries, await this.publicMedia([row]))
      : null;
  }

  public async loadPublicGlobal(modelKey: ContentModelKey): Promise<PublicGlobalContent | null> {
    const row = await this.first<PublicGlobalRow>(
      `${PUBLIC_GLOBAL_SQL} where e.model_key = ? limit 1`,
      modelKey,
    );
    if (row === undefined) return null;
    const entries = await this.hydrate([row]);
    return entries.has(row.id)
      ? publicGlobalContent(row, entries, await this.publicMedia([row]))
      : null;
  }

  public async loadPublicMedia(id: string): Promise<MediaMetadata | null> {
    const row = await this.first<Record<string, unknown>>(PUBLIC_MEDIA_SQL, id);
    return row === undefined ? null : mediaMetadata(row);
  }

  public async loadMediaMany(ids: readonly string[]): Promise<readonly MediaMetadata[]> {
    const result: MediaMetadata[] = [];
    for (const group of chunks([...new Set(ids)], this.sql.bindChunk)) {
      const sql = `select * from media where id in (${group.map(() => "?").join(", ")})`;
      const rows = await this.sql.all<Record<string, unknown>>(sql, ...group);
      result.push(...rows.map(mediaMetadata));
    }
    return result;
  }

  public async loadMedia(id: string): Promise<MediaMetadata | null> {
    const row = await this.first<Record<string, unknown>>(MEDIA_BY_ID_SQL, id);
    return row === undefined ? null : mediaMetadata(row);
  }

  public async loadDeletingMedia(id: string): Promise<MediaMetadata | null> {
    const media = await this.loadMedia(id);
    return media?.status === "deleting" ? media : null;
  }

  public async listMedia(input: ListMediaInput): Promise<CursorPage<MediaCatalogItem>> {
    const limit = assertPageSize(input.limit);
    const descending = input.sort.startsWith("-");
    const sort = MEDIA_SORT_SQL[descending ? input.sort.slice(1) : input.sort];
    if (sort === undefined) failure("Media sort is unsupported.");
    if (input.type !== undefined && !ALLOWED_MEDIA_MIME_TYPES.includes(input.type)) {
      failure("Media type filter is unsupported.");
    }
    const kind = mediaCursorKind(input);
    const after =
      input.after === undefined ? undefined : decodeMediaCursor(input.after, kind, input.sort);
    const comparison = descending ? "<" : ">";
    const direction = descending ? "desc" : "asc";
    const tagFilter = mediaListFilters(input);
    const conditions: string[] = [...tagFilter.conditions];
    const bindings: (number | string)[] = [...tagFilter.bindings];
    if (input.q !== undefined) {
      conditions.push("instr(lower(m.filename), ?) > 0");
      bindings.push(foldAscii(input.q));
    }
    if (input.type !== undefined) {
      conditions.push("m.mime_type = ?");
      bindings.push(input.type);
    }
    if (after !== undefined) {
      conditions.push(
        `(${sort.order} ${comparison} ? or (${sort.order} = ? and m.id ${comparison} ?))`,
      );
      bindings.push(after.value, after.value, after.id);
    }
    const rows = await this.sql.all<Record<string, unknown>>(
      `${MEDIA_CATALOG_SQL}, ${sort.value} as sort_value
         from media m
         left join user u on u.id = m.created_by
        ${conditions.length === 0 ? "" : `where ${conditions.join(" and ")}`}
        order by ${sort.order} ${direction}, m.id ${direction} limit ?`,
      ...bindings,
      limit + 1,
    );
    const pageRows = rows.slice(0, limit);
    const last = pageRows.at(-1);
    return Object.freeze({
      items: Object.freeze(pageRows.map((row) => mediaCatalogItem(row))),
      ...(rows.length > limit && last !== undefined
        ? {
            nextCursor: encodeSortCursor(kind, last.sort_value as number | string, String(last.id)),
          }
        : {}),
    });
  }

  public async listMediaTags(input: ListMediaTagsInput): Promise<CursorPage<MediaTagCount>> {
    const query = mediaTagCatalogQuery(input);
    const rows = await this.sql.all<{ tag: string; count: number }>(query.sql, ...query.params);
    const items = rows
      .slice(0, input.limit)
      .map((row) => ({ tag: row.tag, count: Number(row.count) }));
    const last = items.at(-1);
    return {
      items,
      ...(rows.length > input.limit && last !== undefined
        ? { nextCursor: encodeSortCursor(query.kind, last.tag, last.tag) }
        : {}),
    };
  }

  public async loadMediaCatalogItem(id: string): Promise<MediaCatalogItem | null> {
    const row = await this.first<Record<string, unknown>>(
      `${MEDIA_CATALOG_SQL}
         from media m
         left join user u on u.id = m.created_by
        where m.id = ? limit 1`,
      id,
    );
    return row === undefined ? null : mediaCatalogItem(row);
  }

  public async loadMediaUsage(input: LoadMediaUsageInput): Promise<readonly MediaUsageEntry[]> {
    if (
      !Number.isSafeInteger(input.limit) ||
      input.limit < 1 ||
      input.limit > MAX_MEDIA_USAGE_ENTRIES
    ) {
      failure(`Media usage limit must be between 1 and ${MAX_MEDIA_USAGE_ENTRIES}.`);
    }
    return mediaUsageEntries(
      await this.sql.all<MediaUsageRow>(MEDIA_USAGE_SQL, input.mediaId, input.limit, input.mediaId),
    );
  }

  /**
   * Reads one page as two dependent read groups with at most eight statements:
   * the version and candidate sizes, then the version again with the page's
   * range-bounded rows. The runtime runs both groups as one consistent read,
   * and each version increment is atomic with every published-state change,
   * so equal versions prove one published state.
   */
  public async exportBuildContentPage(
    input: ExportBuildContentPageInput,
  ): Promise<BuildContentExportPage> {
    const limit = assertBuildExportPageSize(input.limit);
    const after = input.after === undefined ? undefined : decodeBuildExportCursor(input.after);
    const first = after === undefined;
    const from = after?.path ?? "";
    const sql = buildExportPageSql(first);
    let expected = 0;
    let range: BuildExportPageRange | undefined;
    const [, [versionRows, routes, snapshots, blocks, media, globals]] = await this.sql.readGroups(
      [
        { sql: first ? BUILD_EXPORT_FIRST_PAGE_VERSION_SQL : BUILD_EXPORT_VERSION_SQL, params: [] },
        { sql: BUILD_EXPORT_CANDIDATES_SQL, params: [from, limit + 1] },
      ],
      ([stateRows, candidateRows]) => {
        const state = stateRows![0] as {
          readonly globals_bytes?: number;
          readonly version: number;
        };
        expected = after?.version ?? state.version;
        assertBuildExportVersion(expected, state.version);
        const pageRange = buildExportPageRange(
          from,
          candidateRows as readonly BuildExportCandidateRow[],
          limit,
          state.globals_bytes ?? 0,
        );
        range = pageRange;
        const ranged = (statement: string): SqlReadStatement => ({
          sql: statement,
          params: [pageRange.after, pageRange.last],
        });
        return [
          { sql: BUILD_EXPORT_VERSION_SQL, params: [] },
          ranged(sql.routes),
          ranged(sql.snapshots),
          ranged(sql.blocks),
          ranged(sql.media),
          ...(sql.globals === undefined ? [] : [{ sql: sql.globals, params: [] }]),
        ];
      },
    );
    assertBuildExportVersion(expected, (versionRows![0] as { readonly version: number }).version);
    return buildExportPage(
      {
        blocks: blocks as readonly BlockRow[],
        ...(globals === undefined ? {} : { globals: globals as readonly PublicGlobalRow[] }),
        media: media as readonly Record<string, unknown>[],
        routes: routes as readonly PublicRow[],
        snapshots: snapshots as readonly SnapshotRow[],
      },
      range!,
      expected,
      this.resolveModel,
    );
  }

  public async listSiteBuilds(limit: number): Promise<readonly SiteBuildRecord[]> {
    const bounded = Math.max(1, Math.min(MAX_PAGE_SIZE, Math.trunc(limit)));
    const rows = await this.sql.all<SiteBuildRow>(
      "select * from site_builds order by requested_at desc, id desc limit ?",
      bounded,
    );
    return rows.map(siteBuildRecord);
  }

  public async getSiteBuild(buildId: SiteBuildId): Promise<SiteBuildRecord | null> {
    const row = await this.first<SiteBuildRow>("select * from site_builds where id = ?", buildId);
    return row === undefined ? null : siteBuildRecord(row);
  }

  /** Loads one entry with its draft and published snapshots, or `null`. */
  public async loadEntry(id: string): Promise<ContentEntry | null> {
    const row = await this.first<EntryRow>(`${ENTRY_COLUMNS_SQL} where id = ?`, id);
    if (row === undefined) return null;
    return (await this.hydrate([row])).get(row.id) ?? null;
  }

  /** First row of a statement that selects at most one row. */
  private async first<Row>(sql: string, ...params: readonly unknown[]): Promise<Row | undefined> {
    return (await this.sql.all<Row>(sql, ...params))[0];
  }

  private async publicMedia(
    rows: readonly EntryRow[],
  ): Promise<Map<string, readonly MediaMetadata[]>> {
    const ids = rows.flatMap((row) =>
      row.published_snapshot_id === null ? [] : [row.published_snapshot_id],
    );
    const mediaRows: Record<string, unknown>[] = [];
    for (const group of chunks(ids, this.sql.bindChunk)) {
      mediaRows.push(
        ...(await this.sql.all<Record<string, unknown>>(
          publicSnapshotMediaSql(group.length),
          ...group,
        )),
      );
    }
    return publicSnapshotMedia(mediaRows);
  }

  private async hydrate(rows: readonly EntryRow[]): Promise<Map<string, ContentEntry>> {
    return hydrateEntries(rows, await this.loadSnapshots(snapshotIdsOf(rows)), this.resolveModel);
  }

  private async loadSnapshots(ids: readonly string[]): Promise<Map<string, StoredSnapshot>> {
    if (ids.length === 0) return new Map();
    const snapshotRows: SnapshotRow[] = [];
    const blockRows: BlockRow[] = [];
    for (const group of chunks(ids, this.sql.bindChunk)) {
      const bindings = group.map(() => "?").join(", ");
      snapshotRows.push(
        ...(await this.sql.all<SnapshotRow>(
          `${SNAPSHOT_COLUMNS_SQL} where s.id in (${bindings})`,
          ...group,
        )),
      );
      blockRows.push(
        ...(await this.sql.all<BlockRow>(
          `${BLOCK_COLUMNS_SQL} where snapshot_id in (${bindings}) order by snapshot_id asc, position asc`,
          ...group,
        )),
      );
    }
    return storedSnapshots(snapshotRows, blockRows);
  }
}
