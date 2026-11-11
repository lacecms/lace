import type {
  StructuralChange,
  SnapshotStateCounts,
  ConfigurationSyncSnapshotReference,
  ConfigurationSyncSnapshotFindings,
  ConfigurationSyncSnapshot,
  SnapshotHolders,
  ModelSnapshotEvidence,
  ConfigurationSyncScanRequest,
} from "./types.js";
import { CONFIGURATION_SYNC_NAMED_SNAPSHOT_LIMIT } from "./limits.js";
import { transformConfigurationSyncFields } from "./fields.js";
import {
  MAX_DRAFT_MEDIA_REFERENCES,
  ContentValidationError,
  validateSnapshotListBudget,
  MAX_JSON_BYTES,
  canonicalJsonByteLength,
} from "@lacecms/content";

/** Whether a change can only be decided by reading stored snapshots. */
export function changeNeedsEvidence(change: StructuralChange): boolean {
  return (
    change.backfill === true ||
    change.routeRemoved === true ||
    change.kind.startsWith("field-visibility-") ||
    change.class === "destructive" ||
    change.class === "migration" ||
    change.class === "validated"
  );
}

function emptyCounts(): { draft: number; published: number } {
  return { draft: 0, published: 0 };
}

function increment(
  counts: Record<string, { draft: number; published: number }>,
  key: string,
  state: "draft" | "published",
): void {
  const value = (counts[key] ??= emptyCounts());
  value[state] += 1;
}

interface MutableFindings {
  count: number;
  snapshots: ConfigurationSyncSnapshotReference[];
}

function addFinding(
  findings: MutableFindings,
  snapshot: ConfigurationSyncSnapshot,
  path?: string,
): void {
  findings.count += 1;
  if (findings.snapshots.length < CONFIGURATION_SYNC_NAMED_SNAPSHOT_LIMIT) {
    findings.snapshots.push(
      Object.freeze({
        entryId: snapshot.entryId,
        state: snapshot.state,
        title: snapshot.title,
        ...(path === undefined ? {} : { path }),
      }),
    );
  }
}

function freezeCounts(
  counts: Record<string, { draft: number; published: number }>,
): Readonly<Record<string, SnapshotStateCounts>> {
  return Object.freeze(
    Object.fromEntries(
      Object.keys(counts)
        .sort()
        .map((key) => [key, Object.freeze({ ...counts[key]! })]),
    ),
  );
}

function freezeFindings(findings: MutableFindings): ConfigurationSyncSnapshotFindings {
  return Object.freeze({
    count: findings.count,
    snapshots: Object.freeze([...findings.snapshots]),
  });
}

interface MutableHolders {
  draft: number;
  published: number;
  snapshots: ConfigurationSyncSnapshotReference[];
}

function emptyHolders(): MutableHolders {
  return { draft: 0, published: 0, snapshots: [] };
}

function addHolder(
  holders: MutableHolders,
  snapshot: ConfigurationSyncSnapshot,
  path?: string,
): void {
  holders[snapshot.state] += 1;
  if (holders.snapshots.length < CONFIGURATION_SYNC_NAMED_SNAPSHOT_LIMIT) {
    holders.snapshots.push(
      Object.freeze({
        entryId: snapshot.entryId,
        state: snapshot.state,
        title: snapshot.title,
        ...(path === undefined ? {} : { path }),
      }),
    );
  }
}

function freezeHolders(
  holders: Record<string, MutableHolders>,
): Readonly<Record<string, SnapshotHolders>> {
  return Object.freeze(
    Object.fromEntries(
      Object.keys(holders)
        .sort()
        .map((key) => {
          const { draft, published, snapshots } = holders[key]!;
          return [
            key,
            Object.freeze({ draft, published, snapshots: Object.freeze([...snapshots]) }),
          ];
        }),
    ),
  );
}

/** Folds bounded snapshot pages into the evidence one scan request needs. */
export function createSnapshotEvidenceAccumulator(request: ConfigurationSyncScanRequest): {
  add(snapshots: readonly ConfigurationSyncSnapshot[]): void;
  result(): ModelSnapshotEvidence;
} {
  const snapshots = emptyCounts();
  const fieldHolders: Record<string, MutableHolders> = {};
  const blockHolders: Record<string, MutableHolders> = {};
  const backfills: Record<string, { draft: number; published: number }> = {};
  const violations: Record<string, MutableFindings> = {};
  const mediaBackfills: Record<string, MutableFindings> = {};
  const prunes: Record<string, { draft: number; published: number }> = {};
  const oversized: MutableFindings = { count: 0, snapshots: [] };
  const removedFields = new Set<string>();
  const renames = new Map<string, string>();
  const blockTypes = new Set<string>();
  const backfilled = new Set<string>();
  const validated = new Map<string, StructuralChange>();
  const seoHolders = request.changes.some((change) => change.kind === "seo-disabled")
    ? emptyHolders()
    : undefined;
  const routeRemoval: MutableFindings | undefined = request.changes.some(
    (change) => change.routeRemoved === true,
  )
    ? { count: 0, snapshots: [] }
    : undefined;
  for (const change of request.changes) {
    if (change.kind === "field-removed") removedFields.add(change.target);
    if (change.kind === "field-renamed" && change.from !== undefined) {
      renames.set(change.target, change.from);
    }
    if (change.scope === "block" && change.class !== "compatible") blockTypes.add(change.target);
    if (change.backfill === true) backfilled.add(change.target);
    if (change.class === "validated" || change.backfill) validated.set(change.target, change);
  }
  for (const key of [...removedFields, ...renames.keys(), ...renames.values()]) {
    fieldHolders[key] = emptyHolders();
  }
  for (const type of blockTypes) blockHolders[type] = emptyHolders();
  for (const key of backfilled) backfills[key] = emptyCounts();
  for (const key of validated.keys()) violations[key] = { count: 0, snapshots: [] };

  return {
    add(page) {
      for (const snapshot of page) {
        snapshots[snapshot.state] += 1;
        if (seoHolders !== undefined && snapshot.hasSeo === true) addHolder(seoHolders, snapshot);
        if (
          routeRemoval !== undefined &&
          (snapshot.slug !== undefined || (snapshot.incomingLinks ?? 0) > 0)
        )
          addFinding(routeRemoval, snapshot);
        const types = new Set(snapshot.blocks.map((block) => block.type));
        for (const type of blockTypes) {
          if (types.has(type)) addHolder(blockHolders[type]!, snapshot);
        }
        const transformed = transformConfigurationSyncFields(
          request.fields,
          request.changes,
          snapshot.fields,
          snapshot.state,
          request.visibility,
        );
        for (const key of Object.keys(transformed.prunes)) increment(prunes, key, snapshot.state);
        for (const [key, path] of Object.entries(transformed.holders))
          if (fieldHolders[key] !== undefined)
            addHolder(fieldHolders[key]!, snapshot, key.startsWith("/") ? path : undefined);
        for (const [key] of Object.entries(transformed.backfills))
          increment(backfills, key, snapshot.state);
        for (const [key, path] of Object.entries(transformed.mediaBackfills)) {
          const finding = (mediaBackfills[key] ??= { count: 0, snapshots: [] });
          addFinding(finding, snapshot, path);
        }
        let overLimit = canonicalJsonByteLength(transformed.fields) > MAX_JSON_BYTES;
        let limitPath: string | undefined;
        const removedTypes = new Set(
          request.changes
            .filter((change) => change.kind === "block-type-removed")
            .map((change) => change.target),
        );
        const retained = snapshot.blocks.filter((block) => !removedTypes.has(block.type));
        const oversizedBlock = retained.findIndex(
          (block) => canonicalJsonByteLength(block.data ?? {}) > MAX_JSON_BYTES,
        );
        if (oversizedBlock >= 0) {
          overLimit = true;
          limitPath = `/blocks/${oversizedBlock}/data`;
        }
        try {
          validateSnapshotListBudget(
            request.fields,
            transformed.fields,
            retained.map((block, index) => ({
              fields: request.blockFields?.[block.type] ?? {},
              data: block.data ?? {},
              path: ["blocks", index, "data"],
            })),
          );
        } catch (error) {
          if (!(error instanceof ContentValidationError)) throw error;
          overLimit = true;
          limitPath = error.issues[0]?.path.map(String).join("/");
          if (limitPath !== undefined) limitPath = `/${limitPath}`;
        }
        const keptReferences = (snapshot.references ?? []).filter(
          (reference) =>
            reference.sourceKey !== "$fields" &&
            !(
              reference.sourceKey === "$seo" &&
              request.changes.some((change) => change.kind === "seo-disabled")
            ) &&
            !snapshot.blocks.some(
              (block) => removedTypes.has(block.type) && block.key === reference.sourceKey,
            ),
        );
        if (keptReferences.length + transformed.references.length > MAX_DRAFT_MEDIA_REFERENCES)
          overLimit = true;
        if (overLimit) addFinding(oversized, snapshot, limitPath);
        for (const [key, path] of Object.entries(transformed.violations))
          addFinding(violations[key]!, snapshot, key.startsWith("/") ? path : undefined);
      }
    },
    result() {
      return Object.freeze({
        backfills: freezeCounts(backfills),
        ...(Object.keys(mediaBackfills).length === 0
          ? {}
          : {
              mediaBackfills: Object.freeze(
                Object.fromEntries(
                  Object.entries(mediaBackfills).map(([key, finding]) => [
                    key,
                    freezeFindings(finding),
                  ]),
                ),
              ),
            }),
        blockHolders: freezeHolders(blockHolders),
        fieldHolders: freezeHolders(fieldHolders),
        fingerprint: request.fingerprint,
        oversized: freezeFindings(oversized),
        ...(seoHolders === undefined
          ? {}
          : { seoHolders: freezeHolders({ seo: seoHolders }).seo! }),
        ...(routeRemoval === undefined ? {} : { routeRemoval: freezeFindings(routeRemoval) }),
        snapshots: Object.freeze({ ...snapshots }),
        ...(Object.keys(prunes).length === 0 ? {} : { prunes: freezeCounts(prunes) }),
        violations: Object.freeze(
          Object.fromEntries(
            Object.keys(violations)
              .sort()
              .map((key) => [key, freezeFindings(violations[key]!)]),
          ),
        ),
      });
    },
  };
}
