import type { PreviewObject } from "@lacecms/application";
import type { MediaId, PreviewFailureReason } from "@lacecms/domain";
import type { WritePlan, WritePlanSql, WritePlanStatement } from "../write-plan/plan.js";
import { PREVIEW_CONFIGURATION_SQL, PREVIEW_EPOCH_SQL, PREVIEW_VERSION_SQL } from "./rows.js";

export const MAX_PREVIEW_MEDIA = 2000;

export function previewMutation(
  admission: WritePlanSql,
  statements: WritePlan<boolean>["statements"],
): WritePlan<boolean> {
  return { admission, diagnostics: {}, diagnose: () => false, statements };
}

const preparing: WritePlanSql["sql"] = `exists (
  select 1 from preview_generations g
  join preview_execution_slot slot on slot.generation_id = g.id
  join preview_current c on c.generation_id = g.id and c.entry_id = g.entry_id
  where g.id = ? and g.state = 'preparing' and g.overall_deadline > ?
  and g.public_version = ${PREVIEW_VERSION_SQL}
  and g.capture_epoch = ${PREVIEW_EPOCH_SQL}
  and g.configuration = ${PREVIEW_CONFIGURATION_SQL}
)`;

export function previewMediaSet(ids: readonly MediaId[]): string | null {
  const values = [...new Set(ids)];
  if (values.length > MAX_PREVIEW_MEDIA || values.some((id) => id.length > 255)) return null;
  return JSON.stringify(values);
}

export function activeMediaSet(json: string): WritePlanSql {
  return {
    sql: `not exists(select 1 from json_each(?) j
      where not exists(select 1 from media m where m.id = j.value and m.status = 'active'))`,
    params: [json],
  };
}

export function trackPreviewMediaPlan(id: string, media: string, now: number) {
  const active = activeMediaSet(media);
  return previewMutation(
    { sql: `${preparing} and ${active.sql}`, params: [id, now, ...active.params] },
    (g) => [
      {
        sql: `insert or ignore into preview_media_dependencies (generation_id,media_id,target)
        select ?,j.value,0 from json_each(?) j where ${g.sql}`,
        params: [id, media, ...g.params],
      },
    ],
  );
}

export function previewStoredObject(object: PreviewObject): boolean {
  return (
    /^[0-9a-f]{64}(?![\s\S])/u.test(object.sha256) &&
    Number.isSafeInteger(object.bytes) &&
    object.bytes > 0 &&
    object.bytes <= 1024 * 1024
  );
}

export function sealPreviewInputPlan(id: string, manifest: PreviewObject, now: number) {
  return previewMutation(
    {
      sql: `${preparing} and not exists(select 1 from preview_media_dependencies d
        left join media m on m.id = d.media_id and m.status = 'active'
        where d.generation_id = ? and m.id is null)`,
      params: [id, now, id],
    },
    (g) => [
      {
        sql: `update preview_generations set state = 'dispatched', input_sha256 = ?, input_bytes = ?
        where id = ? and ${g.sql}`,
        params: [manifest.sha256, manifest.bytes, id, ...g.params],
        expectedChanges: 1,
      },
    ],
  );
}

export function releasePreviewSlot(id: string, guard: WritePlanSql): WritePlanStatement {
  return {
    sql: `delete from preview_execution_slot where generation_id = ? and ${guard.sql}`,
    params: [id, ...guard.params],
  };
}

export function failPreviewPreparationPlan(id: string, reason: PreviewFailureReason, now: number) {
  return previewMutation(
    {
      sql: "exists(select 1 from preview_generations where id = ? and state = 'preparing')",
      params: [id],
    },
    (g) => [
      {
        sql: `update preview_generations
        set state = case when overall_deadline <= ? then 'timed_out' else 'failed' end,
            reason = case when overall_deadline <= ? then 'PREVIEW_TIMED_OUT' else ? end, ended_at = ?
        where id = ? and ${g.sql}`,
        params: [now, now, reason, now, id, ...g.params],
        expectedChanges: 1,
      },
      releasePreviewSlot(id, g),
    ],
  );
}
