import type { PreviewClaim, PreviewObject } from "@lacecms/application";
import { PREVIEW_EXECUTION_MS, PREVIEW_READY_MS, previewFailureReasons } from "@lacecms/domain";
import type { PreviewFailureReason } from "@lacecms/domain";
import type { WritePlanGuard } from "../write-plan/plan.js";
import { activeMediaSet, previewMutation, releasePreviewSlot } from "./capture.js";
import {
  claimParams,
  GENERATION_COLUMNS,
  LIVE_PREVIEW_EXECUTION_SQL,
  PREVIEW_CLAIM_MATCH_SQL,
  PREVIEW_CREDENTIAL_JOIN,
  PREVIEW_CURRENT_JOIN,
} from "./rows.js";

export const EXECUTION_ROW = "execution";

export const RUNNING_PREVIEW_SQL = `select ${GENERATION_COLUMNS},g.input_sha256,g.input_bytes
 from ${PREVIEW_CREDENTIAL_JOIN} join preview_execution_slot slot on slot.generation_id = g.id
 where ${PREVIEW_CLAIM_MATCH_SQL} and ${LIVE_PREVIEW_EXECUTION_SQL}`;

export function claimPreviewPlan(input: PreviewClaim) {
  const { id, now, executor, commit, run, credentialHash } = input;
  return previewMutation(
    {
      sql: `exists(select 1 from ${PREVIEW_CURRENT_JOIN}
      join preview_execution_slot slot on slot.generation_id = g.id
      where g.id = ? and g.state = 'dispatched' and g.executor = ? and g.source_commit = ?
      and (g.run_id is null or g.run_id = ?)
      and g.overall_deadline > ? and g.input_sha256 is not null)
      and not exists(select 1 from preview_runner_credentials where token_hash = ?)`,
      params: [id, executor, commit, run, now, credentialHash],
    },
    (g) => [
      {
        sql: `update preview_generations set state = 'running', started_at = ?,
        execution_deadline = min(overall_deadline, ?), run_id = ? where id = ? and ${g.sql}`,
        params: [now, now + PREVIEW_EXECUTION_MS, run, id, ...g.params],
        expectedChanges: 1,
      },
      {
        sql: `insert into preview_runner_credentials (generation_id,token_hash,expires_at)
        select id,?,execution_deadline from preview_generations where id = ? and ${g.sql}`,
        params: [credentialHash, id, ...g.params],
        expectedChanges: 1,
      },
      {
        slot: EXECUTION_ROW,
        sql: RUNNING_PREVIEW_SQL,
        params: [...claimParams(input), now, now, now],
      },
    ],
  );
}

/** Bind the dispatch response before the provider is allowed to claim. */
export function bindPreviewRunPlan(id: string, run: string) {
  return previewMutation(
    {
      sql: `exists(select 1 from preview_generations g
        join preview_execution_slot slot on slot.generation_id = g.id
        where g.id = ? and g.state = 'dispatched' and g.run_id is null)`,
      params: [id],
    },
    (g) => [
      {
        sql: `update preview_generations set run_id = ? where id = ? and ${g.sql}`,
        params: [run, id, ...g.params],
        expectedChanges: 1,
      },
    ],
  );
}

export function revokePreviewCredential(id: string, now: number, guard: WritePlanGuard) {
  return {
    sql: `update preview_runner_credentials set revoked_at = ?
      where generation_id = ? and revoked_at is null and ${guard.sql}`,
    params: [now, id, ...guard.params],
  };
}

export function finalizedPreviewRead(input: PreviewClaim & { readonly output: PreviewObject }) {
  return {
    sql: `select 1 from ${PREVIEW_CREDENTIAL_JOIN} where ${PREVIEW_CLAIM_MATCH_SQL}
      and g.state = 'ready' and g.expires_at > ?
      and g.output_sha256 = ? and g.output_bytes = ?`,
    params: [...claimParams(input), input.now, input.output.sha256, input.output.bytes],
  };
}

export function finalizePreviewPlan(
  input: PreviewClaim & { readonly output: PreviewObject },
  media: string,
) {
  const { id, now, output } = input;
  const active = activeMediaSet(media);
  return previewMutation(
    {
      sql: `exists (${RUNNING_PREVIEW_SQL}) and ${active.sql}
      and not exists(select 1 from preview_media_dependencies d
        left join media m on m.id = d.media_id and m.status = 'active'
        where d.generation_id = ? and d.target = 1 and m.id is null)`,
      params: [...claimParams(input), now, now, now, ...active.params, id],
    },
    (g) => [
      {
        sql: `delete from preview_media_dependencies where generation_id = ? and target = 0 and ${g.sql}`,
        params: [id, ...g.params],
      },
      {
        sql: `insert or ignore into preview_media_dependencies (generation_id,media_id,target)
        select ?,j.value,0 from json_each(?) j where ${g.sql}`,
        params: [id, media, ...g.params],
      },
      {
        sql: `update preview_generations set state = 'ready', ready_at = ?, expires_at = ?,
        output_sha256 = ?, output_bytes = ? where id = ? and ${g.sql}`,
        params: [now, now + PREVIEW_READY_MS, output.sha256, output.bytes, id, ...g.params],
        expectedChanges: 1,
      },
      revokePreviewCredential(id, now, g),
      releasePreviewSlot(id, g),
    ],
  );
}

const expiredReady = "state = 'ready' and expires_at <= ?";
const expiredWork =
  "(state in ('preparing','dispatched','running') and (overall_deadline <= ? or execution_deadline <= ?))";

export function settlePreviewDeadlinePlan(id: string, now: number) {
  return previewMutation(
    {
      sql: `exists(select 1 from preview_generations where id = ? and ((${expiredReady}) or ${expiredWork}))`,
      params: [id, now, now, now],
    },
    (g) => [
      // A preparing job has not received an execution grant yet.
      releasePreviewSlot(id, {
        sql: `${g.sql} and exists(select 1 from preview_generations where id = ? and state = 'preparing')`,
        params: [...g.params, id],
      }),
      {
        sql: `update preview_generations
          set state = case when state = 'ready' then 'expired' else 'timed_out' end,
              reason = case when state = 'ready' then null else 'PREVIEW_TIMED_OUT' end, ended_at = ?
          where id = ? and ${g.sql}`,
        params: [now, id, ...g.params],
        expectedChanges: 1,
      },
      revokePreviewCredential(id, now, g),
    ],
  );
}

export function failPreviewExecutionPlan(
  id: string,
  reason: PreviewFailureReason,
  now: number,
  claim?: PreviewClaim,
) {
  return previewMutation(
    claim === undefined
      ? {
          sql: `exists(select 1 from ${PREVIEW_CURRENT_JOIN}
        where g.id = ? and g.state = 'dispatched' and g.overall_deadline > ?)`,
          params: [id, now],
        }
      : {
          sql: `exists (${RUNNING_PREVIEW_SQL})`,
          params: [...claimParams(claim), now, now, now],
        },
    (g) => [
      {
        sql: `update preview_generations set state = 'failed', reason = ?, ended_at = ?
          where id = ? and ${g.sql}`,
        params: [reason, now, id, ...g.params],
        expectedChanges: 1,
      },
      revokePreviewCredential(id, now, g),
    ],
  );
}

export function failPreviewRunPlan(
  id: string,
  run: string,
  reason: PreviewFailureReason,
  now: number,
) {
  return previewMutation(
    {
      sql: `exists(select 1 from ${PREVIEW_CURRENT_JOIN}
        join preview_execution_slot s on s.generation_id = g.id
        where g.id = ? and g.run_id = ? and g.state in ('dispatched','running')
          and g.overall_deadline > ? and (g.execution_deadline is null or g.execution_deadline > ?))`,
      params: [id, run, now, now],
    },
    (g) => [
      {
        sql: `update preview_generations set state = ?, reason = ?, ended_at = ?
          where id = ? and ${g.sql}`,
        params: [
          reason === "PREVIEW_TIMED_OUT" ? "timed_out" : "failed",
          reason,
          now,
          id,
          ...g.params,
        ],
        expectedChanges: 1,
      },
      revokePreviewCredential(id, now, g),
    ],
  );
}

export function validPreviewClaim(input: PreviewClaim): boolean {
  return (
    /^[0-9a-f]{64}(?![\s\S])/u.test(input.credentialHash) &&
    /^[A-Za-z0-9_-]{1,128}(?![\s\S])/u.test(input.run)
  );
}

export function isPreviewFailureReason(reason: PreviewFailureReason): boolean {
  return previewFailureReasons.includes(reason);
}
