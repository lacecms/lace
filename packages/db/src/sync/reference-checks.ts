import { CONFIGURATION_SYNC_NAMED_SNAPSHOT_LIMIT } from "@lacecms/application";
import type {
  ConfigurationSyncReferenceInspection,
  ConfigurationSyncReferenceIssue,
} from "@lacecms/application";
import { canonicalJsonByteLength } from "@lacecms/content";
import type { JsonValue } from "@lacecms/content";
import type { WritePlanSql } from "../write-plan/plan.js";
import { graphTargets, referenceGraphProofSql } from "../links/reference-graph.js";
import type { ReferencePhase } from "../links/reference-graph.js";

function boundRows(rows: readonly JsonValue[]): WritePlanSql {
  const batches: string[] = [];
  let batch: JsonValue[] = [];
  let bytes = 2;
  for (const row of rows) {
    const size = canonicalJsonByteLength(row) + 1;
    if (bytes + size > 1_500_000 && batch.length) {
      batches.push(JSON.stringify(batch));
      batch = [];
      bytes = 2;
    }
    batch.push(row);
    bytes += size;
  }
  batches.push(JSON.stringify(batch));
  return {
    sql: batches.map(() => "select value from json_each(?)").join(" union all "),
    params: batches,
  };
}

function targetIssues(input: ConfigurationSyncReferenceInspection): WritePlanSql | undefined {
  const rows = input.checks.flatMap((check, index) =>
    check.selections.map(
      ({ reference, allowMissing }) =>
        [
          index,
          reference.targetId,
          reference.models,
          reference.sourceKey,
          reference.pointer,
          check.state === "published" && reference.delivered ? 1 : 0,
          allowMissing ? 1 : 0,
        ] as const,
    ),
  );
  if (!rows.length) return undefined;
  const payload = boundRows(rows);
  return {
    params: [...payload.params, JSON.stringify(input.renames)],
    sql: `with requested(value) as (${payload.sql}),
      renames(old_key,new_key) as materialized (
        select value ->> 0,value ->> 1 from json_each(?)
      ), results as (
        select v.value ->> 0 as "index", v.value ->> 1 as targetId,
          v.value ->> 3 as sourceKey,v.value ->> 4 as pointer,
          case
            when e.id is null and (v.value ->> 6 = 0 or v.value ->> 5 = 1) then 'reference_target_missing'
            when e.id is not null and (m.kind='global' or coalesce(r.new_key,e.model_key)
              not in (select value from json_each(v.value -> 2))) then 'reference_target_model'
            when v.value ->> 5 = 1 and e.published_snapshot_id is null then 'reference_target_unpublished'
          end as code
        from requested v left join content_entries e on e.id=v.value ->> 1
        left join content_models m on m.key=e.model_key left join renames r on r.old_key=e.model_key
      )
      select "index",targetId,sourceKey,pointer,code from results where code is not null
      order by "index",sourceKey,pointer limit ${CONFIGURATION_SYNC_NAMED_SNAPSHOT_LIMIT}`,
  };
}

function graphIssues(
  input: ConfigurationSyncReferenceInspection,
  phase: ReferencePhase,
  witness: boolean,
): WritePlanSql | undefined {
  const checks = input.checks.flatMap((check, index) =>
    check.state === phase
      ? [[index, check.entryId, graphTargets(check.references, phase)] as const]
      : [],
  );
  if (!checks.some((row) => row[2].length)) return undefined;
  const payload = boundRows(checks);
  const graph = referenceGraphProofSql(
    phase,
    {
      subject: "candidate.entry_id",
      overlay: `select o.entry_id,o.targets from candidates o${input.sequence ? " where o.ordinal<=candidate.ordinal" : ""}`,
    },
    witness,
    true,
  );
  return {
    params: payload.params,
    sql: `with candidates(ordinal,entry_id,targets) as materialized (
        select value ->> 0,value ->> 1,value -> 2 from (${payload.sql})
      ), proofs as materialized (
        select ordinal, (${graph}) as proof from candidates candidate where json_array_length(targets)>0
      )
      select ordinal as "index",
        case when proof ->> 1=1 then coalesce(json_extract(json_extract(proof,'$[3]'),'$[1]'),proof ->> 2)
          else proof ->> 2 end as targetId,
        case when proof ->> 1=1 then 'reference_cycle' else 'reference_graph_limit' end as code
      from proofs where proof ->> 0=1 or proof ->> 1=1 order by ordinal limit ${CONFIGURATION_SYNC_NAMED_SNAPSHOT_LIMIT}`,
  };
}

function checks(input: ConfigurationSyncReferenceInspection, witness: boolean): WritePlanSql[] {
  return [
    targetIssues(input),
    graphIssues(input, "draft", witness),
    graphIssues(input, "published", witness),
  ].filter((query): query is WritePlanSql => query !== undefined);
}

/** The same predicates protect both check mode and the atomic apply. */
export function syncReferenceGuards(
  input: ConfigurationSyncReferenceInspection,
): readonly WritePlanSql[] {
  return checks(input, false).map(({ sql, params }) => ({ sql: `not exists(${sql})`, params }));
}

export async function inspectSyncReferences(
  read: (
    sql: string,
    ...params: readonly unknown[]
  ) => Promise<readonly ConfigurationSyncReferenceIssue[]>,
  input: ConfigurationSyncReferenceInspection,
): Promise<readonly ConfigurationSyncReferenceIssue[]> {
  const result: ConfigurationSyncReferenceIssue[] = [];
  for (const query of checks(input, true)) result.push(...(await read(query.sql, ...query.params)));
  return result.slice(0, CONFIGURATION_SYNC_NAMED_SNAPSHOT_LIMIT);
}
