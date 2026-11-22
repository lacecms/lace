import { internalLinkIssuePath } from "@lacecms/application";
import { ContentValidationError } from "@lacecms/content";
import type { ContentValidationIssue, SnapshotEntryReference } from "@lacecms/content";
import { DomainError } from "@lacecms/domain";
import type { WritePlan, WritePlanSql } from "../write-plan/plan.js";
import { referenceGraphIssue, referenceGraphQuery, typedReferences } from "./reference-graph.js";
import type { ReferenceGraphRow, ReferencePhase } from "./reference-graph.js";
import { referenceTargetsQuery } from "./reference-targets.js";
import type { InvalidReferenceRow } from "./reference-targets.js";
import { INTERNAL_LINK_ROWS_SQL, internalLinkRowsJson } from "./statements.js";

export interface ReferenceAdmission {
  readonly entryId: string;
  readonly phase: ReferencePhase;
  readonly references: readonly SnapshotEntryReference[];
  readonly blockKeys: readonly string[];
  readonly previousDraftId?: string;
  readonly copyFromSnapshotId?: string;
  readonly config?: { readonly modelKey: string; readonly structureHash: string };
}

export type ReferenceMiss =
  | { readonly kind: "reference-issues"; readonly issues: readonly ContentValidationIssue[] }
  | { readonly kind: "reference-config" };

const targetMessages = {
  reference_target_missing: "must select an existing entry.",
  reference_target_model: "must select an entry from an allowed model.",
  reference_target_unpublished: "must select a published entry.",
} as const;

export function referenceGraphGuard(query: WritePlanSql): WritePlanSql {
  return {
    sql: `not exists(select 1 from (${query.sql}) where cycle=1 or over_limit=1)`,
    params: query.params,
  };
}

/**
 * Compute target validity and graph reachability in the atomic unit. The
 * original admission and its replay/revision ordering take precedence.
 */
export function guardEntryReferences<Miss>(
  plan: WritePlan<Miss>,
  candidate: ReferenceAdmission,
): WritePlan<Miss | ReferenceMiss> {
  const refs = typedReferences(candidate.references, candidate.phase);
  const config = candidate.config;
  const copyFrom = candidate.copyFromSnapshotId;
  if (!refs.length && config === undefined && copyFrom === undefined) return plan;
  const configGuard =
    config === undefined
      ? undefined
      : {
          sql: "exists(select 1 from content_models where key=? and structure_hash=?)",
          params: [config.modelKey, config.structureHash],
        };
  const targets = refs.length
    ? referenceTargetsQuery(refs, candidate.phase, candidate.previousDraftId)
    : undefined;
  const copyGuard =
    copyFrom === undefined
      ? undefined
      : {
          sql: `exists(with expected as (${INTERNAL_LINK_ROWS_SQL}), saved as (
      select source_key,area,field_path,target_entry_id,delivered,purpose
      from content_entry_link_references where snapshot_id=? and purpose='reference'
    ) select 1 where not exists(select * from expected except select * from saved)
      and not exists(select * from saved except select * from expected))`,
          params: [internalLinkRowsJson(typedReferences(candidate.references, "draft")), copyFrom],
        };
  const graph = refs.length
    ? referenceGraphQuery(candidate.entryId, candidate.phase, [candidate])
    : undefined;
  const checked = [
    plan.admission,
    ...(configGuard ? [configGuard] : []),
    ...(copyGuard ? [copyGuard] : []),
    ...(targets ? [{ sql: `not exists(${targets.sql})`, params: targets.params }] : []),
    ...(graph ? [referenceGraphGuard(graph)] : []),
  ];
  return {
    ...plan,
    admission: {
      sql: checked.map((query) => `(${query.sql})`).join(" and "),
      params: checked.flatMap((query) => query.params),
    },
    diagnostics: {
      ...plan.diagnostics,
      referenceState: {
        sql: `select (${plan.admission.sql}) as original_ok,
          (${configGuard?.sql ?? "1"}) as config_ok, (${copyGuard?.sql ?? "1"}) as copy_ok`,
        params: [
          ...plan.admission.params,
          ...(configGuard?.params ?? []),
          ...(copyGuard?.params ?? []),
        ],
      },
      ...(targets ? { referenceTargets: targets } : {}),
      ...(graph
        ? {
            referenceGraph: referenceGraphQuery(
              candidate.entryId,
              candidate.phase,
              [candidate],
              true,
            ),
          }
        : {}),
    },
    diagnose: (rows) => {
      const state = rows.referenceState?.[0] as {
        original_ok: number;
        config_ok: number;
        copy_ok: number;
      };
      if (!state.original_ok) return plan.diagnose(rows);
      if (!state.config_ok || !state.copy_ok) return { kind: "reference-config" };
      const invalid = rows.referenceTargets as readonly InvalidReferenceRow[] | undefined;
      const graphRow = rows.referenceGraph?.[0] as ReferenceGraphRow | undefined;
      const graphIssue = graphRow && referenceGraphIssue(graphRow, candidate.entryId);
      const targetIssues = (invalid ?? [])
        .filter(
          (row) =>
            !graphIssue ||
            graphIssue.kind !== "cycle" ||
            refs[row.index]!.targetId !== candidate.entryId,
        )
        .map((row) => ({
          code: row.code,
          message: targetMessages[row.code],
          path: internalLinkIssuePath(refs[row.index]!, candidate.blockKeys),
        }));
      if (targetIssues.length) return { kind: "reference-issues", issues: targetIssues };
      if (graphIssue) {
        const occurrence = refs.find((ref) => ref.targetId === graphIssue.targetId)!;
        const issue = {
          code: graphIssue.kind === "cycle" ? "reference_cycle" : "reference_graph_limit",
          message:
            graphIssue.kind === "cycle"
              ? "would create a cycle between entries."
              : "reaches too many dependencies. Reduce the number of reachable entries and retry.",
          path: internalLinkIssuePath(occurrence, candidate.blockKeys),
          ...(graphIssue.kind === "cycle"
            ? {
                details: { witness: graphIssue.witness, truncated: graphIssue.truncated },
              }
            : {}),
        };
        return { kind: "reference-issues", issues: [issue] };
      }
      return { kind: "reference-config" };
    },
  };
}

/** Preserve portable write failures through adapter error handling. */
export function rejectReferenceWrite(miss: ReferenceMiss): never {
  if (miss.kind === "reference-issues") throw new ContentValidationError(miss.issues);
  throw new DomainError(
    "CONTENT_REVISION_CONFLICT",
    "The content model changed. Reload and retry.",
  );
}
