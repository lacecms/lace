import {
  configurationSyncAdvancesPublicState,
  configurationSyncContentWrites,
} from "@lacecms/application";
import type {
  ApplyConfigurationSynchronizationInput,
  ApplyConfigurationSynchronizationResult,
  ConfigurationSyncPlan,
  ConfigurationSyncSnapshotRewrite,
} from "@lacecms/application";
import { COMMIT_SYNC_LINK_GRAPH_SQL, syncInternalLinkStatements } from "../links/statements.js";
import type { LinkSqlStatement } from "../links/statements.js";
import {
  buildEnqueueStatements,
  publicStateIncrementStatement,
} from "../write-plan/build-enqueue.js";
import { failure } from "../shared/failures.js";
import type {
  WritePlan,
  WritePlanGuard,
  WritePlanResult,
  WritePlanSql,
  WritePlanStatement,
} from "../write-plan/plan.js";
import { configurationSyncSnapshotRewriteStatements } from "./field-rewrite.js";
import { STORED_MODEL_STATE_JSON_SQL } from "./model-state.js";
import { configurationSyncModelStatements, storedModelKey } from "./model-writes.js";
import { recursiveEvolution } from "./recursive-scans.js";
import { configurationSyncWriteStatements } from "./writes.js";

interface SyncWritePlanOptions {
  readonly storedStateJson?: string;
  readonly linkDirtyToken: string;
  readonly nextEventId: () => string;
  readonly rewrites?: ReadonlyMap<string, readonly ConfigurationSyncSnapshotRewrite[]>;
}

/** Compile the final writes in the canonical report's order. */
export function configurationSyncWritePlan(
  input: ApplyConfigurationSynchronizationInput,
  report: ConfigurationSyncPlan,
  options: SyncWritePlanOptions,
): WritePlan<"guard-miss"> & { readonly linkChecks: readonly LinkSqlStatement[] } {
  const { storedStateJson, linkDirtyToken, rewrites } = options;
  const expected = new Map(input.expectedStoredModels.map((model) => [model.key, model]));
  const models = new Map(input.models.map((model) => [model.key, model]));
  const singletons = new Map(input.singletonEntries.map((item) => [item.modelKey, item]));
  const links = syncInternalLinkStatements(
    report.requiresApply ? (input.linkRewrites ?? []) : [],
    linkDirtyToken,
  );
  const predicates = [
    ...(storedStateJson === undefined
      ? []
      : [{ sql: `${STORED_MODEL_STATE_JSON_SQL} = ?`, params: [storedStateJson] }]),
    ...links.valid,
  ];
  return {
    admission: {
      sql: predicates.map((predicate) => `(${predicate.sql})`).join(" and ") || "1",
      params: predicates.flatMap((predicate) => predicate.params),
    },
    diagnostics: {},
    diagnose: () => "guard-miss",
    linkChecks: links.valid,
    statements: (guard) => {
      const writes: WritePlanStatement[] = [];
      for (const operation of report.operations) {
        const key = operation.model.key;
        const model = models.get(key);
        writes.push(
          ...configurationSyncModelStatements(
            operation,
            input.appliedAt,
            guard,
            model,
            expected.get(storedModelKey(operation)),
            singletons.get(key),
          ),
        );
        if (recursiveEvolution(operation) !== undefined) {
          const replacements = rewrites?.get(key);
          if (replacements === undefined) failure("Synchronization snapshot rewrites are missing.");
          for (const [index, statement] of configurationSyncSnapshotRewriteStatements(
            replacements,
            key,
          ).entries())
            writes.push({
              ...guarded(statement, guard),
              checkpoint: `sync.model.rewrite-fields.${index}`,
            });
        }
        if (model !== undefined) {
          for (const write of configurationSyncContentWrites(operation, model)) {
            const statements = configurationSyncWriteStatements(write, key);
            writes.push(
              ...statements.map((statement, index) => ({
                ...guarded(statement, guard),
                ...(index === 0 ? { checkpoint: `sync.model.${write.action}` } : {}),
              })),
            );
          }
        }
      }
      for (const statement of links.writes) writes.push(guarded(statement, guard));
      if (links.writes.length > 0) {
        writes.push(
          guarded({ sql: COMMIT_SYNC_LINK_GRAPH_SQL, params: [linkDirtyToken] }, guard),
          guarded(
            { sql: "delete from mutation_guards where token = ?", params: [linkDirtyToken] },
            guard,
          ),
        );
      }
      if (configurationSyncAdvancesPublicState(report)) {
        writes.push(
          publicStateIncrementStatement(guard, input.appliedAt),
          ...buildEnqueueStatements(
            guard,
            {
              eventId: options.nextEventId(),
              reason: "configuration_sync",
              requestedAt: input.appliedAt,
              requestedBy: "system:content-sync",
              snapshotId: null,
            },
            true,
          ),
        );
      }
      return writes;
    },
  };
}

/** Sync rewrite fragments end in a WHERE clause. */
function guarded(statement: WritePlanSql, guard: WritePlanGuard): WritePlanStatement {
  return {
    sql: `${statement.sql} and ${guard.sql}`,
    params: [...statement.params, ...guard.params],
  };
}

/** Decode the version read in the same atomic unit as the queued build. */
export function configurationSyncApplyResult(
  report: ConfigurationSyncPlan,
  receipt?: Extract<WritePlanResult<never>, { kind: "committed" }>,
): ApplyConfigurationSynchronizationResult {
  if (!report.requiresApply)
    return Object.freeze({ operations: report.operations, status: "noop" });
  if (!configurationSyncAdvancesPublicState(report))
    return Object.freeze({ operations: report.operations, status: "applied" });
  const row = receipt?.slots.queue?.[0] as
    | { readonly pending_id: string | null; readonly version: number }
    | undefined;
  if (row?.pending_id == null) failure("Build request could not be queued.");
  return Object.freeze({
    operations: report.operations,
    status: "applied",
    targetVersion: row.version,
  });
}
