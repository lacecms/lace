import type {
  ConfigurationSyncSnapshotReference,
  ConfigurationSyncSnapshotFindings,
  ConfigurationSyncMediaReference,
  ConfigurationSyncMigrationBlock,
  ConfigurationSyncMigrationSnapshot,
  ConfigurationSyncMigrationEntry,
  ConfigurationSyncMigratedBlock,
  ConfigurationSyncSnapshotMigration,
  BlockMigrationFindingKind,
  BlockMigrationFinding,
  EntryMigrationPlan,
  BlockMigrationEvidence,
} from "./types.js";
import {
  CONFIGURATION_SYNC_NAMED_SNAPSHOT_LIMIT,
  CONFIGURATION_SYNC_MAX_MEDIA_REFERENCES,
} from "./limits.js";
import {
  BlockMigrationError,
  collectFieldMedia,
  collectSnapshotInternalLinks,
  MAX_INTERNAL_LINK_REFERENCES,
  encodeFieldPath,
  validateSnapshotListBudget,
  ContentValidationError,
  MAX_JSON_BYTES,
  canonicalJsonByteLength,
  migrateBlockData,
  publishedBlockData,
  validateBlockData,
  validateBlockSettings,
} from "@lacecms/content";
import type {
  BlockDefinition,
  BlockMigrationInput,
  JsonObject,
  JsonValue,
  ModelFieldDefinitions,
} from "@lacecms/content";

function reason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > 200 ? `${message.slice(0, 199)}…` : message;
}

function mediaReferences(
  definition: BlockDefinition,
  data: JsonObject,
  sourceKey: string,
): ConfigurationSyncMediaReference[] {
  return collectFieldMedia(definition.fields, data).map(({ mediaId, path }) =>
    Object.freeze({ fieldPath: encodeFieldPath(path), mediaId, sourceKey }),
  );
}

/** Complete current definitions used only to count unchanged snapshot data. */
export interface MigrationBudgetContext {
  readonly fields: ModelFieldDefinitions;
  readonly blocks: ReadonlyMap<string, BlockDefinition>;
}

interface SnapshotOutcome {
  internalLinks?: readonly import("@lacecms/content").InternalLinkReference[];
  readonly blocks: ConfigurationSyncMigratedBlock[];
  readonly migrated: { fromVersion: number; type: string }[];
  readonly references: ConfigurationSyncMediaReference[];
}

function migrateSnapshot(
  snapshot: ConfigurationSyncMigrationSnapshot,
  entryId: string,
  definitions: ReadonlyMap<string, BlockDefinition>,
  findings: BlockMigrationFinding[],
  budgetContext?: MigrationBudgetContext,
): SnapshotOutcome {
  const outcome: SnapshotOutcome = { blocks: [], migrated: [], references: [] };
  const priorMedia = new Set(snapshot.references.map((reference) => reference.mediaId));
  const published = snapshot.state === "published";
  const finding = (
    kind: BlockMigrationFindingKind,
    block: ConfigurationSyncMigrationBlock,
    details: { readonly path?: string; readonly reason?: string } = {},
  ): void => {
    findings.push(
      Object.freeze({
        kind,
        reference: Object.freeze({
          blockKey: block.key,
          entryId,
          ...(details.path === undefined ? {} : { path: details.path }),
          ...(details.reason === undefined ? {} : { reason: details.reason }),
          schemaVersion: block.schemaVersion,
          state: snapshot.state,
          title: snapshot.title,
        }),
        type: block.type,
      }),
    );
  };
  let firstMigrated: ConfigurationSyncMigrationBlock | undefined;
  for (const block of snapshot.blocks) {
    const definition = definitions.get(block.type);
    if (definition === undefined || block.schemaVersion === definition.version) continue;
    let migrated: BlockMigrationInput;
    try {
      migrated = migrateBlockData(
        definition,
        { data: block.data ?? {}, settings: block.settings ?? {} },
        block.schemaVersion,
      );
    } catch (error) {
      if (!(error instanceof BlockMigrationError)) throw error;
      const kinds = {
        invalid_result: "invalid",
        migration_failed: "failed",
        missing_step: "missing",
        version_ahead: "ahead",
      } as const;
      finding(kinds[error.code], block, {
        reason:
          error.cause === undefined ? error.message : `${error.message} ${reason(error.cause)}`,
      });
      continue;
    }
    // A hidden block is never delivered, so it keeps draft-mode validation.
    const mode = published && !block.hidden ? "publish" : "draft";
    let validated: JsonObject;
    let settings: JsonObject;
    try {
      validated = validateBlockData(definition, migrated.data, mode, ["data"]) as JsonObject;
      // Published blocks hold only the published projection of their data.
      if (published) validated = publishedBlockData(definition, validated);
      settings = validateBlockSettings(definition, migrated.settings, ["settings"]);
    } catch (error) {
      if (!(error instanceof ContentValidationError)) throw error;
      const [issue] = error.issues;
      finding("invalid", block, {
        path:
          (issue?.path.length ?? 0) > 2
            ? encodeFieldPath(issue!.path)
            : (issue?.path ?? []).join("."),
        reason: issue?.code ?? "invalid_block_data",
      });
      continue;
    }
    if (canonicalJsonByteLength(validated as JsonValue) > MAX_JSON_BYTES) {
      finding("invalid", block, { path: "data", reason: "json_too_large" });
      continue;
    }
    const references = mediaReferences(definition, validated, block.key);
    const foreign = references.find((reference) => !priorMedia.has(reference.mediaId));
    if (foreign !== undefined) {
      finding("invalid", block, {
        path: foreign.fieldPath.startsWith("/")
          ? `/data${foreign.fieldPath}`
          : `data.${foreign.fieldPath}`,
        reason: "media_not_previously_referenced",
      });
      continue;
    }
    firstMigrated ??= block;
    outcome.blocks.push(
      Object.freeze({
        data: validated,
        expectedSchemaVersion: block.schemaVersion,
        key: block.key,
        schemaVersion: definition.version,
        settings,
      }),
    );
    outcome.migrated.push({ fromVersion: block.schemaVersion, type: block.type });
    outcome.references.push(...references);
  }
  if (firstMigrated !== undefined) {
    try {
      const migratedKeys = new Set(outcome.blocks.map((block) => block.key));
      const newLinks = collectSnapshotInternalLinks(
        {},
        {},
        outcome.blocks.map((block) => {
          const original = snapshot.blocks.find((item) => item.key === block.key)!;
          return {
            key: block.key,
            fields: definitions.get(original.type)!.fields,
            data: block.data,
            hidden: original.hidden,
          };
        }),
      );
      const keptLinks = (snapshot.internalLinks ?? []).filter(
        (reference) => !migratedKeys.has(reference.sourceKey),
      );
      if (keptLinks.length + newLinks.length > MAX_INTERNAL_LINK_REFERENCES)
        throw new ContentValidationError([
          {
            code: "too_many_internal_links",
            message: "Snapshot internal-link limit exceeded.",
            path: ["blocks", snapshot.blocks.indexOf(firstMigrated), "data"],
          },
        ]);
      if (newLinks.length || (snapshot.internalLinks?.length ?? 0))
        outcome.internalLinks = [...keptLinks, ...newLinks];
      const migratedData = new Map(outcome.blocks.map((block) => [block.key, block.data]));
      validateSnapshotListBudget(
        budgetContext?.fields ?? {},
        snapshot.fields ?? {},
        snapshot.blocks.map((block, index) => ({
          fields: (budgetContext?.blocks ?? definitions).get(block.type)?.fields ?? {},
          data: migratedData.get(block.key) ?? block.data ?? {},
          path: ["blocks", index, "data"],
        })),
      );
    } catch (error) {
      if (!(error instanceof ContentValidationError)) throw error;
      const issue = error.issues[0];
      finding("invalid", firstMigrated, {
        path: encodeFieldPath(issue?.path ?? []),
        reason: issue?.code ?? "invalid_snapshot",
      });
    }
    const migratedKeys = new Set(outcome.blocks.map((block) => block.key));
    const kept = snapshot.references.filter((reference) => !migratedKeys.has(reference.sourceKey));
    if (kept.length + outcome.references.length > CONFIGURATION_SYNC_MAX_MEDIA_REFERENCES) {
      finding("invalid", firstMigrated, {
        reason: `media references would exceed ${CONFIGURATION_SYNC_MAX_MEDIA_REFERENCES}`,
      });
    }
  }
  return outcome;
}

/**
 * Migrates and validates the stale blocks of one entry in memory and derives
 * its guarded rewrite. Dry runs fold the findings into evidence; apply writes
 * the unit only when there are no findings.
 */
export function planEntryMigration(
  entry: ConfigurationSyncMigrationEntry,
  definitions: ReadonlyMap<string, BlockDefinition>,
  actorId: string,
  budgetContext?: MigrationBudgetContext,
): EntryMigrationPlan {
  const findings: BlockMigrationFinding[] = [];
  const published =
    entry.published === undefined
      ? undefined
      : migrateSnapshot(entry.published, entry.entryId, definitions, findings, budgetContext);
  const draft =
    entry.draft === undefined
      ? undefined
      : migrateSnapshot(entry.draft, entry.entryId, definitions, findings, budgetContext);
  const blocks = [
    ...(published?.migrated ?? []).map((block) => ({ ...block, state: "published" as const })),
    ...(draft?.migrated ?? []).map((block) => ({ ...block, state: "draft" as const })),
  ];
  if (findings.length > 0) {
    return Object.freeze({ blocks, findings: Object.freeze(findings) });
  }
  const snapshots: ConfigurationSyncSnapshotMigration[] = [];
  const draftMigrated = entry.draft !== undefined && draft !== undefined && draft.blocks.length > 0;
  const draftRevision = entry.draft === undefined ? undefined : entry.draft.revision + 1;
  if (entry.published !== undefined && published !== undefined && published.blocks.length > 0) {
    // A published snapshot in sync with its draft follows the draft's new revision.
    const follows = draftMigrated && entry.draft!.revision === entry.published.revision;
    snapshots.push(
      Object.freeze({
        blocks: Object.freeze(published.blocks),
        ...(follows
          ? {
              draftGuard: Object.freeze({
                revision: entry.draft!.revision,
                snapshotId: entry.draft!.snapshotId,
              }),
            }
          : {}),
        expectedRevision: entry.published.revision,
        references: Object.freeze(published.references),
        ...(published.internalLinks === undefined
          ? {}
          : { internalLinks: published.internalLinks }),
        revision: follows ? draftRevision! : entry.published.revision,
        snapshotId: entry.published.snapshotId,
        state: "published",
      }),
    );
  }
  if (draftMigrated) {
    snapshots.push(
      Object.freeze({
        blocks: Object.freeze(draft.blocks),
        expectedRevision: entry.draft!.revision,
        references: Object.freeze(draft.references),
        ...(draft.internalLinks === undefined ? {} : { internalLinks: draft.internalLinks }),
        revision: draftRevision!,
        snapshotId: entry.draft!.snapshotId,
        state: "draft",
        updatedBy: actorId,
      }),
    );
  }
  return Object.freeze({
    blocks,
    findings: Object.freeze([]),
    ...(snapshots.length === 0
      ? {}
      : { unit: Object.freeze({ entryId: entry.entryId, snapshots: Object.freeze(snapshots) }) }),
  });
}

interface MutableFindings {
  count: number;
  snapshots: ConfigurationSyncSnapshotReference[];
}

interface MutableMigration {
  ahead: MutableFindings;
  blocks: number;
  failed: MutableFindings;
  fromVersions: Set<number>;
  invalid: MutableFindings;
  missing: MutableFindings;
  snapshots: { draft: Set<string>; published: Set<string> };
}

function freezeFindings(findings: MutableFindings): ConfigurationSyncSnapshotFindings {
  return Object.freeze({
    count: findings.count,
    snapshots: Object.freeze([...findings.snapshots]),
  });
}

/** Folds migration scan pages of one model into per-type evidence. */
export function createMigrationEvidenceAccumulator(
  definitions: ReadonlyMap<string, BlockDefinition>,
  actorId: string,
  budgetContext?: MigrationBudgetContext,
): {
  add(entries: readonly ConfigurationSyncMigrationEntry[]): void;
  result(): Readonly<Record<string, BlockMigrationEvidence>>;
} {
  const empty = (): MutableFindings => ({ count: 0, snapshots: [] });
  const types = new Map<string, MutableMigration>();
  for (const type of definitions.keys()) {
    types.set(type, {
      ahead: empty(),
      blocks: 0,
      failed: empty(),
      fromVersions: new Set(),
      invalid: empty(),
      missing: empty(),
      snapshots: { draft: new Set(), published: new Set() },
    });
  }
  return {
    add(entries) {
      for (const entry of entries) {
        const plan = planEntryMigration(entry, definitions, actorId, budgetContext);
        for (const block of plan.blocks) {
          const state = types.get(block.type)!;
          state.blocks += 1;
          state.fromVersions.add(block.fromVersion);
          state.snapshots[block.state].add(entry.entryId);
        }
        for (const finding of plan.findings) {
          const findings = types.get(finding.type)![finding.kind];
          findings.count += 1;
          if (findings.snapshots.length < CONFIGURATION_SYNC_NAMED_SNAPSHOT_LIMIT) {
            findings.snapshots.push(finding.reference);
          }
        }
      }
    },
    result() {
      return Object.freeze(
        Object.fromEntries(
          [...types.keys()].sort().map((type) => {
            const state = types.get(type)!;
            return [
              type,
              Object.freeze({
                ahead: freezeFindings(state.ahead),
                blocks: state.blocks,
                failed: freezeFindings(state.failed),
                fromVersions: Object.freeze([...state.fromVersions].sort((a, b) => a - b)),
                invalid: freezeFindings(state.invalid),
                missing: freezeFindings(state.missing),
                snapshots: Object.freeze({
                  draft: state.snapshots.draft.size,
                  published: state.snapshots.published.size,
                }),
                toVersion: definitions.get(type)!.version,
              }),
            ];
          }),
        ),
      );
    },
  };
}
