import type { InternalLinkReference, JsonValue } from "@lacecms/content";
import {
  ContentValidationError,
  canonicalJsonByteLength,
  MAX_INTERNAL_LINK_REFERENCES,
  isInternalLinkTargetId,
} from "@lacecms/content";
import { internalLinkIssuePath } from "@lacecms/application";
import { DomainError } from "@lacecms/domain";

export interface LinkSqlStatement {
  readonly sql: string;
  readonly params: readonly (string | number)[];
}
const COLUMNS = "source_key, area, field_path, target_entry_id, delivered";
export const COPY_INTERNAL_LINKS_SQL = `insert into content_entry_link_references (snapshot_id, ${COLUMNS})
  select ?, ${COLUMNS} from content_entry_link_references where snapshot_id = ?`;
export const BUMP_INTERNAL_LINK_GRAPH_SQL = `update content_link_state set revision = revision + 1
  where singleton_key = 1 and exists (select 1 from content_entry_link_references
    where snapshot_id in (select value from json_each(?)))`;

/** Bound rowsets are shared by both adapters, including their validation limits. */
export function internalLinkRowsJson(references: readonly InternalLinkReference[]): string {
  if (references.length > MAX_INTERNAL_LINK_REFERENCES)
    throw new DomainError("CONTENT_INVALID_STATE", "Too many internal links.");
  const locations = new Set<string>();
  return JSON.stringify(
    references.map((reference) => {
      const location = JSON.stringify([reference.sourceKey, reference.area, reference.pointer]);
      if (
        !isInternalLinkTargetId(reference.targetId) ||
        !reference.pointer.startsWith("/") ||
        !["fields", "data"].includes(reference.area) ||
        typeof reference.delivered !== "boolean" ||
        (reference.area === "fields"
          ? reference.sourceKey !== "$fields"
          : !reference.sourceKey || reference.sourceKey.startsWith("$")) ||
        locations.has(location)
      )
        throw new DomainError("CONTENT_INVALID_STATE", "Invalid internal link projection.");
      locations.add(location);
      return [
        reference.sourceKey,
        reference.area,
        reference.pointer,
        reference.targetId,
        reference.delivered ? 1 : 0,
      ];
    }),
  );
}
const INCOMING = `select json_extract(value, '$[0]') as source_key,
  json_extract(value, '$[1]') as area, json_extract(value, '$[2]') as field_path,
  json_extract(value, '$[3]') as target_entry_id, json_extract(value, '$[4]') as delivered from json_each(?)`;
const MATCH = `i.source_key=r.source_key and i.area=r.area and i.field_path=r.field_path
  and i.target_entry_id=r.target_entry_id and i.delivered=r.delivered`;

/** Three set operations; unchanged tuples and graph revision receive zero row writes. */
export function replaceInternalLinkStatements(
  snapshotId: string,
  references: readonly InternalLinkReference[],
  guard = "1",
): readonly LinkSqlStatement[] {
  return replaceFrom(snapshotId, INCOMING, [internalLinkRowsJson(references)], guard);
}

/** Revert keeps stable block keys; source JSON and projection are copied in one guarded unit. */
export function copyInternalLinkDiffStatements(
  snapshotId: string,
  sourceSnapshotId: string,
  guard = "1",
): readonly LinkSqlStatement[] {
  return replaceFrom(
    snapshotId,
    `select ${COLUMNS} from content_entry_link_references where snapshot_id = ?`,
    [sourceSnapshotId],
    guard,
  );
}
function replaceFrom(
  snapshotId: string,
  incoming: string,
  params: readonly string[],
  guard: string,
): readonly LinkSqlStatement[] {
  const removed = `select 1 from content_entry_link_references r where r.snapshot_id = ?
    and not exists (select 1 from incoming i where ${MATCH})`;
  const added = `select 1 from incoming i where not exists
    (select 1 from content_entry_link_references r where r.snapshot_id = ? and ${MATCH})`;
  return [
    {
      sql: `with incoming as (${incoming}) update content_link_state set revision = revision + 1
        where singleton_key = 1 and (exists (${removed}) or exists (${added})) and (${guard})`,
      params: [...params, snapshotId, snapshotId],
    },
    {
      sql: `with incoming as (${incoming}) delete from content_entry_link_references as r
        where r.snapshot_id = ? and not exists (select 1 from incoming i where ${MATCH}) and (${guard})`,
      params: [...params, snapshotId],
    },
    {
      sql: `with incoming as (${incoming}) insert into content_entry_link_references (snapshot_id, ${COLUMNS})
        select ?, i.source_key, i.area, i.field_path, i.target_entry_id, i.delivered from incoming i
        where not exists (select 1 from content_entry_link_references r where r.snapshot_id = ? and ${MATCH}) and (${guard})`,
      params: [...params, snapshotId, snapshotId],
    },
  ];
}

export const LINK_TARGETS_SQL = `select requested.value as requested_id, e.id, e.model_key, m.kind,
  d.title, p.path from json_each(?) requested
  left join content_entries e on e.id = requested.value
  left join content_models m on m.key=e.model_key
  left join content_snapshots d on d.id=e.draft_snapshot_id
  left join published_routes p on p.entry_id=e.id and p.snapshot_id=e.published_snapshot_id
  order by cast(requested.key as integer)`;

/** Binds source snapshot, publishing entry and candidate path, including first self-publication. */
export const INVALID_PUBLISHED_LINK_TARGETS_SQL = `select r.source_key, r.area, r.field_path, r.target_entry_id
  from content_entry_link_references r
  left join content_entries target on target.id=r.target_entry_id
  left join published_routes route on route.entry_id=target.id and route.snapshot_id=target.published_snapshot_id
  where r.snapshot_id=? and r.delivered=1 and not (r.target_entry_id=? and ? is not null) and route.path is null`;

export interface InvalidPublishedLinkTargetRow {
  readonly source_key: string;
  readonly area: "fields" | "data";
  readonly field_path: string;
  readonly target_entry_id: string;
}

export function assertPublishedInternalLinkTargets(
  rows: readonly InvalidPublishedLinkTargetRow[],
  blockKeys: readonly string[],
): void {
  if (rows.length === 0) return;
  throw new ContentValidationError(
    rows.map((row) => ({
      code: "internal_link_unavailable",
      message: "must target an entry with a published route.",
      path: internalLinkIssuePath(
        { sourceKey: row.source_key, area: row.area, pointer: row.field_path },
        blockKeys,
      ),
    })),
  );
}

/** Shared read projection at schema synchronization boundaries. */
export const SNAPSHOT_INTERNAL_LINKS_JSON_SQL = `(select coalesce(json_group_array(json_object(
  'sourceKey',lr.source_key,'area',lr.area,'pointer',lr.field_path,'targetId',lr.target_entry_id,
  'delivered',json(case when lr.delivered=1 then 'true' else 'false' end))), '[]')
  from content_entry_link_references lr where lr.snapshot_id=s.id)`;

/** Set-based projection replacement shared by schema rewrites and resumable units. */
export function syncInternalLinkStatements(
  rows: readonly import("@lacecms/application").ConfigurationSyncLinkRewrite[],
  dirtyToken: string,
): { readonly valid: readonly LinkSqlStatement[]; readonly writes: readonly LinkSqlStatement[] } {
  const valid: LinkSqlStatement[] = [];
  const writes: LinkSqlStatement[] = [];
  const ids = new Set<string>();
  for (const row of rows) {
    if (ids.has(row.snapshotId))
      throw new DomainError("CONTENT_INVALID_STATE", "Duplicate link projection snapshot.");
    ids.add(row.snapshotId);
    internalLinkRowsJson(row.references);
  }
  const groups: (typeof rows)[] = [];
  let group: (typeof rows)[number][] = [];
  let length = 2;
  for (const row of rows) {
    const size = canonicalJsonByteLength(row as unknown as JsonValue);
    if (size > 1_500_000)
      throw new DomainError("CONTENT_INVALID_STATE", "Link projection exceeds payload capacity.");
    if (length + size > 1_500_000 && group.length) {
      groups.push(group);
      group = [];
      length = 2;
    }
    group.push(row);
    length += size;
  }
  if (group.length) groups.push(group);
  for (const group of groups) {
    const json = JSON.stringify(group);
    const incoming = `select p.value ->> 'snapshotId' as snapshot_id,
      r.value ->> 'sourceKey' as source_key,r.value ->> 'area' as area,
      r.value ->> 'pointer' as field_path,r.value ->> 'targetId' as target_entry_id,
      r.value ->> 'delivered' as delivered from json_each(?) p,json_each(p.value -> 'references') r`;
    const same = `i.snapshot_id=r.snapshot_id and ${MATCH}`;
    const added = `select 1 from incoming i where not exists(select 1 from content_entry_link_references r where ${same})`;
    const removed = `select 1 from content_entry_link_references r
      where r.snapshot_id in (select value ->> 'snapshotId' from json_each(?))
      and not exists(select 1 from incoming i where ${same})`;
    valid.push({
      params: [json],
      sql: `not exists(with incoming as (${incoming})
      select 1 from incoming i left join content_entries e on e.published_snapshot_id=i.snapshot_id
      left join content_entries target on target.id=i.target_entry_id
      left join content_models m on m.key=target.model_key
      left join published_routes route on route.entry_id=target.id and route.snapshot_id=target.published_snapshot_id
      where (m.kind='global' or (e.id is not null and i.delivered=1 and route.path is null))
      and not exists(select 1 from content_entry_link_references r where ${same}))`,
    });
    writes.push(
      {
        params: [json, dirtyToken, json],
        sql: `with incoming as (${incoming})
        insert or ignore into mutation_guards(token,created_at) select ?,0
        where (exists(${added}) or exists(${removed}))`,
      },
      {
        params: [json, json],
        sql: `with incoming as (${incoming}) delete from content_entry_link_references as r
        where r.snapshot_id in (select value ->> 'snapshotId' from json_each(?))
        and not exists(select 1 from incoming i where ${same})`,
      },
      {
        params: [json],
        sql: `with incoming as (${incoming}) insert into content_entry_link_references
        (snapshot_id,source_key,area,field_path,target_entry_id,delivered)
        select i.snapshot_id,i.source_key,i.area,i.field_path,i.target_entry_id,i.delivered from incoming i
        where not exists(select 1 from content_entry_link_references r where ${same})`,
      },
    );
  }
  return { valid, writes };
}
export const COMMIT_SYNC_LINK_GRAPH_SQL = `update content_link_state set revision=revision+1
  where singleton_key=1 and exists(select 1 from mutation_guards where token=?)`;
