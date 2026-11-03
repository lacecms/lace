import type {
  StructuralChangeClass,
  StructuralChange,
  SnapshotStateCounts,
  ConfigurationSyncSnapshotReference,
  SnapshotHolders,
  StoredContentModelState,
  ConfigurationSyncModel,
  ConfigurationSyncChange,
  ConfigurationSyncEvolution,
  ConfigurationSyncOperation,
  ConfigurationSyncDiagnosticCode,
  ConfigurationSyncDiagnostic,
} from "./types.js";
import type { NormalizedContentModel } from "@lacecms/config";
import type { JsonObject } from "@lacecms/content";
import { actorId, contentModelKey } from "@lacecms/domain";
import type { Actor } from "@lacecms/domain";

export const contentSyncActor: Actor = Object.freeze({
  id: actorId("system:content-sync"),
  role: "admin",
});

export function copyModel(model: NormalizedContentModel): ConfigurationSyncModel {
  return Object.freeze({
    key: contentModelKey(model.key),
    kind: model.kind,
    projectionHash: model.projectionHash,
    ...(model.publicProjectionHash === undefined
      ? {}
      : { publicProjectionHash: model.publicProjectionHash }),
    structureHash: model.structureHash,
    version: model.version,
  });
}

export function copyStoredModel(model: StoredContentModelState): StoredContentModelState {
  return Object.freeze({
    draftSnapshotCount: model.draftSnapshotCount,
    entryCount: model.entryCount,
    key: contentModelKey(model.key),
    kind: model.kind,
    projectionHash: model.projectionHash,
    ...(model.publicProjectionHash === undefined
      ? {}
      : { publicProjectionHash: model.publicProjectionHash }),
    ...(model.publicProjectionSourceHash === undefined
      ? {}
      : { publicProjectionSourceHash: model.publicProjectionSourceHash }),
    publishedSnapshotCount: model.publishedSnapshotCount,
    ...(model.snapshotFingerprint === undefined
      ? {}
      : { snapshotFingerprint: model.snapshotFingerprint }),
    ...(model.structure === undefined ? {} : { structure: model.structure }),
    structureHash: model.structureHash,
    version: model.version,
  });
}

/** JSON-safe stored state for reports; the baseline itself is reduced to its presence. */
export function reportedStoredModel(model: StoredContentModelState): JsonObject {
  const { structure, ...rest } = model;
  return { ...rest, hasBaseline: structure !== undefined } as unknown as JsonObject;
}

export interface DiagnosticDetails {
  readonly affectedCount?: number | undefined;
  readonly blockType?: string | undefined;
  readonly changeClass?: StructuralChangeClass | undefined;
  readonly fieldKey?: string | undefined;
  readonly relatedModelKey?: string | undefined;
  readonly snapshots?: readonly ConfigurationSyncSnapshotReference[] | undefined;
}

export function diagnostic(
  code: ConfigurationSyncDiagnosticCode,
  modelKey: string,
  message: string,
  details: DiagnosticDetails | string = {},
): ConfigurationSyncDiagnostic {
  const values = typeof details === "string" ? { relatedModelKey: details } : details;
  return Object.freeze({
    ...(values.affectedCount === undefined ? {} : { affectedCount: values.affectedCount }),
    ...(values.blockType === undefined ? {} : { blockType: values.blockType }),
    ...(values.changeClass === undefined ? {} : { changeClass: values.changeClass }),
    code,
    ...(values.fieldKey === undefined
      ? {}
      : {
          fieldKey: values.fieldKey,
          ...(values.fieldKey.startsWith("/") ? { schemaPath: values.fieldKey } : {}),
        }),
    message,
    modelKey: contentModelKey(modelKey),
    ...(values.relatedModelKey === undefined
      ? {}
      : { relatedModelKey: contentModelKey(values.relatedModelKey) }),
    ...(values.snapshots === undefined ? {} : { snapshots: Object.freeze([...values.snapshots]) }),
  });
}

export function compareByKey<Value extends { readonly key: string }>(
  left: Value,
  right: Value,
): number {
  return left.key.localeCompare(right.key);
}

export function compareDiagnostics(
  left: ConfigurationSyncDiagnostic,
  right: ConfigurationSyncDiagnostic,
): number {
  return (
    left.modelKey.localeCompare(right.modelKey) ||
    left.code.localeCompare(right.code) ||
    (left.relatedModelKey ?? "").localeCompare(right.relatedModelKey ?? "") ||
    (left.fieldKey ?? "").localeCompare(right.fieldKey ?? "") ||
    (left.blockType ?? "").localeCompare(right.blockType ?? "")
  );
}

export function hasSnapshots(model: StoredContentModelState): boolean {
  return model.draftSnapshotCount > 0 || model.publishedSnapshotCount > 0;
}

export function snapshotDescription(model: StoredContentModelState): string {
  const states: string[] = [];
  if (model.draftSnapshotCount > 0) states.push(`draft=${model.draftSnapshotCount}`);
  if (model.publishedSnapshotCount > 0) states.push(`published=${model.publishedSnapshotCount}`);
  return states.join(", ");
}

export function countsDescription(counts: SnapshotStateCounts): string {
  return `draft=${counts.draft}, published=${counts.published}`;
}

export function total(counts: SnapshotStateCounts | undefined): number {
  return counts === undefined ? 0 : counts.draft + counts.published;
}

/** Draft and published counts of holder evidence, without the named snapshots. */
export function holderCounts(
  holders: SnapshotHolders | undefined,
): SnapshotStateCounts | undefined {
  return holders === undefined
    ? undefined
    : Object.freeze({ draft: holders.draft, published: holders.published });
}

export function incompatible(
  model: ConfigurationSyncModel,
  stored: StoredContentModelState,
  evolution?: ConfigurationSyncEvolution,
): ConfigurationSyncOperation {
  return Object.freeze({
    action: "incompatible-change",
    ...(evolution === undefined ? {} : { evolution }),
    model,
    stored,
  });
}

export function undecidedChange(change: StructuralChange): ConfigurationSyncChange {
  return Object.freeze({
    class: change.class,
    ...(change.from === undefined ? {} : { from: change.from }),
    ...(change.hinted === undefined ? {} : { hinted: change.hinted }),
    kind: change.kind,
    ...(change.properties === undefined ? {} : { properties: change.properties }),
    scope: change.scope,
    target: change.target,
    ...(change.scope === "field" && change.target.startsWith("/")
      ? { schemaPath: change.target }
      : {}),
  });
}

/** Mutable planning context shared by the planner and the scan-request collector. */
