import { decodeLinkImpactReceipt } from "@lacecms/application";
import type {
  DeleteContentEntryInput,
  LinkImpactAcknowledgment,
  LinkImpactAction,
  UnpublishContentEntryCommand,
} from "@lacecms/application";
import { DomainError } from "@lacecms/domain";
import type { ContentEntry } from "@lacecms/domain";
import { publicStateIncrementStatement } from "../write-plan/build-enqueue.js";
import { enqueueRequests } from "../write-plan/enqueue-events.js";
import { unpublicationScope } from "../content/snapshots.js";
import { LINK_IMPACT_EVIDENCE_SQL, linkRemovalCondition } from "../links/reader.js";
import type { ImpactEvidenceRow } from "../links/reader.js";
import { BUMP_INTERNAL_LINK_GRAPH_SQL } from "../links/statements.js";
import { PUBLICATION_IDEMPOTENCY_TTL_MS } from "../shared/limits.js";
import type { WritePlan, WritePlanStatement } from "../write-plan/plan.js";
import {
  LIVE_IDEMPOTENCY_RECORD_SQL,
  NO_LIVE_IDEMPOTENCY_RECORD_SQL,
  deleteExpiredIdempotencyRecordStatement,
} from "./idempotency.js";

type RemovalMiss =
  | { readonly kind: "replay"; readonly requestHash: string; readonly responseJson: string }
  | { readonly kind: "missing" | "not_published" | "publication" | "revision" }
  | { readonly kind: "impact"; readonly row: ImpactEvidenceRow | undefined };

type RemovalInput = {
  readonly entryId: string;
  readonly action: LinkImpactAction;
  readonly actorId: string;
  readonly acknowledgment: LinkImpactAcknowledgment | undefined;
  readonly expectedPublished: string | null;
  readonly expectedRevision?: number;
};

function impactGuard(input: RemovalInput): { sql: string; params: readonly unknown[] } {
  if (input.acknowledgment !== undefined) {
    let evidence: ReturnType<typeof decodeLinkImpactReceipt>;
    try {
      evidence = decodeLinkImpactReceipt(input.acknowledgment.receipt);
    } catch {
      return { sql: "0", params: [] };
    }
    if (
      input.acknowledgment.acknowledgePublishedLinks !== true ||
      evidence.targetId !== input.entryId ||
      evidence.action !== input.action ||
      evidence.actorId !== input.actorId
    )
      return { sql: "0", params: [] };
    return {
      sql: `(select revision from content_link_state where singleton_key=1)=? and exists(select 1 from content_entries e join content_snapshots d on d.id=e.draft_snapshot_id where e.id=? and d.revision=? and e.published_snapshot_id is ?)`,
      params: [
        evidence.graphRevision,
        input.entryId,
        evidence.draftRevision,
        evidence.publishedSnapshotId,
      ],
    };
  }
  return {
    sql: `not exists(select 1 from content_entry_link_references r join content_snapshots s on s.id=r.snapshot_id join content_entries e on e.id=s.entry_id and e.published_snapshot_id=s.id where r.target_entry_id=? and r.delivered=1 and not (e.id=? and (?='delete' or e.published_snapshot_id=s.id)))`,
    params: [input.entryId, input.entryId, input.action],
  };
}

function guardParts(input: RemovalInput, replay?: { scope: string; key: string; now: number }) {
  const impact = impactGuard(input);
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
      sql: `${publication.sql}${revision.sql} and (${impact.sql}) and (${noReplay.sql})`,
      params: [...publication.params, ...revision.params, ...impact.params, ...noReplay.params],
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
        linkRemovalCondition(row, input.entryId, input.action, input.actorId, input.acknowledgment);
      } catch {
        return { kind: "impact", row };
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
      return s;
    },
  };
}

export function removalGuardResult(
  miss: RemovalMiss,
  input: RemovalInput,
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
        input.action === "delete"
          ? "The publication state no longer matches the deletion guard."
          : "The published snapshot no longer matches the expected publication.",
      );
    case "impact":
      linkRemovalCondition(
        miss.row,
        input.entryId,
        input.action,
        input.actorId,
        input.acknowledgment,
      );
      throw new DomainError("CONTENT_INVALID_STATE", "Removal guard failed.");
    case "revision":
      throw new DomainError(
        "CONTENT_REVISION_CONFLICT",
        "The draft revision no longer matches the deletion guard.",
      );
  }
}
