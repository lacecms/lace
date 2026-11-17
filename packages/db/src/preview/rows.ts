import type {
  PreviewCaptureFence,
  PreviewGeneration,
  PreviewRequest,
  PreviewAdmission,
} from "@lacecms/application";
import {
  contentEntryId,
  contentModelKey,
  PREVIEW_MAX_MODELS,
  unixMilliseconds,
} from "@lacecms/domain";
import type { PreviewFailureReason, PreviewState } from "@lacecms/domain";

export const PREVIEW_VERSION_SQL =
  "coalesce((select version from published_state where singleton_key = 1), 0)";
export const PREVIEW_EPOCH_SQL =
  "(select epoch from preview_capture_state where singleton_key = 1)";
export const PREVIEW_CONFIGURATION_SQL = `(select json_group_array(json_array(key, kind, config_version, structure_hash, projection_hash, public_projection_hash))
 from (select * from content_models order by key limit ${PREVIEW_MAX_MODELS + 1}))`;
export const PREVIEW_FENCE_SQL = `select ${PREVIEW_CONFIGURATION_SQL} as configuration,
 ${PREVIEW_VERSION_SQL} as publicVersion, ${PREVIEW_EPOCH_SQL} as captureEpoch`;

export interface PreviewGenerationRow {
  readonly id: string;
  readonly entry_id: string;
  readonly model_key: string;
  readonly revision: number;
  readonly idempotency_key: string;
  readonly path: string;
  readonly state: PreviewState;
  readonly configuration: string;
  readonly public_version: number;
  readonly capture_epoch: number;
  readonly executor: string;
  readonly source_commit: string;
  readonly created_at: number;
  readonly overall_deadline: number;
  readonly execution_deadline: number | null;
  readonly ready_at: number | null;
  readonly expires_at: number | null;
  readonly reason: PreviewFailureReason | null;
}

export const GENERATION_COLUMNS = `g.id,g.entry_id,g.model_key,g.revision,g.idempotency_key,g.path,g.state,
g.configuration,g.public_version,g.capture_epoch,g.executor,g.source_commit,g.created_at,g.overall_deadline,
g.execution_deadline,g.ready_at,g.expires_at,g.reason`;
export const PREVIEW_REPLAY_SQL = `select ${GENERATION_COLUMNS}
 from preview_generations g where g.created_by = ? and g.idempotency_key = ?`;

export function generation(row: PreviewGenerationRow): PreviewGeneration {
  return {
    id: row.id,
    entryId: contentEntryId(row.entry_id),
    modelKey: contentModelKey(row.model_key),
    revision: row.revision,
    path: row.path,
    state: row.state,
    configuration: row.configuration,
    publicVersion: row.public_version,
    captureEpoch: row.capture_epoch,
    source: { executor: row.executor, commit: row.source_commit },
    createdAt: unixMilliseconds(row.created_at),
    overallDeadline: unixMilliseconds(row.overall_deadline),
    ...(row.ready_at === null ? {} : { readyAt: unixMilliseconds(row.ready_at) }),
    ...(row.expires_at === null ? {} : { expiresAt: unixMilliseconds(row.expires_at) }),
    ...(row.reason === null ? {} : { reason: row.reason }),
  };
}

export function replay(
  row: PreviewGenerationRow,
  input: PreviewRequest,
): Exclude<PreviewAdmission, { kind: "admitted" }> {
  return row.entry_id === input.entryId && row.revision === input.expectedRevision
    ? { kind: "replayed", generation: generation(row) }
    : { kind: "rejected", reason: "PREVIEW_IDEMPOTENCY_CONFLICT" };
}

export function fenceParams(value: PreviewCaptureFence) {
  return [value.configuration, value.publicVersion, value.captureEpoch] as const;
}

export const PREVIEW_FENCE_CONDITION = `${PREVIEW_CONFIGURATION_SQL} = ? and ${PREVIEW_VERSION_SQL} = ? and ${PREVIEW_EPOCH_SQL} = ?`;

export const PREVIEW_CURRENT_JOIN = `preview_current c join preview_generations g
 on g.id = c.generation_id and g.entry_id = c.entry_id`;

export const LIVE_PREVIEW_EXECUTION_SQL =
  "g.state = 'running' and g.overall_deadline > ? and g.execution_deadline > ? and r.expires_at > ? and r.revoked_at is null";

export const PREVIEW_CLAIM_MATCH_SQL =
  "g.id = ? and g.executor = ? and g.source_commit = ? and g.run_id = ? and r.token_hash = ?";

export function claimParams(input: import("@lacecms/application").PreviewClaim) {
  return [input.id, input.executor, input.commit, input.run, input.credentialHash] as const;
}

export const PREVIEW_CREDENTIAL_JOIN = `${PREVIEW_CURRENT_JOIN}
 join preview_runner_credentials r on r.generation_id = g.id`;

export interface PreviewExecutionRow extends PreviewGenerationRow {
  readonly input_sha256: string;
  readonly input_bytes: number;
}
