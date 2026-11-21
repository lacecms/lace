import type { PreviewCleanupItem } from "@lacecms/application";
import { PREVIEW_OVERALL_MS, PREVIEW_READY_MS } from "@lacecms/domain";
import { previewMutation, releasePreviewSlot } from "./capture.js";
import { revokePreviewCredential } from "./execution.js";
import { GENERATION_COLUMNS } from "./rows.js";

const terminal = "('failed','timed_out','invalidated','expired')";

export function previewMaintenanceLimit(limit: number): number {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20)
    throw new RangeError("Preview maintenance limit must be between 1 and 20.");
  return limit;
}

export function duePreviewDeadlinesSql(now: number, limit: number) {
  const branches = [
    ["preparing", "overall_deadline"],
    ["dispatched", "overall_deadline"],
    ["running", "execution_deadline"],
    ["ready", "expires_at"],
  ];
  return {
    sql: `${branches
      .map(
        ([state, deadline]) => `select id,deadline from (
      select id,${deadline} as deadline from preview_generations
      where state = '${state}' and ${deadline} <= ? order by ${deadline},id limit ?
    )`,
      )
      .join(" union all ")} order by deadline,id limit ?`,
    params: [...branches.flatMap(() => [now, limit]), limit],
  };
}

export const PREVIEW_STOP_SQL = `select ${GENERATION_COLUMNS},g.run_id from preview_execution_slot s
 join preview_generations g on g.id = s.generation_id
 where s.singleton_key = 1 and g.state in ${terminal}`;

export function confirmPreviewExecutorStoppedPlan(id: string, now: number) {
  return previewMutation(
    {
      sql: `exists(select 1 from preview_execution_slot s join preview_generations g on g.id = s.generation_id
      where s.singleton_key = 1 and g.id = ? and g.state in ${terminal})`,
      params: [id],
    },
    (g) => [revokePreviewCredential(id, now, g), releasePreviewSlot(id, g)],
  );
}

export function previewCleanupSql(now: number, limit: number) {
  const expiredAdmission = now - PREVIEW_OVERALL_MS;
  const branches = ["failed", "timed_out", "invalidated", "expired"].map(
    (state) => `
    select id,created_at,'all' as scope from (
      select g.id,g.created_at from preview_generations g
      where g.state = '${state}' and g.output_purged_at is null and g.created_at <= ?
        and not exists(select 1 from preview_execution_slot s where s.generation_id = g.id)
      order by g.created_at,g.id limit ?
    )`,
  );
  return {
    sql: `select id,created_at,'input' as scope from (
        select g.id,g.created_at from preview_generations g
        where g.state = 'ready' and g.input_purged_at is null and g.expires_at > ?
        order by g.created_at,g.id limit ?
      ) union all ${branches.join(" union all ")}
      order by created_at,id limit ?`,
    params: [now, limit, ...branches.flatMap(() => [expiredAdmission, limit]), limit],
  };
}

export function recordPreviewPurgedPlan({ id, scope }: PreviewCleanupItem, now: number) {
  const all = scope === "all";
  return previewMutation(
    {
      sql: all
        ? `exists(select 1 from preview_generations where id = ? and state in ${terminal}
          and output_purged_at is null and overall_deadline <= ?)
          and not exists(select 1 from preview_execution_slot where generation_id = ?)`
        : "exists(select 1 from preview_generations where id = ? and state = 'ready' and input_purged_at is null)",
      params: all ? [id, now, id] : [id],
    },
    (g) => [
      {
        sql: `delete from preview_targets where generation_id = ? and ${g.sql}`,
        params: [id, ...g.params],
      },
      ...(all
        ? [
            {
              sql: `delete from preview_media_dependencies where generation_id = ? and ${g.sql}`,
              params: [id, ...g.params],
            },
          ]
        : []),
      {
        checkpoint: "preview.cleanup",
        sql: `update preview_generations set input_purged_at = ?, input_sha256 = null, input_bytes = null
        ${all ? ", output_purged_at = ?, output_sha256 = null, output_bytes = null" : ""}
        where id = ? and ${g.sql}`,
        params: [...(all ? [now, now] : [now]), id, ...g.params],
        expectedChanges: 1,
      },
    ],
  );
}

export const PREVIEW_PURGED_COUNT = "preview-purged-count";
export function purgePreviewHistoryPlan(now: number, limit: number) {
  // Retain replay and callback identity after physical cleanup; deleting rows never frees a slot.
  return previewMutation({ sql: "1", params: [] }, (g) => [
    {
      sql: `delete from preview_generations where id in (
        select id from preview_generations where ended_at <= ? and output_purged_at is not null
        order by ended_at,id limit ?
      ) and ${g.sql}`,
      params: [now - PREVIEW_READY_MS, limit, ...g.params],
    },
    // D1 metadata can count cascaded child deletes. Report generation rows only.
    { sql: "select changes() as count", params: [], slot: PREVIEW_PURGED_COUNT },
  ]);
}
