import { configurationSyncSnapshotRewrites } from "@lacecms/application";
import type {
  ApplyConfigurationSynchronizationInput,
  ConfigurationSyncOperation,
  ConfigurationSyncPlan,
  ConfigurationSyncSnapshotRewrite,
} from "@lacecms/application";
import type { FieldVisibility } from "@lacecms/content";
import { failure } from "../shared/failures.js";
import { parseObject } from "../shared/values.js";
import type { SyncFieldRewriteRow } from "./field-rewrite.js";
import { storedModelKey } from "./model-writes.js";

export function recursiveEvolution(operation: ConfigurationSyncOperation) {
  if (
    (operation.action === "version-update" || operation.action === "rename") &&
    operation.evolution?.recursiveFields
  )
    return operation.evolution;
  return undefined;
}

/** Read before the model write, even when its key will cascade to a new key. */
export function configurationSyncRecursiveScans(
  models: ApplyConfigurationSynchronizationInput["models"],
  report: ConfigurationSyncPlan,
): readonly {
  readonly readKey: string;
  readonly writeKey: string;
  readonly rewritePage: (
    rows: readonly SyncFieldRewriteRow[],
  ) => readonly ConfigurationSyncSnapshotRewrite[];
}[] {
  const byKey = new Map(models.map((model) => [model.key, model]));
  return report.operations.flatMap((operation) => {
    const evolution = recursiveEvolution(operation);
    if (evolution === undefined) return [];
    const model = byKey.get(operation.model.key);
    if (model === undefined) failure("Synchronization model is unavailable.");
    return [
      {
        readKey: storedModelKey(operation),
        writeKey: operation.model.key,
        rewritePage: (rows: readonly SyncFieldRewriteRow[]) =>
          configurationSyncSnapshotRewrites(
            model.fields,
            evolution.changes,
            rows.map((row) => ({
              id: row.id,
              fields: parseObject(row.fields_json, "Snapshot fields"),
              state: row.state,
            })),
            model.visibility as FieldVisibility | undefined,
          ),
      },
    ];
  });
}
