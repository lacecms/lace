import { invalidatePreviews } from "../write-plan/preview-invalidation.js";
import { configurationSyncBaseline } from "@lacecms/application";
import type {
  ApplyConfigurationSynchronizationInput,
  ConfigurationSyncOperation,
  ConfigurationSyncSingletonEntry,
  StoredContentModelState,
} from "@lacecms/application";
import { isSingletonKind } from "@lacecms/domain";
import { draftInserts } from "../content/draft-insert.js";
import { assertDraftPersistenceBounds } from "../content/snapshots.js";
import { failure } from "../shared/failures.js";
import type { WritePlanGuard, WritePlanStatement } from "../write-plan/plan.js";

export function storedModelKey(
  operation: ConfigurationSyncOperation,
): ConfigurationSyncOperation["model"]["key"] {
  return operation.action === "rename" ? operation.renamedFrom : operation.model.key;
}

const IDENTITY_SQL =
  "key = ? and kind = ? and config_version = ? and structure_hash = ? and projection_hash = ?";

/** A fresh report admits exactly one write per distinct stored or new model identity. */
export function configurationSyncModelStatements(
  operation: ConfigurationSyncOperation,
  appliedAt: number,
  guard: WritePlanGuard,
  configuration: ApplyConfigurationSynchronizationInput["models"][number] | undefined,
  expected: StoredContentModelState | undefined,
  singleton: ConfigurationSyncSingletonEntry | undefined,
): WritePlanStatement[] {
  const { action, model } = operation;
  const checkpoint = `sync.model.${action}`;
  if (action === "blocked-removal" || action === "incompatible-change")
    failure("Configuration synchronization plan contains an unsafe operation.");

  if (action === "remove") {
    if (expected === undefined) failure("Synchronization removal guard is missing.");
    return [
      {
        checkpoint,
        sql: `delete from content_models where ${IDENTITY_SQL} and ${guard.sql}`,
        params: [...identityParams(expected), ...guard.params],
      },
      invalidatePreviews("model", model.key, appliedAt, {
        sql: `${guard.sql} and not exists(select 1 from content_models where key = ?)`,
        params: [...guard.params, model.key],
      }),
    ];
  }

  if (configuration === undefined) failure("Synchronization model is unavailable.");
  const baseline = configurationSyncBaseline(configuration);
  const modelParams = [
    model.key,
    model.kind,
    configuration.label ?? configuration.key,
    model.version,
    model.structureHash,
    model.projectionHash,
    configuration.publicProjectionHash ?? null,
    model.projectionHash,
    baseline.json,
    baseline.hash,
    appliedAt,
  ];
  if (action === "create") {
    const insert = {
      checkpoint,
      sql: `insert into content_models (key, kind, label, config_version, structure_hash, projection_hash, public_projection_hash, public_projection_source_hash, structure_json, structure_json_hash, updated_at, created_at)
        select ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? where ${guard.sql}`,
      params: [...modelParams, appliedAt, ...guard.params],
    };
    return isSingletonKind(model.kind)
      ? [insert, ...singletonStatements(model, singleton, guard)]
      : [insert];
  }
  if (expected === undefined) failure("Synchronization update guard is missing.");
  return [
    {
      checkpoint,
      sql: `update content_models set key = ?, kind = ?, label = ?, config_version = ?, structure_hash = ?, projection_hash = ?, public_projection_hash = ?, public_projection_source_hash = ?, structure_json = ?, structure_json_hash = ?, updated_at = ?
      where ${IDENTITY_SQL} and ${guard.sql}`,
      params: [...modelParams, ...identityParams(expected), ...guard.params],
    },
  ];
}

function identityParams(model: StoredContentModelState): readonly (number | string)[] {
  return [model.key, model.kind, model.version, model.structureHash, model.projectionHash];
}

function singletonStatements(
  model: ConfigurationSyncOperation["model"],
  singleton: ConfigurationSyncSingletonEntry | undefined,
  guard: WritePlanGuard,
): WritePlanStatement[] {
  const entry = singleton?.entry;
  if (
    entry?.model.key !== model.key ||
    entry.model.kind !== model.kind ||
    entry.draft.entryId !== entry.id
  )
    failure("Singleton synchronization entry is missing or invalid.");
  assertDraftPersistenceBounds(entry.draft.blocks, []);
  // The model and entry are inserted above these dependent writes with the
  // same admission guard. Both inserts fail on a collision, preserving the batch budget.
  const inserts = draftInserts(entry, guard);
  return [
    { ...inserts.entry, checkpoint: "sync.page.entry" },
    { ...inserts.snapshot, checkpoint: "sync.page.snapshot" },
    ...inserts.blocks,
    inserts.pointer,
  ];
}
