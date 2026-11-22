import type { RevertContentDraftCommand } from "@lacecms/application";
import { copyInternalLinkDiffStatements } from "../links/statements.js";
import { guardEntryReferences, rejectReferenceWrite } from "../links/reference-admission.js";
import type { ReferenceMiss } from "../links/reference-admission.js";
import { failure, notPublished, revisionConflict } from "../shared/failures.js";
import type { WritePlan } from "../write-plan/plan.js";
import { copySnapshotBlocksSql } from "./blocks.js";
import { copySnapshotReferencesSql, revertDraftSnapshotSql } from "./snapshots.js";

type RevertMiss = "missing" | "not-published" | "stale-publication" | "stale-draft";
export type RevertGuardMiss = RevertMiss | ReferenceMiss;

/** Restore a publication into the independently guarded draft graph. */
export function revertDraftWritePlan(
  input: RevertContentDraftCommand,
  draftId: string,
  blockKeys: readonly string[],
): WritePlan<RevertGuardMiss> {
  const publishedId = input.expectedPublishedSnapshotId;
  const state = `select e.id,e.published_snapshot_id,s.revision from content_entries e
    left join content_snapshots s on s.id=e.draft_snapshot_id and s.id=?
    where e.id=?`;
  const plan: WritePlan<RevertMiss> = {
    admission: {
      sql: `exists(select 1 from (${state}) where published_snapshot_id=? and revision=?)`,
      params: [draftId, input.entryId, publishedId, input.expectedRevision],
    },
    diagnostics: { state: { sql: state, params: [draftId, input.entryId] } },
    diagnose: (rows) => {
      const row = rows.state?.[0] as
        | {
            published_snapshot_id: string | null;
            revision: number | null;
          }
        | undefined;
      if (row === undefined) return "missing";
      if (row.published_snapshot_id === null) return "not-published";
      return row.published_snapshot_id === publishedId ? "stale-draft" : "stale-publication";
    },
    statements: (g) => [
      {
        checkpoint: "revert.draft",
        sql: revertDraftSnapshotSql(g.sql),
        params: [input.revertedAt, input.revertedBy.id, publishedId, draftId, ...g.params],
      },
      {
        sql: `delete from content_blocks where snapshot_id=? and ${g.sql}`,
        params: [draftId, ...g.params],
      },
      {
        sql: `delete from content_media_references where snapshot_id=? and ${g.sql}`,
        params: [draftId, ...g.params],
      },
      {
        checkpoint: "revert.blocks",
        sql: copySnapshotBlocksSql(g.sql),
        params: [draftId, publishedId, ...g.params],
      },
      { sql: copySnapshotReferencesSql(g.sql), params: [draftId, publishedId, ...g.params] },
      ...copyInternalLinkDiffStatements(draftId, publishedId, g.sql).map((statement, index) => ({
        ...statement,
        ...(index === 0 ? { checkpoint: "revert.internal-links" } : {}),
        params: [...statement.params, ...g.params],
      })),
      {
        checkpoint: "revert.published",
        sql: `update content_snapshots set revision=? where id=? and ${g.sql}`,
        params: [input.expectedRevision + 1, publishedId, ...g.params],
      },
      {
        sql: `update content_entries set updated_at=? where id=? and ${g.sql}`,
        params: [input.revertedAt, input.entryId, ...g.params],
      },
    ],
  };
  const candidate = input.entryReferences;
  return guardEntryReferences(plan, {
    entryId: input.entryId,
    phase: "draft",
    references: candidate?.references ?? [],
    ...(candidate === undefined ? {} : { config: candidate }),
    previousDraftId: draftId,
    copyFromSnapshotId: publishedId,
    blockKeys,
  });
}

export function rejectRevertWrite(reason: RevertGuardMiss): never {
  if (typeof reason !== "string") return rejectReferenceWrite(reason);
  switch (reason) {
    case "missing":
      return failure("Content entry does not exist.");
    case "not-published":
      return notPublished();
    case "stale-publication":
      return revisionConflict("The published snapshot no longer matches the expected publication.");
    case "stale-draft":
      return revisionConflict("The draft revision no longer matches the expected revision.");
  }
}
