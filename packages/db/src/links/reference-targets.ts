import type { SnapshotEntryReference } from "@lacecms/content";
import type { WritePlanSql } from "../write-plan/plan.js";
import type { ReferencePhase } from "./reference-graph.js";
import { typedReferences } from "./reference-graph.js";

export type InvalidReferenceCode =
  | "reference_target_missing"
  | "reference_target_model"
  | "reference_target_unpublished";

export interface InvalidReferenceRow {
  readonly index: number;
  readonly code: InvalidReferenceCode;
}

/** RFC 6901 numeric list segments vary while their descriptor location remains stable. */
export function referenceFieldKey(pointer: string): string {
  return pointer.replace(/\/(0|[1-9][0-9]*)(?=\/|$)/gu, "/*");
}

/**
 * Validate the candidate in one set operation. When editing an existing
 * draft, a missing selection may reuse one occurrence of its ID in the same
 * block and declared field/list. A fresh or delivered selection has no such
 * allowance.
 */
export function referenceTargetsQuery(
  references: readonly SnapshotEntryReference[],
  phase: ReferencePhase,
  previousDraftId: string | null = null,
): WritePlanSql {
  const rows = typedReferences(references, phase).map((row, index) => [
    index,
    row.sourceKey,
    row.area,
    referenceFieldKey(row.pointer),
    row.targetId,
    row.models,
  ]);
  return {
    params: [JSON.stringify(rows), previousDraftId, phase],
    sql: `with recursive
      requested as (
        select value ->> '$[0]' as ordinal, value ->> '$[1]' as source_key,
          value ->> '$[2]' as area, value ->> '$[3]' as field_key,
          value ->> '$[4]' as target_id, value -> '$[5]' as models from json_each(?)
      ),
      occurrences as (
        select *, row_number() over (
          partition by source_key,area,field_key,target_id order by ordinal
        ) as position from requested
      ),
      prior(source_key,area,target_id,field_key,remaining) as (
        select source_key,area,target_entry_id,'',substr(field_path,2)||'/'
        from content_entry_link_references where snapshot_id=? and purpose='reference'
        union all
        select source_key,area,target_id,field_key||'/'||
          case when substr(remaining,1,instr(remaining,'/')-1) not glob '*[^0-9]*'
            then '*' else substr(remaining,1,instr(remaining,'/')-1) end,
          substr(remaining,instr(remaining,'/')+1)
        from prior where remaining<>''
      ),
      allowances as (
        select source_key,area,target_id,field_key,count(*) as amount
        from prior where remaining='' group by source_key,area,target_id,field_key
      ),
      checked as (
        select o.ordinal as "index", case
          when e.id is null and o.position>coalesce(a.amount,0) then 'reference_target_missing'
          when e.id is not null and (m.kind='global'
            or e.model_key not in (select value from json_each(o.models))) then 'reference_target_model'
          when ?='published' and e.published_snapshot_id is null then 'reference_target_unpublished'
        end as code
        from occurrences o
        left join content_entries e on e.id=o.target_id
        left join content_models m on m.key=e.model_key
        left join allowances a using(source_key,area,target_id,field_key)
      )
      select "index",code from checked where code is not null order by "index"`,
  };
}
