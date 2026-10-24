import { isInternalLinkTargetId, sha256CanonicalJson } from "@lacecms/content";
import {
  assertLinkImpactAcknowledgment,
  assertLinkPageLimit,
  encodeLinkImpactReceipt,
  opaqueCursor,
} from "@lacecms/application";
import type {
  ContentLinkReadPort,
  LinkTargetStatus,
  LinkTargetQuery,
  LinkTargetPage,
  LinkImpactQuery,
  LinkImpactPage,
  LinkImpactEvidence,
  LinkUsageLocation,
  LinkUsageSource,
  OpaqueCursor,
} from "@lacecms/application";
import { DomainError } from "@lacecms/domain";
import { encodeBase64Url, decodeBase64Url } from "./sql-content.js";
import { LINK_TARGETS_SQL } from "./sql-internal-links.js";

export interface LinkReadSql {
  all<Row>(sql: string, ...params: readonly unknown[]): Promise<readonly Row[]>;
}
interface TargetRow {
  readonly requested_id: string;
  readonly id: string | null;
  readonly model_key: string | null;
  readonly kind: string | null;
  readonly title: string | null;
  readonly path: string | null;
  readonly snapshot_id?: string;
}
function invalid(): never {
  throw new DomainError("CONTENT_INVALID_STATE", "Invalid link query or cursor.");
}
function drift(): never {
  throw new DomainError(
    "CONTENT_LINK_IMPACT_CHANGED",
    "Link impact changed. Refresh and review it again.",
  );
}
function target(row: TargetRow): LinkTargetStatus {
  if (row.id === null) return { id: row.requested_id, state: "missing" };
  if (row.kind === "global") return { id: row.id, state: "non-routable", modelKey: row.model_key! };
  if ((row.kind !== "page" && row.kind !== "collection") || row.title === null) return invalid();
  const value = {
    id: row.id,
    modelKey: row.model_key!,
    modelKind: row.kind,
    title: row.title,
  } as const;
  return row.path === null
    ? { ...value, state: "unpublished" }
    : { ...value, state: "published", path: row.path };
}
interface Cursor {
  readonly version: 1;
  readonly kind: "picker" | "sources" | "locations";
  readonly scope: string;
  readonly graph: number;
  readonly last: readonly string[];
}
function cursor(value: Cursor): OpaqueCursor {
  const encoded = encodeBase64Url(JSON.stringify(value));
  if (encoded.length > 4096) invalid();
  return opaqueCursor(encoded);
}
function parseCursor(
  value: string | undefined,
  kind: Cursor["kind"],
  scope: string,
): Cursor | undefined {
  if (value === undefined) return undefined;
  try {
    if (value.length > 4096 || !/^[A-Za-z0-9_-]+$/u.test(value)) return invalid();
    const parsed = JSON.parse(decodeBase64Url(value)) as Cursor;
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed) ||
      Object.keys(parsed).length !== 5 ||
      parsed.version !== 1 ||
      parsed.kind !== kind ||
      parsed.scope !== scope ||
      !Number.isSafeInteger(parsed.graph) ||
      parsed.graph < 0 ||
      !Array.isArray(parsed.last) ||
      parsed.last.length !== (kind === "sources" ? 1 : 2) ||
      !parsed.last.every((item) => typeof item === "string") ||
      (kind === "locations" &&
        (!/^[1-9][0-9]{0,18}$/u.test(parsed.last[0]!) ||
          BigInt(parsed.last[0]!) > 9223372036854775807n ||
          !/^[0-9a-f]{64}$/u.test(parsed.last[1]!))) ||
      cursor(parsed) !== value
    )
      return invalid();
    return parsed;
  } catch {
    return invalid();
  }
}
const EXTERNAL = `not (e.id = ? and (? = 'delete' or e.published_snapshot_id = s.id))`;
export const LINK_IMPACT_EVIDENCE_SQL = `select g.revision as graph_revision, d.revision as draft_revision,
  t.published_snapshot_id, t.id,
  exists(select 1 from content_entry_link_references r
    join content_snapshots s on s.id=r.snapshot_id
    join content_entries e on e.id=s.entry_id and e.published_snapshot_id=s.id
    where r.target_entry_id=? and r.delivered=1 and ${EXTERNAL}) as has_published_usages
  from content_link_state g left join content_entries t on t.id=?
  left join content_snapshots d on d.id=t.draft_snapshot_id where g.singleton_key=1`;
export interface ImpactEvidenceRow {
  readonly graph_revision: number;
  readonly draft_revision: number | null;
  readonly published_snapshot_id: string | null;
  readonly id: string | null;
  readonly has_published_usages: number;
}
interface LocationRow {
  readonly location_id: string;
  readonly source_key: string;
  readonly area: "fields" | "data";
  readonly field_path: string;
  readonly delivered: number;
}
function location(row: LocationRow): LinkUsageLocation {
  return {
    sourceKey: row.source_key,
    area: row.area,
    pointer: row.field_path,
    delivered: row.delivered === 1,
  };
}
const LOCATION_COLUMNS =
  "cast(r.rowid as text) as location_id, r.source_key, r.area, r.field_path, r.delivered";
const LOCATION_ORDER = "r.source_key, r.area, r.field_path";
function locationKey(row: LocationRow): Promise<string> {
  return sha256CanonicalJson([row.source_key, row.area, row.field_path]);
}
interface SourceRow {
  readonly entry_id: string;
  readonly snapshot_id: string;
  readonly model_key: string;
  readonly title: string;
  readonly phase: "draft" | "published";
  readonly locations_json: string;
}

/** Shared bounded queries; adapters supply only their native execution capability. */
export class SqlContentLinkReader implements ContentLinkReadPort {
  public constructor(private readonly db: LinkReadSql) {}
  public async resolveLinkTargets(
    ids: readonly string[],
  ): Promise<Readonly<Record<string, LinkTargetStatus>>> {
    if (ids.length > 200 || new Set(ids).size !== ids.length || !ids.every(isInternalLinkTargetId))
      invalid();
    if (ids.length === 0) return {};
    const rows = await this.db.all<TargetRow>(LINK_TARGETS_SQL, JSON.stringify(ids));
    return Object.fromEntries(rows.map((row) => [row.requested_id, target(row)]));
  }
  public async listLinkTargets(input: LinkTargetQuery): Promise<LinkTargetPage> {
    assertLinkPageLimit(input.limit);
    const search = input.search?.trim() ?? "";
    if (
      search.length > 100 ||
      (input.status !== undefined && !["published", "unpublished"].includes(input.status))
    )
      invalid();
    const scope = await sha256CanonicalJson([
      input.modelKey ?? null,
      input.status ?? null,
      search,
      input.limit,
    ]);
    const after = parseCursor(input.after, "picker", scope);
    const pattern =
      search.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_") + "%";
    const rows = await this.db.all<TargetRow>(
      `select e.id, e.model_key, m.kind, s.title,
      s.id as snapshot_id, p.path from content_snapshots s indexed by content_snapshots_title_prefix_idx
      join content_entries e on e.id=s.entry_id and e.draft_snapshot_id=s.id join content_models m on m.key=e.model_key
      left join published_routes p on p.entry_id=e.id and p.snapshot_id=e.published_snapshot_id
      where s.title like ? escape '\\' and m.kind in ('page','collection')
      and (? is null or e.model_key=?) and (? is null or (case when p.path is null then 'unpublished' else 'published' end)=?)
      and (? is null or s.title collate nocase > ? or (s.title collate nocase = ? and s.id > ?))
      order by s.title collate nocase, s.id limit ?`,
      pattern,
      input.modelKey ?? null,
      input.modelKey ?? null,
      input.status ?? null,
      input.status ?? null,
      after?.last[0] ?? null,
      after?.last[0] ?? null,
      after?.last[0] ?? null,
      after?.last[1] ?? "",
      input.limit + 1,
    );
    const page = rows.slice(0, input.limit);
    const last = page.at(-1);
    return {
      items: page.map(
        (row) => target(row) as Extract<LinkTargetStatus, { readonly title: string }>,
      ),
      ...(rows.length <= input.limit || last === undefined
        ? {}
        : {
            nextCursor: cursor({
              version: 1,
              kind: "picker",
              scope,
              graph: 0,
              last: [last.title!, last.snapshot_id!],
            }),
          }),
    };
  }
  public async readLinkImpact(
    input: LinkImpactQuery & { readonly actorId: string },
  ): Promise<LinkImpactPage> {
    assertLinkPageLimit(input.limit);
    if (!isInternalLinkTargetId(input.targetId) || !["delete", "unpublish"].includes(input.action))
      invalid();
    const mode =
      input.sourceEntryId !== undefined ||
      input.snapshotId !== undefined ||
      input.locationsAfter !== undefined
        ? "locations"
        : "sources";
    if (
      mode === "locations" &&
      (input.after !== undefined ||
        !isInternalLinkTargetId(input.sourceEntryId) ||
        !isInternalLinkTargetId(input.snapshotId))
    )
      invalid();
    const scope = await sha256CanonicalJson([
      input.targetId,
      input.action,
      input.actorId,
      mode === "locations" ? (input.sourceEntryId ?? null) : null,
      mode === "locations" ? (input.snapshotId ?? null) : null,
    ]);
    const after = parseCursor(mode === "sources" ? input.after : input.locationsAfter, mode, scope);
    const [observed] = await this.db.all<ImpactEvidenceRow>(
      LINK_IMPACT_EVIDENCE_SQL,
      input.targetId,
      input.targetId,
      input.action,
      input.targetId,
    );
    if (!observed || !observed.id || observed.draft_revision === null) invalid();
    if (after !== undefined && after.graph !== observed.graph_revision) drift();
    const evidence: LinkImpactEvidence = {
      version: 1,
      targetId: input.targetId,
      action: input.action,
      actorId: input.actorId,
      draftRevision: observed.draft_revision,
      publishedSnapshotId: observed.published_snapshot_id,
      graphRevision: observed.graph_revision,
    };
    const common = {
      hasPublishedUsages: observed.has_published_usages === 1,
      receipt: encodeLinkImpactReceipt(evidence),
    };
    let result: LinkImpactPage;
    if (mode === "locations") {
      const anchor =
        after === undefined
          ? undefined
          : (
              await this.db.all<LocationRow>(
                `select ${LOCATION_COLUMNS} from content_entry_link_references r
         where r.target_entry_id=? and r.snapshot_id=? and r.rowid=cast(? as integer)`,
                input.targetId,
                input.snapshotId,
                after.last[0],
              )
            )[0];
      if (
        after !== undefined &&
        (anchor === undefined || (await locationKey(anchor)) !== after.last[1])
      )
        drift();
      const rows = await this.db.all<LocationRow>(
        `select ${LOCATION_COLUMNS} from content_entry_link_references r
        join content_snapshots s on s.id=r.snapshot_id join content_entries e on e.id=s.entry_id
        where r.target_entry_id=? and s.id=? and e.id=? and (e.draft_snapshot_id=s.id or e.published_snapshot_id=s.id)
        and ${EXTERNAL} and (r.source_key,r.area,r.field_path) > (?,?,?)
        order by ${LOCATION_ORDER} limit ?`,
        input.targetId,
        input.snapshotId,
        input.sourceEntryId,
        input.targetId,
        input.action,
        anchor?.source_key ?? "",
        anchor?.area ?? "",
        anchor?.field_path ?? "",
        input.limit + 1,
      );
      const page = rows.slice(0, input.limit);
      const last = page.at(-1);
      result = {
        ...common,
        mode: "locations",
        sourceEntryId: input.sourceEntryId!,
        snapshotId: input.snapshotId!,
        locations: page.map(location),
        ...(rows.length <= input.limit || !last
          ? {}
          : {
              nextCursor: cursor({
                version: 1,
                kind: "locations",
                scope,
                graph: observed.graph_revision,
                last: [last.location_id, await locationKey(last)],
              }),
            }),
      };
    } else {
      const rows = await this.db.all<SourceRow>(
        `select e.id as entry_id,s.id as snapshot_id,e.model_key,s.title,
        case when e.published_snapshot_id=s.id then 'published' else 'draft' end as phase,
        (select json_group_array(json_object('location_id',loc.location_id,'source_key',loc.source_key,'area',loc.area,'field_path',loc.field_path,'delivered',loc.delivered))
          from (select ${LOCATION_COLUMNS} from content_entry_link_references r
            where r.target_entry_id=? and r.snapshot_id=s.id order by ${LOCATION_ORDER} limit 11) loc) as locations_json
        from (select distinct r.snapshot_id from content_entry_link_references r
          join content_snapshots s on s.id=r.snapshot_id join content_entries e on e.id=s.entry_id
          where r.target_entry_id=? and r.snapshot_id > ?
            and (e.draft_snapshot_id=s.id or e.published_snapshot_id=s.id) and ${EXTERNAL}
          order by r.snapshot_id limit ?) candidates
        join content_snapshots s on s.id=candidates.snapshot_id join content_entries e on e.id=s.entry_id
        order by s.id`,
        input.targetId,
        input.targetId,
        after?.last[0] ?? "",
        input.targetId,
        input.action,
        input.limit + 1,
      );
      const page = rows.slice(0, input.limit);
      const sources: LinkUsageSource[] = await Promise.all(
        page.map(async (row) => {
          const locations = JSON.parse(row.locations_json) as LocationRow[];
          const last = locations[9];
          return {
            entryId: row.entry_id,
            snapshotId: row.snapshot_id,
            modelKey: row.model_key,
            title: row.title,
            phase: row.phase,
            locations: locations.slice(0, 10).map(location),
            ...(locations.length <= 10 || !last
              ? {}
              : {
                  nextLocationsCursor: cursor({
                    version: 1,
                    kind: "locations",
                    scope: await sha256CanonicalJson([
                      input.targetId,
                      input.action,
                      input.actorId,
                      row.entry_id,
                      row.snapshot_id,
                    ]),
                    graph: observed.graph_revision,
                    last: [last.location_id, await locationKey(last)],
                  }),
                }),
          };
        }),
      );
      result = {
        ...common,
        mode: "sources",
        sources,
        ...(rows.length <= input.limit
          ? {}
          : {
              nextCursor: cursor({
                version: 1,
                kind: "sources",
                scope,
                graph: observed.graph_revision,
                last: [page.at(-1)!.snapshot_id],
              }),
            }),
      };
    }
    const [current] = await this.db.all<{ revision: number }>(
      "select revision from content_link_state where singleton_key=1",
    );
    if (current?.revision !== observed.graph_revision) drift();
    return result;
  }
}

/** Compare observed impact, then provide an atomic SQL condition for removal. */
export function linkRemovalCondition(
  row: ImpactEvidenceRow | undefined,
  targetId: string,
  action: import("@lacecms/application").LinkImpactAction,
  actorId: string,
  acknowledgment: import("@lacecms/application").LinkImpactAcknowledgment | undefined,
): { readonly sql: string; readonly params: readonly (string | number | null)[] } {
  if (!row?.id || row.draft_revision === null) invalid();
  const evidence: LinkImpactEvidence = {
    version: 1,
    targetId,
    action,
    actorId,
    draftRevision: row.draft_revision,
    publishedSnapshotId: row.published_snapshot_id,
    graphRevision: row.graph_revision,
  };
  assertLinkImpactAcknowledgment(acknowledgment, evidence, row.has_published_usages === 1);
  if (acknowledgment !== undefined)
    return {
      sql: `(select revision from content_link_state where singleton_key=1)=?
      and exists(select 1 from content_entries e join content_snapshots d on d.id=e.draft_snapshot_id
        where e.id=? and d.revision=? and e.published_snapshot_id is ?)`,
      params: [
        evidence.graphRevision,
        targetId,
        evidence.draftRevision,
        evidence.publishedSnapshotId,
      ],
    };
  return {
    sql: `not exists(select 1 from content_entry_link_references r
      join content_snapshots s on s.id=r.snapshot_id join content_entries e on e.id=s.entry_id and e.published_snapshot_id=s.id
      where r.target_entry_id=? and r.delivered=1 and ${EXTERNAL})`,
    params: [targetId, targetId, action],
  };
}
