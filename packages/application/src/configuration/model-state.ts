import type { StoredContentModelState, ConfigurationSyncModel } from "./types.js";
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
