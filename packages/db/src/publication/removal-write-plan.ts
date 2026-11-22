import { invalidatePreviews } from "../write-plan/preview-invalidation.js";
import {
  decodeLinkImpactReceipt,
  decodeReferenceImpactReceipt,
  referenceImpactChanged,
} from "@lacecms/application";
import type {
  DeleteContentEntryInput,
  LinkImpactAcknowledgment,
  LinkImpactAction,
  LinkImpactEvidence,
  ReferenceImpactAcknowledgment,
  UnpublishContentEntryCommand,
} from "@lacecms/application";
import { DomainError } from "@lacecms/domain";
import type { ContentEntry } from "@lacecms/domain";
import { publicStateIncrementStatement } from "../write-plan/build-enqueue.js";
import { enqueueRequests } from "../write-plan/enqueue-events.js";
import { unpublicationScope } from "../content/snapshots.js";
import { linkRemovalCondition } from "../links/reader.js";
import {
  incomingUsageSql,
  LINK_IMPACT_EVIDENCE_SQL,
  REFERENCE_IMPACT_EVIDENCE_SQL,
} from "../links/impact-evidence.js";
import type { ImpactEvidenceRow } from "../links/impact-evidence.js";
import { BUMP_INTERNAL_LINK_GRAPH_SQL } from "../links/statements.js";
import { PUBLICATION_IDEMPOTENCY_TTL_MS } from "../shared/limits.js";
import type { WritePlan, WritePlanSql, WritePlanStatement } from "../write-plan/plan.js";
import {
  LIVE_IDEMPOTENCY_RECORD_SQL,
  NO_LIVE_IDEMPOTENCY_RECORD_SQL,
  deleteExpiredIdempotencyRecordStatement,
} from "./idempotency.js";

type RemovalMiss =
  | { readonly kind: "replay"; readonly requestHash: string; readonly responseJson: string }
  | { readonly kind: "missing" | "not_published" | "publication" | "revision" }
  | { readonly kind: "impact"; readonly error: DomainError };

type RemovalInput = {
  readonly entryId: string;
  readonly action: LinkImpactAction;
  readonly actorId: string;
  readonly acknowledgment: LinkImpactAcknowledgment | undefined;
  readonly referenceAcknowledgment?: ReferenceImpactAcknowledgment | undefined;
  readonly expectedPublished: string | null;
  readonly expectedRevision?: number;
};

function matchesReceiptScope(evidence: LinkImpactEvidence, input: RemovalInput): boolean {
  return (
    evidence.targetId === input.entryId &&
    evidence.action === input.action &&
    evidence.actorId === input.actorId
  );
}

function receiptGuard(evidence: LinkImpactEvidence): WritePlanSql {
  return {
    sql: `(select revision from content_link_state where singleton_key=1)=?
      and exists(select 1 from content_entries e join content_snapshots d on d.id=e.draft_snapshot_id
        where e.id=? and d.revision=? and e.published_snapshot_id is ?)`,
    params: [
      evidence.graphRevision,
      evidence.targetId,
      evidence.draftRevision,
      evidence.publishedSnapshotId,
    ],
  };
}

function urlImpactGuard(input: RemovalInput): WritePlanSql {
  if (input.acknowledgment === undefined)
    return {
      sql: `not exists(${incomingUsageSql("url", "published")})`,
      params: [input.entryId, input.entryId, input.action],
    };
  try {
    const evidence = decodeLinkImpactReceipt(input.acknowledgment.receipt);
    if (
      input.acknowledgment.acknowledgePublishedLinks === true &&
      matchesReceiptScope(evidence, input)
    )
      return receiptGuard(evidence);
  } catch {
    // Diagnostics classify the invalid receipt if admission misses.
  }
  return { sql: "0", params: [] };
}

function referenceReviewGuard(input: RemovalInput): WritePlanSql {
  if (input.action === "unpublish") return { sql: "1", params: [] };
  if (input.referenceAcknowledgment === undefined)
    return {
      sql: `not exists(${incomingUsageSql("reference", "draft")})`,
      params: [input.entryId, input.entryId],
    };
  try {
    const evidence = decodeReferenceImpactReceipt(input.referenceAcknowledgment.receipt);
    if (
      input.referenceAcknowledgment.acknowledgeDraftReferences === true &&
      matchesReceiptScope(evidence, input)
    )
      return receiptGuard(evidence);
  } catch {
    // Diagnostics classify the invalid receipt if admission misses.
  }
  return { sql: "0", params: [] };
}

function assertReferenceRemoval(row: ImpactEvidenceRow | undefined, input: RemovalInput): void {
  if (row?.has_published_usages === 1)
    throw new DomainError(
      "CONTENT_REFERENCES_IN_USE",
      "Published references use this entry. Remove or replace them and republish the sources.",
    );
  if (input.action === "unpublish") return;
  const acknowledgment = input.referenceAcknowledgment;
  if (acknowledgment === undefined) {
    if (row?.has_draft_usages === 1)
      throw new DomainError(
        "CONTENT_REFERENCE_REVIEW_REQUIRED",
        "Saved drafts reference this entry. Review and acknowledge the draft usages before deletion.",
      );
    return;
  }
  const evidence = decodeReferenceImpactReceipt(acknowledgment.receipt);
  if (
    acknowledgment.acknowledgeDraftReferences !== true ||
    !matchesReceiptScope(evidence, input) ||
    evidence.graphRevision !== row?.graph_revision ||
    evidence.draftRevision !== row.draft_revision ||
    evidence.publishedSnapshotId !== row.published_snapshot_id
  )
    throw referenceImpactChanged();
}

function guardParts(input: RemovalInput, replay?: { scope: string; key: string; now: number }) {
  const linkImpact = urlImpactGuard(input);
  const referenceReview = referenceReviewGuard(input);
  const blockers = incomingUsageSql("reference", "published");
  const publication = {
    sql: "exists(select 1 from content_entries e join content_snapshots d on d.id=e.draft_snapshot_id where e.id=? and e.published_snapshot_id is ?",
    params: [input.entryId, input.expectedPublished],
  };
  const revision =
    input.expectedRevision === undefined
      ? { sql: ")", params: [] }
      : { sql: " and d.revision=?)", params: [input.expectedRevision] };
  const noReplay =
    replay === undefined
      ? { sql: "1", params: [] }
      : { sql: NO_LIVE_IDEMPOTENCY_RECORD_SQL, params: [replay.scope, replay.key, replay.now] };
  return {
    admission: {
      sql: `${publication.sql}${revision.sql} and not exists(${blockers})
        and (${referenceReview.sql}) and (${linkImpact.sql}) and (${noReplay.sql})`,
      params: [
        ...publication.params,
        ...revision.params,
        input.entryId,
        input.entryId,
        ...referenceReview.params,
        ...linkImpact.params,
        ...noReplay.params,
      ],
    },
    diagnostics: {
      state: {
        sql: "select e.id,e.published_snapshot_id,d.revision as draft_revision from content_entries e left join content_snapshots d on d.id=e.draft_snapshot_id where e.id=?",
        params: [input.entryId],
      },
      impact: {
        sql: LINK_IMPACT_EVIDENCE_SQL,
        params: [input.entryId, input.entryId, input.action, input.entryId],
      },
      references: {
        sql: REFERENCE_IMPACT_EVIDENCE_SQL,
        params: [input.entryId, input.entryId, input.entryId, input.entryId, input.entryId],
      },
      ...(replay === undefined
        ? {}
        : {
            replay: {
              sql: LIVE_IDEMPOTENCY_RECORD_SQL,
              params: [replay.scope, replay.key, replay.now],
            },
          }),
    },
    diagnose: (rows: Readonly<Record<string, readonly unknown[]>>): RemovalMiss => {
      const prior = rows.replay?.[0] as { request_hash: string; response_json: string } | undefined;
      if (prior !== undefined)
        return {
          kind: "replay",
          requestHash: prior.request_hash,
          responseJson: prior.response_json,
        };
      const state = rows.state?.[0] as
        | { id: string; published_snapshot_id: string | null; draft_revision: number | null }
        | undefined;
      if (state === undefined) return { kind: "missing" };
      if (input.action === "unpublish" && state.published_snapshot_id === null)
        return { kind: "not_published" };
      if (state.published_snapshot_id !== input.expectedPublished) return { kind: "publication" };
      // Preserve removal evidence errors before the deletion revision conflict.
      const row = rows.impact?.[0] as ImpactEvidenceRow | undefined;
      try {
        assertReferenceRemoval(rows.references?.[0] as ImpactEvidenceRow | undefined, input);
        linkRemovalCondition(row, input.entryId, input.action, input.actorId, input.acknowledgment);
      } catch (error) {
        if (error instanceof DomainError) return { kind: "impact", error };
        throw error;
      }
      return { kind: "revision" };
    },
  };
}

export function unpublishWritePlan(
  input: UnpublishContentEntryCommand,
  entry: ContentEntry | null,
  eventIds: readonly string[],
): WritePlan<RemovalMiss> {
  const idem = input.idempotency;
  const scope = idem === undefined ? undefined : unpublicationScope(input.entryId, idem.actorId);
  const removal: RemovalInput = {
    entryId: input.entryId,
    action: "unpublish",
    actorId: input.unpublishedBy.id,
    acknowledgment: input.linkImpact,
    expectedPublished: input.expectedPublishedSnapshotId,
  };
  const guard = guardParts(
    removal,
    idem === undefined ? undefined : { scope: scope!, key: idem.key, now: input.unpublishedAt },
  );
  const committed =
    entry === null
      ? null
      : Object.freeze({
          draft: entry.draft,
          id: entry.id,
          model: entry.model,
        });
  return {
    ...guard,
    statements: (g) => {
      const s: WritePlanStatement[] = [
        {
          sql: `${BUMP_INTERNAL_LINK_GRAPH_SQL} and ${g.sql}`,
          params: [JSON.stringify([input.expectedPublishedSnapshotId]), ...g.params],
        },
        {
          checkpoint: "unpublish.route",
          sql: `delete from published_routes where entry_id=? and ${g.sql}`,
          params: [input.entryId, ...g.params],
        },
        {
          sql: `update content_entries set published_snapshot_id=null,updated_at=? where id=? and ${g.sql}`,
          params: [input.unpublishedAt, input.entryId, ...g.params],
          expectedChanges: 1,
        },
        publicStateIncrementStatement(g, input.unpublishedAt),
        ...enqueueRequests(input.events, eventIds, g).filter(
          (statement) => statement.slot !== "queue",
        ),
        {
          slot: "build",
          sql: "select coalesce((select version from published_state where singleton_key=1),0) as version",
          params: [],
        },
      ];
      if (idem !== undefined) {
        const expired = deleteExpiredIdempotencyRecordStatement(
          scope!,
          idem.key,
          input.unpublishedAt,
          g.sql,
        );
        s.push(
          { sql: expired.sql, params: [...expired.params, ...g.params] },
          {
            sql: `insert into idempotency_records (scope,key,request_hash,response_json,created_at,expires_at) select ?,?,?,?,?,? where ${g.sql}`,
            params: [
              scope,
              idem.key,
              idem.fingerprint,
              JSON.stringify(committed),
              input.unpublishedAt,
              input.unpublishedAt + PUBLICATION_IDEMPOTENCY_TTL_MS,
              ...g.params,
            ],
          },
        );
      }
      s.push({
        checkpoint: "unpublish.snapshot",
        sql: `delete from content_snapshots where id=? and ${g.sql}`,
        params: [input.expectedPublishedSnapshotId, ...g.params],
        expectedChanges: 1,
      });
      return s;
    },
  };
}

export function deleteEntryWritePlan(
  input: DeleteContentEntryInput,
  draftId: string | null,
  eventIds: readonly string[],
): WritePlan<RemovalMiss> {
  const expectedPublished = input.expectedPublishedSnapshotId ?? null;
  const removal: RemovalInput = {
    entryId: input.entryId,
    action: "delete",
    actorId: input.deletedBy.id,
    acknowledgment: input.linkImpact,
    referenceAcknowledgment: input.referenceImpact,
    expectedPublished,
    expectedRevision: input.expectedRevision,
  };
  const guard = guardParts(removal);
  return {
    ...guard,
    statements: (g) => {
      const s: WritePlanStatement[] = [];
      if (expectedPublished !== null) {
        s.push({
          checkpoint: "delete.route",
          sql: `delete from published_routes where entry_id=? and ${g.sql}`,
          params: [input.entryId, ...g.params],
        });
        s.push(publicStateIncrementStatement(g, input.deletedAt), {
          slot: "build",
          sql: "select coalesce((select version from published_state where singleton_key=1),0) as version",
          params: [],
        });
      }
      s.push(
        ...enqueueRequests(input.events, eventIds, g).filter(
          (statement) => statement.slot !== "queue",
        ),
      );
      s.push(
        {
          sql: `${BUMP_INTERNAL_LINK_GRAPH_SQL} and ${g.sql}`,
          params: [
            JSON.stringify([draftId, expectedPublished].filter((id) => id !== null)),
            ...g.params,
          ],
        },
        {
          checkpoint: "delete.entry",
          sql: `delete from content_entries where id=? and ${g.sql}`,
          params: [input.entryId, ...g.params],
          expectedChanges: 1,
        },
      );
      s.push(invalidatePreviews("entry", input.entryId, input.deletedAt, g));
      return s;
    },
  };
}

export function removalGuardResult(
  miss: RemovalMiss,
  action: LinkImpactAction,
  idempotency?: { readonly fingerprint: string },
): ContentEntry | never {
  switch (miss.kind) {
    case "replay":
      if (idempotency === undefined || miss.requestHash !== idempotency.fingerprint)
        throw new DomainError(
          "CONTENT_INVALID_STATE",
          "Unpublication idempotency key was reused with different input.",
        );
      return JSON.parse(miss.responseJson) as ContentEntry;
    case "missing":
      throw new DomainError("CONTENT_INVALID_STATE", "Content entry does not exist.");
    case "not_published":
      throw new DomainError("CONTENT_NOT_PUBLISHED", "The entry is not published.");
    case "publication":
      throw new DomainError(
        "CONTENT_REVISION_CONFLICT",
        action === "delete"
          ? "The publication state no longer matches the deletion guard."
          : "The published snapshot no longer matches the expected publication.",
      );
    case "impact":
      throw miss.error;
    case "revision":
      throw new DomainError(
        "CONTENT_REVISION_CONFLICT",
        "The draft revision no longer matches the deletion guard.",
      );
  }
}
