import type {
  ConfigurationSyncScanRequest,
  StoredContentModelState,
  ConfigurationSyncPlanInput,
  ConfigurationSyncModel,
  ConfigurationSyncEvolution,
  ConfigurationSyncContentWrite,
  ConfigurationSyncOperation,
  ConfigurationSyncPlan,
  ConfigurationSyncCheckResult,
} from "./types.js";
import type { NormalizedContentModel } from "@lacecms/config";
import { canonicalizeJson, schemaFieldAt, parseSchemaPath } from "@lacecms/content";
import type { JsonObject, JsonValue } from "@lacecms/content";
import { DomainError } from "@lacecms/domain";
import { diffContentModelStructures } from "./structure-diff.js";
import { validateStructureHints } from "./structure-hints.js";

import { copyModel, copyStoredModel } from "./model-state.js";
import { diagnostic, compareByKey, compareDiagnostics } from "./diagnostics.js";
import { hasSnapshots, snapshotDescription } from "./snapshot-counts.js";
import { incompatible } from "./plan-results.js";
import { decideEvolution } from "./decisions.js";
import type { PlanningContext } from "./decisions.js";
function trustedPublicBaseline(stored: StoredContentModelState): boolean {
  return (
    /^[a-f0-9]{64}$/u.test(stored.publicProjectionHash ?? "") &&
    /^[a-f0-9]{64}$/u.test(stored.publicProjectionSourceHash ?? "") &&
    stored.publicProjectionSourceHash === stored.projectionHash
  );
}

function publicProjectionChanged(
  current: NormalizedContentModel,
  stored: StoredContentModelState,
): boolean {
  if (trustedPublicBaseline(stored))
    return current.publicProjectionHash !== stored.publicProjectionHash;
  // Without a trusted public identity, any full projection change may be public.
  return stored.projectionHash !== current.projectionHash;
}

function classifyMatchedModel(
  current: NormalizedContentModel,
  stored: StoredContentModelState,
  context: PlanningContext,
): ConfigurationSyncOperation | undefined {
  const { diagnostics } = context;
  const model = copyModel(current);
  if (model.kind !== stored.kind) {
    diagnostics.push(
      diagnostic(
        "MODEL_KIND_CHANGED",
        model.key,
        `Model ${model.key} changes kind from ${stored.kind} to ${model.kind}.`,
      ),
    );
    return incompatible(model, stored);
  }
  if (model.version < stored.version) {
    diagnostics.push(
      diagnostic(
        "VERSION_REGRESSION",
        model.key,
        `Model ${model.key} regresses version from ${stored.version} to ${model.version}.`,
      ),
    );
    return incompatible(model, stored);
  }

  const hasBaseline = stored.structure !== undefined;
  const structureChanged = model.structureHash !== stored.structureHash;
  if (structureChanged && model.version === stored.version) {
    diagnostics.push(
      diagnostic(
        "STRUCTURE_CHANGE_NEEDS_VERSION_BUMP",
        model.key,
        `Model ${model.key} changes structure without increasing version ${model.version}.`,
      ),
    );
    return incompatible(model, stored);
  }

  let evolution: ConfigurationSyncEvolution | undefined;
  if (structureChanged && hasBaseline && current.structure !== undefined) {
    const hints = {
      ...(current.removedBlocks === undefined ? {} : { removedBlocks: current.removedBlocks }),
      ...(current.removedFields === undefined ? {} : { removedFields: current.removedFields }),
      ...(current.renamedFields === undefined ? {} : { renamedFields: current.renamedFields }),
      ...(current.kind !== "global" && current.removedSeo === true ? { removedSeo: true } : {}),
    };
    const issues = validateStructureHints(stored.structure!, hints);
    for (const issue of issues) {
      diagnostics.push(
        issue.kind === "target-exists"
          ? diagnostic(
              "FIELD_RENAME_TARGET_EXISTS",
              model.key,
              `Model ${model.key} renames field ${issue.from} to ${issue.target}, but the stored structure already has both fields.`,
              { fieldKey: issue.target },
            )
          : diagnostic(
              "FIELD_RENAME_SOURCE_MISSING",
              model.key,
              `Model ${model.key} renames field ${issue.from} to ${issue.target}, but the stored structure has neither field.`,
              { fieldKey: issue.target },
            ),
      );
    }
    if (issues.length > 0) return incompatible(model, stored);
    const decided = decideEvolution(
      current,
      stored,
      diffContentModelStructures(stored.structure!, current.structure, hints),
      context,
    );
    if (decided.refused) return incompatible(model, stored, decided.evolution);
    evolution = decided.evolution;
  } else if (structureChanged && hasSnapshots(stored)) {
    if (current.structure === undefined) {
      diagnostics.push(
        diagnostic(
          "STRUCTURE_CHANGE_HAS_SNAPSHOTS",
          model.key,
          `Model ${model.key} changes structure while snapshots exist (${snapshotDescription(stored)}).`,
        ),
      );
    } else {
      diagnostics.push(
        diagnostic(
          "STRUCTURE_BASELINE_MISSING",
          model.key,
          `Model ${model.key} changes structure while snapshots exist (${snapshotDescription(stored)}) and no structure baseline is stored. Restore the previous definition, run content sync once to record a baseline, then apply the change.`,
        ),
      );
    }
    return incompatible(model, stored);
  }

  if (structureChanged || model.version > stored.version) {
    return Object.freeze({
      action: "version-update",
      ...(evolution === undefined ? {} : { evolution }),
      model,
    });
  }
  if (model.projectionHash !== stored.projectionHash) {
    return Object.freeze({
      action: "label-update",
      affectsPublicProjection: publicProjectionChanged(current, stored),
      model,
    });
  }
  if ((!hasBaseline || !trustedPublicBaseline(stored)) && current.structure !== undefined) {
    return Object.freeze({ action: "record-baseline", model });
  }
  return undefined;
}

function modelForStoredState(stored: StoredContentModelState): ConfigurationSyncModel {
  return Object.freeze({
    key: stored.key,
    kind: stored.kind,
    projectionHash: stored.projectionHash,
    structureHash: stored.structureHash,
    version: stored.version,
  });
}

function operationKey(operation: ConfigurationSyncOperation): string {
  return operation.model.key;
}

function planWithContext(
  input: ConfigurationSyncPlanInput,
  context: PlanningContext,
): ConfigurationSyncPlan {
  const { diagnostics } = context;
  const operations: ConfigurationSyncOperation[] = [];
  const currentModels = [...input.models].sort(compareByKey);
  const storedModels = [...input.storedModels].map(copyStoredModel).sort(compareByKey);
  const currentKeys = new Set<string>();
  const duplicateCurrentKeys = new Set<string>();
  const storedByKey = new Map<string, StoredContentModelState>();
  const duplicateStoredKeys = new Set<string>();

  for (const model of currentModels) {
    if (currentKeys.has(model.key)) {
      duplicateCurrentKeys.add(model.key);
      diagnostics.push(
        diagnostic("DUPLICATE_CURRENT_MODEL", model.key, `Model ${model.key} is configured twice.`),
      );
    }
    currentKeys.add(model.key);
  }
  for (const stored of storedModels) {
    if (storedByKey.has(stored.key)) {
      duplicateStoredKeys.add(stored.key);
      diagnostics.push(
        diagnostic(
          "DUPLICATE_STORED_MODEL",
          stored.key,
          `Stored model ${stored.key} appears twice.`,
        ),
      );
      continue;
    }
    storedByKey.set(stored.key, stored);
  }

  const consumedStoredKeys = new Set<string>();
  for (const current of currentModels) {
    if (duplicateCurrentKeys.has(current.key)) continue;
    const model = copyModel(current);
    const stored = storedByKey.get(model.key);
    if (stored !== undefined && !duplicateStoredKeys.has(model.key)) {
      consumedStoredKeys.add(stored.key);
      const operation = classifyMatchedModel(current, stored, context);
      if (operation !== undefined) operations.push(operation);
      continue;
    }

    if (current.renamedFrom === undefined) {
      operations.push(Object.freeze({ action: "create", model }));
      continue;
    }

    const former = storedByKey.get(current.renamedFrom);
    if (former === undefined || duplicateStoredKeys.has(current.renamedFrom)) {
      diagnostics.push(
        diagnostic(
          "RENAME_SOURCE_MISSING",
          model.key,
          `Model ${model.key} names missing former model ${current.renamedFrom}.`,
          current.renamedFrom,
        ),
      );
      continue;
    }
    consumedStoredKeys.add(former.key);
    if (currentKeys.has(former.key)) {
      diagnostics.push(
        diagnostic(
          "RENAME_SOURCE_STILL_CONFIGURED",
          model.key,
          `Model ${model.key} names still-configured model ${former.key} as renamedFrom.`,
          former.key,
        ),
      );
      operations.push(incompatible(model, former));
      continue;
    }
    if (model.kind !== former.kind) {
      diagnostics.push(
        diagnostic(
          "RENAME_KIND_CHANGED",
          model.key,
          `Model ${model.key} changes renamed model ${former.key} from ${former.kind} to ${model.kind}.`,
          former.key,
        ),
      );
      operations.push(incompatible(model, former));
      continue;
    }
    const transition = classifyMatchedModel(current, former, context);
    if (transition?.action === "incompatible-change") {
      operations.push(transition);
      continue;
    }
    const evolution = transition?.action === "version-update" ? transition.evolution : undefined;
    operations.push(
      Object.freeze({
        action: "rename",
        ...(evolution === undefined ? {} : { evolution }),
        model,
        renamedFrom: former.key,
      }),
    );
  }

  for (const stored of storedModels) {
    if (consumedStoredKeys.has(stored.key) || duplicateStoredKeys.has(stored.key)) continue;
    const model = modelForStoredState(stored);
    if (stored.entryCount === 0) {
      operations.push(Object.freeze({ action: "remove", model }));
      continue;
    }
    diagnostics.push(
      diagnostic(
        "REMOVAL_HAS_ENTRIES",
        stored.key,
        `Model ${stored.key} cannot be removed while it has ${stored.entryCount} entries.`,
      ),
    );
    operations.push(Object.freeze({ action: "blocked-removal", model, stored }));
  }

  operations.sort((left, right) => operationKey(left).localeCompare(operationKey(right)));
  diagnostics.sort(compareDiagnostics);
  const frozenOperations = Object.freeze(operations.map((operation) => Object.freeze(operation)));
  const frozenDiagnostics = Object.freeze(diagnostics.map((value) => Object.freeze(value)));
  const isValid = frozenDiagnostics.length === 0;
  return Object.freeze({
    diagnostics: frozenDiagnostics,
    isValid,
    operations: frozenOperations,
    requiresApply: isValid && frozenOperations.length > 0,
  });
}

/** Plans configuration identity reconciliation without reading or mutating a runtime adapter. */
export function planConfigurationSynchronization(
  input: ConfigurationSyncPlanInput,
): ConfigurationSyncPlan {
  return planWithContext(input, { diagnostics: [], evidence: input.evidence, scanRequests: [] });
}

/** Lists the populated models whose structural changes must be decided from stored snapshots. */
export function planConfigurationSyncScans(
  input: Omit<ConfigurationSyncPlanInput, "evidence">,
): readonly ConfigurationSyncScanRequest[] {
  const context: PlanningContext = { diagnostics: [], evidence: undefined, scanRequests: [] };
  planWithContext(input, context);
  return Object.freeze(
    [...context.scanRequests].sort((left, right) => left.modelKey.localeCompare(right.modelKey)),
  );
}

/** Field defaults an applied operation writes into snapshots lacking the field. */
export function configurationSyncBackfills(
  operation: ConfigurationSyncOperation,
  model: NormalizedContentModel,
): readonly { readonly fieldKey: string; readonly json: string }[] {
  if (operation.action !== "version-update" && operation.action !== "rename") return [];
  return (operation.evolution?.backfills ?? []).map((fieldKey) => {
    const definition = schemaFieldAt(model.fields, parseSchemaPath(fieldKey));
    if (definition?.defaultValue === undefined) {
      throw new DomainError(
        "CONTENT_INVALID_STATE",
        `Backfill field ${fieldKey} has no configured default.`,
      );
    }
    return Object.freeze({
      fieldKey,
      json: canonicalizeJson(definition.defaultValue as JsonValue),
    });
  });
}

/**
 * Ordered content writes of an applied operation: field renames, field
 * removals, block-type removals, SEO removal, then default backfills.
 */
export function configurationSyncContentWrites(
  operation: ConfigurationSyncOperation,
  model: NormalizedContentModel,
): readonly ConfigurationSyncContentWrite[] {
  if (operation.action !== "version-update" && operation.action !== "rename") return [];
  const evolution = operation.evolution;
  if (evolution === undefined) return [];
  return Object.freeze([
    ...(evolution.recursiveFields ? [] : (evolution.renames ?? [])).map((rename) =>
      Object.freeze({ action: "rename-field" as const, from: rename.from, to: rename.to }),
    ),
    ...(evolution.recursiveFields ? [] : (evolution.fieldRemovals ?? [])).map((fieldKey) =>
      Object.freeze({ action: "remove-field" as const, fieldKey }),
    ),
    ...(evolution.blockRemovals ?? []).map((blockType) =>
      Object.freeze({ action: "remove-block-type" as const, blockType }),
    ),
    ...(evolution.seoRemoval === true ? [Object.freeze({ action: "remove-seo" as const })] : []),
    ...(evolution.recursiveFields ? [] : configurationSyncBackfills(operation, model)).map(
      (backfill) => Object.freeze({ action: "backfill-field" as const, ...backfill }),
    ),
  ]);
}

/** Exact prepared model-field replacement, independent of SQL and executable migrations. */
export interface ConfigurationSyncSnapshotRewrite {
  readonly id: string;
  readonly fields: JsonObject;
  readonly references: readonly { readonly fieldPath: string; readonly mediaId: string }[];
}

/** Canonical baseline JSON an applied model write stores, or null without a structure. */
export function configurationSyncBaseline(model: NormalizedContentModel): {
  readonly hash: string | null;
  readonly json: string | null;
} {
  return model.structure === undefined
    ? { hash: null, json: null }
    : { hash: model.structureHash, json: canonicalizeJson(model.structure) };
}

/** Whether applying a plan changes public projections or published content. */
export function configurationSyncAdvancesPublicState(plan: ConfigurationSyncPlan): boolean {
  return plan.operations.some(
    (operation) =>
      operation.action !== "record-baseline" &&
      (operation.action !== "label-update" || operation.affectsPublicProjection !== false),
  );
}

export function checkConfigurationSynchronization(
  plan: ConfigurationSyncPlan,
): ConfigurationSyncCheckResult {
  return Object.freeze({ exitCode: plan.isValid && !plan.requiresApply ? 0 : 1, plan });
}
