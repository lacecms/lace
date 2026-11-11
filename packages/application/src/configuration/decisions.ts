import type {
  StructuralChange,
  StructuralChangeKind,
  SnapshotStateCounts,
  ModelSnapshotEvidence,
  ConfigurationSyncEvidence,
  ConfigurationSyncScanRequest,
  BlockMigrationEvidence,
  StoredContentModelState,
  ConfigurationSyncChange,
  ConfigurationSyncEvolution,
  ConfigurationSyncBlockMigration,
  ConfigurationSyncFieldRename,
  ConfigurationSyncDiagnosticCode,
  ConfigurationSyncDiagnostic,
} from "./types.js";
import type { NormalizedContentModel } from "@lacecms/config";
import type { FieldVisibility, JsonObject } from "@lacecms/content";
import { changeNeedsEvidence } from "./evidence.js";

import { diagnostic } from "./diagnostics.js";
import type { DiagnosticDetails } from "./diagnostics.js";
import {
  hasSnapshots,
  snapshotDescription,
  countsDescription,
  total,
  holderCounts,
} from "./snapshot-counts.js";
import { undecidedChange } from "./plan-results.js";
export interface PlanningContext {
  readonly diagnostics: ConfigurationSyncDiagnostic[];
  readonly evidence: ConfigurationSyncEvidence | undefined;
  readonly scanRequests: ConfigurationSyncScanRequest[];
}

interface DecidedEvolution {
  readonly evolution: ConfigurationSyncEvolution;
  readonly refused: boolean;
}

interface KindAccumulator {
  readonly refuse: (
    code: ConfigurationSyncDiagnosticCode,
    message: string,
    details: DiagnosticDetails,
  ) => void;
  readonly renames: ConfigurationSyncFieldRename[];
  readonly fieldRemovals: string[];
  readonly blockRemovals: string[];
  readonly blockMigrations: ConfigurationSyncBlockMigration[];
  seoRemoval: boolean;
}
type KindDecision = (input: {
  readonly change: StructuralChange;
  readonly modelKey: string;
  readonly evidence: ModelSnapshotEvidence | undefined;
  readonly accumulator: KindAccumulator;
}) => {
  readonly affected: SnapshotStateCounts | undefined;
  readonly migration: ConfigurationSyncChange["migration"];
};

const kindDecisions: Readonly<Partial<Record<StructuralChangeKind, KindDecision>>> = {
  "field-renamed": ({ change, modelKey, evidence, accumulator }) => {
    const { refuse, renames } = accumulator;
    const fieldKey = change.scope === "field" ? change.target : undefined;
    let affected: SnapshotStateCounts | undefined;

    const occupied = evidence?.fieldHolders[change.target];
    affected = holderCounts(evidence?.fieldHolders[change.from ?? ""]);
    if (occupied !== undefined && total(occupied) > 0) {
      refuse(
        "FIELD_RENAME_TARGET_HAS_DATA",
        `Model ${modelKey} renames field ${change.from} to ${change.target}, but ${total(occupied)} snapshots already hold ${change.target} (${countsDescription(occupied)}).`,
        {
          affectedCount: total(occupied),
          changeClass: change.class,
          fieldKey,
          snapshots: occupied.snapshots,
        },
      );
    } else if (total(affected) > 0) {
      renames.push(Object.freeze({ from: change.from!, to: change.target }));
    }

    return { affected, migration: undefined };
  },
  "field-removed": ({ change, modelKey, evidence, accumulator }) => {
    const { refuse, fieldRemovals } = accumulator;
    const fieldKey = change.scope === "field" ? change.target : undefined;
    let affected: SnapshotStateCounts | undefined;

    const holders = evidence?.fieldHolders[change.target];
    affected = holderCounts(holders);
    if (holders !== undefined && total(holders) > 0) {
      if (change.hinted === true) {
        fieldRemovals.push(change.target);
      } else {
        refuse(
          "FIELD_REMOVAL_HAS_DATA",
          `Model ${modelKey} removes field ${change.target}, which holds data in ${total(holders)} snapshots (${countsDescription(holders)}). Declare removedFields: ["${change.target}"] to prune it, or renamedFrom: "${change.target}" on the field that replaces it.`,
          {
            affectedCount: total(holders),
            changeClass: change.class,
            fieldKey,
            snapshots: holders.snapshots,
          },
        );
      }
    }

    return { affected, migration: undefined };
  },
  "seo-disabled": ({ change, modelKey, evidence, accumulator }) => {
    const { refuse } = accumulator;
    let affected: SnapshotStateCounts | undefined;

    const holders = evidence?.seoHolders;
    affected = holderCounts(holders);
    if (holders !== undefined && total(holders) > 0) {
      if (change.hinted === true) {
        accumulator.seoRemoval = true;
      } else {
        refuse(
          "SEO_REMOVAL_HAS_DATA",
          `Model ${modelKey} disables seo while ${total(holders)} snapshots hold SEO values (${countsDescription(holders)}). Declare removedSeo: true to prune them.`,
          {
            affectedCount: total(holders),
            changeClass: change.class,
            snapshots: holders.snapshots,
          },
        );
      }
    }

    return { affected, migration: undefined };
  },
  "block-type-removed": ({ change, modelKey, evidence, accumulator }) => {
    const { refuse, blockRemovals } = accumulator;
    const blockType = change.scope === "block" ? change.target : undefined;
    let affected: SnapshotStateCounts | undefined;

    const holders = evidence?.blockHolders[change.target];
    affected = holderCounts(holders);
    if (holders !== undefined && total(holders) > 0) {
      if (change.hinted === true) {
        blockRemovals.push(change.target);
      } else {
        refuse(
          "BLOCK_TYPE_REMOVAL_HAS_BLOCKS",
          `Model ${modelKey} disallows block type ${change.target}, which ${total(holders)} snapshots use (${countsDescription(holders)}). Declare removedBlocks: ["${change.target}"] to drop those blocks.`,
          {
            affectedCount: total(holders),
            blockType,
            changeClass: change.class,
            snapshots: holders.snapshots,
          },
        );
      }
    }

    return { affected, migration: undefined };
  },
  "block-definition-changed": ({ change, modelKey, evidence, accumulator }) => {
    const { refuse, blockMigrations } = accumulator;
    const blockType = change.scope === "block" ? change.target : undefined;
    let affected: SnapshotStateCounts | undefined;
    let migration: ConfigurationSyncChange["migration"];

    const holders = evidence?.blockHolders[change.target];
    affected = holderCounts(holders);
    if (!versionedBlockChange(change)) {
      if (holders !== undefined && total(holders) > 0) {
        refuse(
          "BLOCK_DEFINITION_CHANGE_HAS_BLOCKS",
          `Block type ${change.target} changes its definition without a version increase while ${total(holders)} snapshots of model ${modelKey} hold such blocks (${countsDescription(holders)}). Increase the block version and declare migrations.`,
          {
            affectedCount: total(holders),
            blockType,
            changeClass: change.class,
            snapshots: holders.snapshots,
          },
        );
      }
    } else {
      const facts = evidence?.migrations?.[change.target];
      const decision =
        facts === undefined
          ? { planned: false, refusals: [] }
          : decideBlockMigration(modelKey, change.target, facts);
      for (const refusal of decision.refusals) {
        refuse(refusal.code, refusal.message, {
          affectedCount: refusal.findings.count,
          blockType,
          changeClass: change.class,
          snapshots: refusal.findings.snapshots,
        });
      }
      if (decision.planned && facts !== undefined) {
        migration = Object.freeze({ from: facts.fromVersions, to: facts.toVersion });
        blockMigrations.push(
          Object.freeze({
            blockType: change.target,
            blocks: facts.blocks,
            draft: facts.snapshots.draft,
            fromVersions: facts.fromVersions,
            published: facts.snapshots.published,
            toVersion: facts.toVersion,
          }),
        );
      }
    }

    return { affected, migration };
  },
};

/**
 * Decides every structural change of a populated model from its stored
 * evidence, records refusals as diagnostics, and lists the planned backfills.
 */
export function decideEvolution(
  current: NormalizedContentModel,
  stored: StoredContentModelState,
  changes: readonly StructuralChange[],
  context: PlanningContext,
): DecidedEvolution {
  const modelKey = current.key;
  const populated = hasSnapshots(stored);
  const storedCounts = Object.freeze({
    draft: stored.draftSnapshotCount,
    published: stored.publishedSnapshotCount,
  });
  if (!populated) {
    return {
      evolution: Object.freeze({
        backfills: Object.freeze([]),
        changes: Object.freeze(changes.map(undecidedChange)),
        snapshots: storedCounts,
      }),
      refused: false,
    };
  }

  let evidence: ModelSnapshotEvidence | undefined;
  if (changes.some(changeNeedsEvidence)) {
    const fingerprint = stored.snapshotFingerprint ?? "";
    const migrations = changes
      .filter((change) => versionedBlockChange(change))
      .map((change) => Object.freeze({ type: change.target, version: change.version!.to }));
    context.scanRequests.push(
      Object.freeze({
        changes,
        blockFields: Object.fromEntries(
          ((current.structure?.blockDefinitions ?? []) as readonly JsonObject[]).map((block) => [
            block.type as string,
            block.fields as unknown as typeof current.fields,
          ]),
        ),
        storedFields: stored.structure?.fields as unknown as typeof current.fields,
        fields: current.fields,
        fingerprint,
        ...(migrations.length === 0 ? {} : { migrations: Object.freeze(migrations) }),
        modelKey: stored.key,
        ...(current.visibility === undefined
          ? {}
          : { visibility: current.visibility as FieldVisibility }),
      }),
    );
    const candidate = context.evidence?.[stored.key];
    if (candidate === undefined || candidate.fingerprint !== fingerprint) {
      context.diagnostics.push(
        diagnostic(
          "SNAPSHOT_EVIDENCE_STALE",
          modelKey,
          `Model ${modelKey} needs a fresh scan of its stored snapshots; rerun synchronization.`,
        ),
      );
      return {
        evolution: Object.freeze({
          backfills: Object.freeze([]),
          changes: Object.freeze(changes.map(undecidedChange)),
          snapshots: storedCounts,
        }),
        refused: true,
      };
    }
    evidence = candidate;
  }

  let refused = false;
  const refuse = (
    code: ConfigurationSyncDiagnosticCode,
    message: string,
    details: DiagnosticDetails,
  ): void => {
    refused = true;
    context.diagnostics.push(diagnostic(code, modelKey, message, details));
  };
  const decided: ConfigurationSyncChange[] = [];
  const backfills: string[] = [];
  const renames: ConfigurationSyncFieldRename[] = [];
  const fieldRemovals: string[] = [];
  const blockRemovals: string[] = [];
  const blockMigrations: ConfigurationSyncBlockMigration[] = [];
  const accumulator: KindAccumulator = {
    refuse,
    renames,
    fieldRemovals,
    blockRemovals,
    blockMigrations,
    seoRemoval: false,
  };
  for (const change of changes) {
    const fieldKey = change.scope === "field" ? change.target : undefined;
    let affected: SnapshotStateCounts | undefined;
    let backfill: SnapshotStateCounts | undefined;
    let violations: number | undefined;
    let migration: ConfigurationSyncChange["migration"];

    if (change.kind === "field-type-changed") {
      refuse(
        "FIELD_TYPE_CHANGED",
        `Model ${modelKey} changes the type of field ${change.target} while snapshots exist (${snapshotDescription(stored)}).`,
        { changeClass: change.class, fieldKey },
      );
    } else if (change.class === "breaking" && change.kind === "route-changed") {
      if (stored.publishedSnapshotCount > 0) {
        refuse(
          "ROUTE_CHANGE_HAS_PUBLISHED",
          `Model ${modelKey} changes its ${change.target} while ${stored.publishedSnapshotCount} entries are published.`,
          { affectedCount: stored.publishedSnapshotCount, changeClass: change.class },
        );
      }
      const removal = change.routeRemoved === true ? evidence?.routeRemoval : undefined;
      if (removal !== undefined && removal.count > 0) {
        refuse(
          "ROUTE_REMOVAL_HAS_SLUGS_OR_LINKS",
          `Model ${modelKey} removes its route while ${removal.count} snapshots hold a slug or are linked internally; clear those slugs and links first.`,
          {
            affectedCount: removal.count,
            changeClass: change.class,
            snapshots: removal.snapshots,
          },
        );
      }
    } else if (change.class === "breaking") {
      refuse(
        "FIELD_CHANGE_UNSUPPORTED",
        `Model ${modelKey} changes ${change.scope} ${change.target}${
          change.properties === undefined ? "" : ` (${change.properties.join(", ")})`
        } in a way synchronization cannot apply while snapshots exist.`,
        { changeClass: change.class, ...(fieldKey === undefined ? {} : { fieldKey }) },
      );
    } else {
      const result = kindDecisions[change.kind]?.({ change, modelKey, evidence, accumulator });
      affected = result?.affected;
      migration = result?.migration;
    }
    if (change.kind.startsWith("field-visibility-"))
      affected = evidence?.prunes?.[change.target] ?? Object.freeze({ draft: 0, published: 0 });
    if (change.class === "validated" && change.scope === "field") {
      const findings = evidence?.violations[change.target];
      violations = findings?.count ?? 0;
      if (findings !== undefined && findings.count > 0) {
        refuse(
          "CONSTRAINT_VIOLATED",
          change.kind.startsWith("field-visibility-")
            ? `Model ${modelKey} reveals field ${change.target} in ${findings.count} published snapshots that do not satisfy it; make it optional first or update and republish those entries.`
            : `Model ${modelKey} tightens field ${change.target} (${(change.properties ?? []).join(", ")}), but ${findings.count} stored snapshots do not satisfy it.`,
          {
            affectedCount: findings.count,
            changeClass: change.class,
            fieldKey,
            snapshots: findings.snapshots,
          },
        );
      }
    }

    if (change.backfill === true) {
      backfill = evidence?.backfills[change.target] ?? Object.freeze({ draft: 0, published: 0 });
      if (total(backfill) > 0) {
        const invalidDefault = evidence?.violations[change.target];
        if (
          change.class !== "validated" &&
          invalidDefault !== undefined &&
          invalidDefault.count > 0
        )
          refuse(
            "CONSTRAINT_VIOLATED",
            `Model ${modelKey} default for ${change.target} is invalid for stored snapshots.`,
            {
              affectedCount: invalidDefault.count,
              changeClass: change.class,
              fieldKey,
              snapshots: invalidDefault.snapshots,
            },
          );
        if (
          current.fields[change.target]?.type === "media" ||
          (evidence?.mediaBackfills?.[change.target]?.count ?? 0) > 0
        ) {
          refuse(
            "MEDIA_DEFAULT_BACKFILL_UNSUPPORTED",
            `Model ${modelKey} declares a default for media field ${change.target}, which cannot be backfilled into ${total(backfill)} snapshots; remove the default or add the field without one.`,
            {
              affectedCount: total(backfill),
              changeClass: change.class,
              fieldKey,
              ...(evidence?.mediaBackfills?.[change.target] === undefined ||
              (current.fields[change.target]?.type === "media" && !change.target.startsWith("/"))
                ? {}
                : { snapshots: evidence.mediaBackfills[change.target]!.snapshots }),
            },
          );
        } else {
          backfills.push(change.target);
        }
      }
    }
    decided.push(
      Object.freeze({
        ...(affected === undefined ? {} : { affected }),
        ...(backfill === undefined ? {} : { backfill }),
        class: change.class,
        ...(change.from === undefined ? {} : { from: change.from }),
        ...(change.hinted === undefined ? {} : { hinted: change.hinted }),
        kind: change.kind,
        ...(migration === undefined ? {} : { migration }),
        ...(change.properties === undefined ? {} : { properties: change.properties }),
        scope: change.scope,
        target: change.target,
        ...(change.scope === "field" && change.target.startsWith("/")
          ? { schemaPath: change.target }
          : {}),
        ...(violations === undefined ? {} : { violations }),
        ...(change.visibility === undefined ? {} : { visibility: change.visibility }),
      }),
    );
  }
  if (evidence !== undefined && evidence.oversized.count > 0) {
    refuse(
      "BACKFILL_EXCEEDS_LIMIT",
      `Model ${modelKey} field rewrites would push ${evidence.oversized.count} snapshots above the content size, list-element or media-reference limit.`,
      {
        affectedCount: evidence.oversized.count,
        snapshots: evidence.oversized.snapshots,
        fieldKey: changes.find(
          (change) => change.scope === "field" && change.target.startsWith("/"),
        )?.target,
      },
    );
  }
  return {
    evolution: Object.freeze({
      backfills: Object.freeze(backfills.sort()),
      ...(current.visibility !== undefined ||
      stored.structure?.visibility !== undefined ||
      [
        ...Object.values(current.fields),
        ...Object.values((stored.structure?.fields ?? {}) as unknown as typeof current.fields),
      ].some((field) => field.type === "group" || field.type === "list")
        ? { recursiveFields: true as const }
        : {}),
      ...(blockRemovals.length === 0 ? {} : { blockRemovals: Object.freeze(blockRemovals.sort()) }),
      changes: Object.freeze(decided),
      ...(fieldRemovals.length === 0 ? {} : { fieldRemovals: Object.freeze(fieldRemovals.sort()) }),
      ...(blockMigrations.length === 0
        ? {}
        : {
            migrations: Object.freeze(
              blockMigrations.sort((left, right) => left.blockType.localeCompare(right.blockType)),
            ),
          }),
      ...(renames.length === 0
        ? {}
        : {
            renames: Object.freeze(renames.sort((left, right) => left.to.localeCompare(right.to))),
          }),
      ...(accumulator.seoRemoval ? { seoRemoval: true as const } : {}),
      snapshots: evidence?.snapshots ?? storedCounts,
    }),
    refused,
  };
}

/** Whether a block definition change also changes the block version. */
function versionedBlockChange(change: StructuralChange): boolean {
  return (
    change.kind === "block-definition-changed" &&
    change.version !== undefined &&
    change.version.from !== change.version.to
  );
}

interface BlockMigrationRefusal {
  readonly code: ConfigurationSyncDiagnosticCode;
  readonly findings: BlockMigrationEvidence["failed"];
  readonly message: string;
}

/** Refuses a block migration on any finding; otherwise plans it when blocks are stale. */
function decideBlockMigration(
  modelKey: string,
  blockType: string,
  facts: BlockMigrationEvidence,
): { readonly planned: boolean; readonly refusals: readonly BlockMigrationRefusal[] } {
  const to = facts.toVersion;
  const groups: readonly [
    "ahead" | "failed" | "invalid" | "missing",
    ConfigurationSyncDiagnosticCode,
    string,
  ][] = [
    [
      "missing",
      "BLOCK_MIGRATION_MISSING",
      `Block type ${blockType} of model ${modelKey} has ${facts.missing.count} stored blocks without a migration path to version ${to}; declare migrations for every version after the oldest stored one.`,
    ],
    [
      "ahead",
      "BLOCK_VERSION_AHEAD",
      `Block type ${blockType} of model ${modelKey} has ${facts.ahead.count} stored blocks newer than the configured version ${to}.`,
    ],
    [
      "failed",
      "BLOCK_MIGRATION_FAILED",
      `Block type ${blockType} migration to version ${to} failed for ${facts.failed.count} stored blocks of model ${modelKey}.`,
    ],
    [
      "invalid",
      "BLOCK_MIGRATION_INVALID",
      `Block type ${blockType} migration to version ${to} produced ${facts.invalid.count} invalid blocks in model ${modelKey}.`,
    ],
  ];
  const refusals: BlockMigrationRefusal[] = [];
  for (const [key, code, message] of groups) {
    const findings = facts[key];
    if (findings.count > 0) refusals.push({ code, findings, message });
  }
  return { planned: refusals.length === 0 && facts.blocks > 0, refusals };
}
