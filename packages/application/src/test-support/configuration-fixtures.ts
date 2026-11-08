import { defineCollection, defineConfig } from "@lacecms/config";
import type { NormalizedContentModel } from "@lacecms/config";
import { builtInBlocks, field } from "@lacecms/content";
import type { JsonObject } from "@lacecms/content";
import type {
  ConfigurationSyncSnapshot,
  ConfigurationSyncSnapshotScanInput,
  StoredContentModelState,
} from "../configuration/types.js";

type StoredOverrides = {
  [Key in keyof StoredContentModelState]?: StoredContentModelState[Key] | undefined;
};

export function storedModelFixture(
  model: NormalizedContentModel,
  fingerprint: string,
  overrides: StoredOverrides = {},
): StoredContentModelState {
  return {
    draftSnapshotCount: 2,
    entryCount: 2,
    key: model.key,
    kind: model.kind,
    projectionHash: model.projectionHash,
    ...(model.publicProjectionHash === undefined
      ? {}
      : { publicProjectionHash: model.publicProjectionHash }),
    publicProjectionSourceHash: model.projectionHash,
    publishedSnapshotCount: 1,
    snapshotFingerprint: fingerprint,
    structure: model.structure,
    structureHash: model.structureHash,
    version: model.version,
    ...overrides,
  } as StoredContentModelState;
}

export function snapshotFixture(
  id: number | string,
  state: ConfigurationSyncSnapshot["state"],
  fields: JsonObject,
  blockTypes: readonly string[] = [],
): ConfigurationSyncSnapshot {
  return {
    blocks: blockTypes.map((type, index) => ({ key: `b${index}`, schemaVersion: 1, type })),
    entryId: `entry-${id}`,
    fields,
    revision: 1,
    snapshotId: `snapshot-${id}`,
    state,
    title: `Title ${id}`,
  };
}

export function scanFixture(
  stored: readonly StoredContentModelState[],
  snapshots: readonly ConfigurationSyncSnapshot[],
  pageSize?: number,
) {
  const reads: ConfigurationSyncSnapshotScanInput[] = [];
  return {
    reads,
    async readConfigurationSyncMigrationEntries(): Promise<never> {
      throw new Error("Unexpected migration scan in configuration fixture");
    },
    async readConfigurationSyncState() {
      return stored;
    },
    async readConfigurationSyncSnapshots(input: ConfigurationSyncSnapshotScanInput) {
      if (pageSize === undefined) return { items: snapshots };
      reads.push(input);
      const start = input.after === undefined ? 0 : Number(input.after);
      const items = snapshots.slice(start, start + pageSize);
      const next = start + pageSize < snapshots.length ? String(start + pageSize) : undefined;
      return next === undefined ? { items } : { items, next };
    },
  };
}

export async function posts(overrides = {}) {
  const config = await defineConfig({
    blocks: Object.values(builtInBlocks),
    content: [
      defineCollection({
        blocks: ["richText", "image"],
        fields: { summary: field.text({ maxLength: 100 }) },
        key: "posts",
        route: "/blog/:slug",
        version: 1,
        ...overrides,
      }),
    ],
  });
  const model = config.runtime.content[0]!;
  if (model.structure === undefined) throw new Error("Missing model structure");
  return { ...model, structure: model.structure };
}

export const storedFrom = (model: NormalizedContentModel, overrides: StoredOverrides = {}) =>
  storedModelFixture(model, "3:5:30:12", overrides);
export const snapshot = snapshotFixture;
export const port = (
  stored: Parameters<typeof scanFixture>[0],
  snapshots: Parameters<typeof scanFixture>[1],
  pageSize = 2,
) => scanFixture(stored, snapshots, pageSize);
