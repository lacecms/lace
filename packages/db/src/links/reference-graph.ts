import { MAX_REFERENCE_CYCLE_IDS } from "@lacecms/content";
import type { ReferenceCycleDetails, SnapshotEntryReference } from "@lacecms/content";
import type { EntryUsage } from "./statements.js";
import type { WritePlanSql } from "../write-plan/plan.js";
import { publicationCycleSql } from "./publication-cycle.js";

export const MAX_REFERENCE_GRAPH_IDS = 2_048;
export type ReferencePhase = "draft" | "published";

export interface ReferenceGraphReplacement {
  readonly entryId: string;
  readonly references: readonly EntryUsage[];
}

export interface ReferenceGraphRow {
  readonly over_limit: number;
  readonly cycle: number;
  readonly witness_json: string | null;
  readonly first_target: string | null;
  readonly publish_first_json?: string | null;
}

export type ReferenceGraphIssue =
  | { readonly kind: "limit"; readonly targetId: string }
  | ({
      readonly kind: "cycle";
      readonly targetId: string;
    } & ReferenceCycleDetails);

/** Only the delivered typed occurrences contribute to published reachability. */
export function typedReferences(
  references: readonly SnapshotEntryReference[],
  phase: ReferencePhase,
): readonly Extract<SnapshotEntryReference, { purpose: "reference" }>[] {
  return references.filter(
    (row): row is Extract<SnapshotEntryReference, { purpose: "reference" }> =>
      row.purpose === "reference" && (phase === "draft" || row.delivered),
  );
}

/**
 * Proof for one changed source, over the replacements of its phase. Old
 * outgoing arcs of each replaced vertex are shadowed, including empty
 * replacements. The recursive queue deduplicates IDs and stops at one
 * sentinel beyond the supported limit.
 */
export function referenceGraphQuery(
  entryId: string,
  phase: ReferencePhase,
  replacements: readonly ReferenceGraphReplacement[],
  witness = false,
): WritePlanSql {
  return {
    params: [
      entryId,
      JSON.stringify(
        replacements.map((replacement) => [
          replacement.entryId,
          graphTargets(replacement.references, phase),
        ]),
      ),
    ],
    sql: referenceGraphProofSql(
      phase,
      {
        subject: "?",
        overlay: "select value ->> '$[0]', value -> '$[1]' from json_each(?)",
      },
      witness && phase === "published" && replacements.length === 1 ? "publication" : witness,
    ),
  };
}

export function graphTargets(
  references: readonly EntryUsage[],
  phase: ReferencePhase,
): readonly string[] {
  return [
    ...new Set(
      references.flatMap((row) =>
        row.purpose === "reference" && (phase === "draft" || row.delivered) ? [row.targetId] : [],
      ),
    ),
  ];
}

/** The proof also accepts a correlated overlay when one sync rewrites several sources. */
export function referenceGraphProofSql(
  phase: ReferencePhase,
  inputs: { readonly subject: string; readonly overlay: string },
  witness: boolean | "publication",
  scalar = false,
): string {
  const pointer = phase === "draft" ? "draft_snapshot_id" : "published_snapshot_id";
  const delivery = phase === "draft" ? "" : " and r.delivered=1";
  const edge = `r.snapshot_id=e.${pointer} and r.purpose='reference'${delivery}`;
  const target = "(select min(id) from added)";
  const diagnostic = witness ? "(select value from witness)" : "null";
  const result = scalar
    ? `json_array(over_limit, cycle, ${target}, ${diagnostic})`
    : `over_limit, cycle, ${target} as first_target, ${diagnostic} as witness_json
      ${witness === "publication" ? ", (select value from publish_first) as publish_first_json" : ""}`;
  return `with recursive
      subject(id) as materialized (values (${inputs.subject})),
      overlay(id, targets) as materialized (
        ${inputs.overlay}
      ),
      added(id) as materialized (
        select j.value from subject s join overlay o on o.id=s.id cross join json_each(o.targets) j
        where not exists (
          select 1 from content_entries e
          join content_entry_link_references r indexed by content_entry_link_references_outgoing_idx on ${edge}
          where e.id=s.id and r.target_entry_id=j.value
        )
      ),
      visited(id) as materialized (
        select id from added
        union
        select r.target_entry_id from visited v
        cross join content_entries e on e.id=v.id
        cross join content_entry_link_references r indexed by content_entry_link_references_outgoing_idx on ${edge}
        where v.id<>(select id from subject) and not exists (select 1 from overlay o where o.id=v.id)
        union
        select j.value from visited v
        join overlay o on o.id=v.id cross join json_each(o.targets) j
        where v.id<>(select id from subject)
        limit ${MAX_REFERENCE_GRAPH_IDS + 1}
      ),
      result(over_limit, cycle) as materialized (
        select count(*)>${MAX_REFERENCE_GRAPH_IDS}, coalesce(max(id=(select id from subject)),0) from visited
      )
      ${witness ? graphArcsSql(edge) : ""}
      ${witness === "publication" ? publicationCycleSql(MAX_REFERENCE_GRAPH_IDS + 1) : witness ? graphWitnessSql() : ""}
      select ${result} from result`;
}

/**
 * Build a bounded diagnostic from the same read. Only arcs between vertices
 * actually visited by the proof can contribute to a witness.
 */
function graphArcsSql(edge: string): string {
  return `, arcs(source, target) as materialized (
    select v.id, r.target_entry_id from visited v
    cross join content_entries e on e.id=v.id
    cross join content_entry_link_references r indexed by content_entry_link_references_outgoing_idx on ${edge}
    where v.id<>(select id from subject)
      and not exists (select 1 from overlay o where o.id=v.id)
      and exists (select 1 from visited reached where reached.id=r.target_entry_id)
    union
    select v.id, j.value from visited v
    join overlay o on o.id=v.id cross join json_each(o.targets) j
    where v.id<>(select id from subject)
      and exists (select 1 from visited reached where reached.id=j.value)
  )`;
}

function graphWitnessSql(): string {
  return `, walk(step, node, seen) as (
    select 0, (select id from subject), json_array() from result where cycle=1
    union all
    select w.step+1, (
      with recursive exits(id) as (
        select id from subject
        union
        select a.source from exits x join arcs a on a.target=x.id
        where not exists(select 1 from json_each(w.seen) used where used.value=a.source)
      )
      select min(a.target) from (
        select id as target from added where w.step=0
        union all
        select target from arcs where w.step>0 and source=w.node
      ) a join exits x on x.id=a.target
    ), json_insert(w.seen,'$[#]',w.node)
    from walk w where w.step<${MAX_REFERENCE_CYCLE_IDS} and (w.step=0 or w.node<>(select id from subject))
  ), witness(value) as (
    select json_group_array(node order by step) from walk
  )`;
}

/** Translate bounded SQL evidence into the deterministic graph diagnostic. */
export function referenceGraphIssue(
  row: ReferenceGraphRow,
  entryId: string,
): ReferenceGraphIssue | undefined {
  if (!row.cycle)
    return row.over_limit ? { kind: "limit", targetId: row.first_target! } : undefined;
  const witness = JSON.parse(row.witness_json!) as string[];
  const truncated = witness.length > MAX_REFERENCE_CYCLE_IDS;
  const [entryIdToPublish, title] = row.publish_first_json
    ? (JSON.parse(row.publish_first_json) as [string, string])
    : [];
  return {
    kind: "cycle",
    targetId: witness[1]!,
    witness: truncated ? [...witness.slice(0, MAX_REFERENCE_CYCLE_IDS - 1), entryId] : witness,
    truncated,
    ...(entryIdToPublish === undefined
      ? {}
      : { publishFirst: { entryId: entryIdToPublish, title: title! } }),
  };
}
