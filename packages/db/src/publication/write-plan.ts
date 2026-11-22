import { invalidatePreviews } from "../write-plan/preview-invalidation.js";
import { withPublishedProjection } from "@lacecms/application";
import type { PublishContentEntryCommand } from "@lacecms/application";
import { contentPublicPath, DomainError } from "@lacecms/domain";
import type { ContentEntry } from "@lacecms/domain";
import { publicStateIncrementStatement } from "../write-plan/build-enqueue.js";
import { enqueueRequests } from "../write-plan/enqueue-events.js";
import { BLOCK_COPY_COLUMNS_SQL } from "../content/blocks.js";
import {
  deleteSupersededSnapshotsStatement,
  publicationScope,
  snapshotValue,
} from "../content/snapshots.js";
import type { StoredSnapshot } from "../content/snapshots.js";
import {
  assertPublishedInternalLinkTargets,
  BUMP_INTERNAL_LINK_GRAPH_SQL,
  COPY_INTERNAL_LINKS_SQL,
  INVALID_PUBLISHED_LINK_TARGETS_SQL,
} from "../links/statements.js";
import type { InvalidPublishedLinkTargetRow } from "../links/statements.js";
import { storedRole } from "../shared/values.js";
import { PUBLICATION_IDEMPOTENCY_TTL_MS } from "../shared/limits.js";
import type { WritePlan, WritePlanStatement } from "../write-plan/plan.js";
import { guardEntryReferences, rejectReferenceWrite } from "../links/reference-admission.js";
import type { ReferenceMiss } from "../links/reference-admission.js";
import {
  LIVE_IDEMPOTENCY_RECORD_SQL,
  NO_LIVE_IDEMPOTENCY_RECORD_SQL,
  deleteExpiredIdempotencyRecordStatement,
} from "./idempotency.js";
import {
  INVALID_PROJECTED_LINK_TARGETS_SQL,
  projectedBlocksSql,
  projectedInternalLinksSql,
  projectedMediaReferencesSql,
  projectedPublicationRows,
} from "./projection.js";

type OriginalPublicationMiss =
  | { readonly kind: "replay"; readonly requestHash: string; readonly responseJson: string }
  | { readonly kind: "revision" }
  | { readonly kind: "links"; readonly rows: readonly InvalidPublishedLinkTargetRow[] }
  | { readonly kind: "route" };
export type PublicationGuardMiss = OriginalPublicationMiss | ReferenceMiss;

/** Predict the response whose JSON is stored atomically with publication. */
export function publicationResultEntry(
  entry: ContentEntry,
  input: PublishContentEntryCommand,
  role: string | undefined,
): ContentEntry {
  const draft = entry.draft;
  const snapshot: StoredSnapshot = {
    blocks: draft.blocks,
    createdAt: input.publishedAt,
    entryId: draft.entryId,
    fields: draft.fields,
    id: input.publishedSnapshotId,
    revision: draft.revision,
    ...(draft.seo === undefined ? {} : { seo: draft.seo }),
    ...(draft.slug === undefined ? {} : { slug: draft.slug }),
    title: draft.title,
    updatedAt: input.publishedAt,
    updatedBy: { id: input.publishedBy.id, role: storedRole(role) },
  };
  const result = Object.freeze({
    draft,
    id: entry.id,
    model: entry.model,
    published: snapshotValue(snapshot, "published"),
  });
  return input.projection === undefined || draft.revision !== input.expectedRevision
    ? result
    : withPublishedProjection(result, input.projection);
}

/** One admitted publication, including its snapshot, route, build and replay record. */
export function publishWritePlan(
  input: PublishContentEntryCommand,
  entry: ContentEntry,
  committed: ContentEntry,
  eventIds: readonly string[],
): WritePlan<PublicationGuardMiss> {
  const observed = entry.draft.revision === input.expectedRevision;
  const path = observed ? contentPublicPath(entry.model, entry.draft.slug) : undefined;
  const candidate = input.entryReferences;
  const projected =
    !observed || input.projection === undefined
      ? undefined
      : projectedPublicationRows(
          entry.draft.blocks.map((block) => block.key),
          input.projection,
          candidate?.references,
        );
  const link =
    projected === undefined
      ? {
          sql: INVALID_PUBLISHED_LINK_TARGETS_SQL,
          params: [entry.draft.id, entry.id, path ?? null],
        }
      : {
          sql: INVALID_PROJECTED_LINK_TARGETS_SQL,
          params: [projected.internalLinksJson, entry.id, path ?? null],
        };
  const idem = input.idempotency;
  const scope = idem === undefined ? undefined : publicationScope(entry.id, idem.actorId);
  const revision = observed
    ? {
        sql: "exists(select 1 from content_entries e join content_snapshots s on s.id=e.draft_snapshot_id where e.id=? and s.id=? and s.revision=?)",
        params: [entry.id, entry.draft.id, input.expectedRevision],
      }
    : { sql: "0", params: [] };
  const route =
    path === undefined
      ? { sql: "1", params: [] }
      : {
          sql: "not exists(select 1 from published_routes where path=? and entry_id<>?)",
          params: [path, entry.id],
        };
  const noReplay =
    idem === undefined
      ? { sql: "1", params: [] }
      : { sql: NO_LIVE_IDEMPOTENCY_RECORD_SQL, params: [scope, idem.key, input.publishedAt] };
  const diagnostics = {
    revision: { sql: `select ${revision.sql} as valid`, params: revision.params },
    links: link,
    route: { sql: `select ${route.sql} as valid`, params: route.params },
    ...(idem === undefined
      ? {}
      : {
          replay: {
            sql: LIVE_IDEMPOTENCY_RECORD_SQL,
            params: [scope, idem.key, input.publishedAt],
          },
        }),
  };
  const plan: WritePlan<OriginalPublicationMiss> = {
    admission: {
      sql: `(${noReplay.sql}) and (${revision.sql}) and not exists (${link.sql}) and (${route.sql})`,
      params: [...noReplay.params, ...revision.params, ...link.params, ...route.params],
    },
    diagnostics,
    diagnose: (rows) => {
      const prior = rows.replay?.[0] as { request_hash: string; response_json: string } | undefined;
      if (prior !== undefined)
        return {
          kind: "replay",
          requestHash: prior.request_hash,
          responseJson: prior.response_json,
        };
      if (!(rows.revision?.[0] as { valid: number } | undefined)?.valid)
        return { kind: "revision" };
      const bad = rows.links as readonly InvalidPublishedLinkTargetRow[];
      if (bad.length) return { kind: "links", rows: bad };
      return { kind: "route" };
    },
    statements: (g) => {
      const snapshot = input.publishedSnapshotId;
      const condition = {
        sql: `(${g.sql}) and exists(select 1 from content_snapshots where id=?)`,
        params: [...g.params, snapshot],
      };
      const s: WritePlanStatement[] = [
        {
          checkpoint: "publish.snapshot",
          expectedChanges: 1,
          sql: `insert into content_snapshots (id, entry_id, revision, slug, title, fields_json, seo_json, schema_version, created_at, updated_at, updated_by) select ?, s.entry_id, s.revision, s.slug, s.title, ${projected === undefined ? "s.fields_json" : "?"}, s.seo_json, s.schema_version, ?, ?, ? from content_snapshots s join content_entries e on e.draft_snapshot_id=s.id where e.id=? and s.id=? and s.revision=? and ${g.sql}`,
          params: [
            snapshot,
            ...(projected === undefined ? [] : [projected.fieldsJson]),
            input.publishedAt,
            input.publishedAt,
            input.publishedBy.id,
            entry.id,
            entry.draft.id,
            input.expectedRevision,
            ...g.params,
          ],
        },
        projected === undefined
          ? {
              checkpoint: "publish.blocks",
              sql: `insert into content_blocks (snapshot_id, ${BLOCK_COPY_COLUMNS_SQL}) select ?, ${BLOCK_COPY_COLUMNS_SQL} from content_blocks where snapshot_id=? and ${condition.sql}`,
              params: [snapshot, entry.draft.id, ...condition.params],
            }
          : {
              checkpoint: "publish.blocks",
              sql: projectedBlocksSql(condition.sql),
              params: [snapshot, projected.blockDataJson, entry.draft.id, ...condition.params],
            },
        {
          sql: `${BUMP_INTERNAL_LINK_GRAPH_SQL} and ${condition.sql}`,
          params: [
            JSON.stringify([
              entry.draft.id,
              ...(entry.published === undefined ? [] : [entry.published.id]),
            ]),
            ...condition.params,
          ],
        },
        projected === undefined
          ? {
              sql: `${COPY_INTERNAL_LINKS_SQL} and ${condition.sql}`,
              params: [snapshot, entry.draft.id, ...condition.params],
            }
          : {
              sql: projectedInternalLinksSql(condition.sql),
              params: [snapshot, projected.internalLinksJson, ...condition.params],
            },
        projected === undefined
          ? {
              checkpoint: "publish.references",
              sql: `insert into content_media_references (snapshot_id,source_key,field_path,media_id,created_at) select ?,source_key,field_path,media_id,created_at from content_media_references where snapshot_id=? and ${condition.sql}`,
              params: [snapshot, entry.draft.id, ...condition.params],
            }
          : {
              checkpoint: "publish.references",
              sql: projectedMediaReferencesSql(condition.sql),
              params: [
                snapshot,
                input.publishedAt,
                projected.mediaReferencesJson,
                ...condition.params,
              ],
            },
      ];
      if (path !== undefined)
        s.push(
          {
            checkpoint: "publish.route",
            sql: `delete from published_routes where entry_id=? and ${condition.sql}`,
            params: [entry.id, ...condition.params],
          },
          {
            sql: `insert into published_routes (path,entry_id,snapshot_id,updated_at) select ?,?,?,? where ${condition.sql}`,
            params: [path, entry.id, snapshot, input.publishedAt, ...condition.params],
          },
        );
      s.push({
        sql: `update content_entries set published_snapshot_id=?,updated_at=? where id=? and ${condition.sql}`,
        params: [snapshot, input.publishedAt, entry.id, ...condition.params],
        expectedChanges: 1,
      });
      s.push(
        invalidatePreviews("entry", input.entryId, input.publishedAt, condition),
        publicStateIncrementStatement(condition, input.publishedAt),
        ...enqueueRequests(input.events, eventIds, condition).filter(
          (statement) => statement.slot !== "queue",
        ),
        {
          slot: "build",
          sql: "select coalesce((select version from published_state where singleton_key=1),0) as version",
          params: [],
        },
      );
      if (idem !== undefined) {
        const expired = deleteExpiredIdempotencyRecordStatement(
          scope!,
          idem.key,
          input.publishedAt,
          condition.sql,
        );
        s.push(
          { sql: expired.sql, params: [...expired.params, ...condition.params] },
          {
            sql: `insert into idempotency_records (scope,key,request_hash,response_json,created_at,expires_at) select ?,?,?,?,?,? where ${condition.sql}`,
            params: [
              scope,
              idem.key,
              idem.fingerprint,
              JSON.stringify(committed),
              input.publishedAt,
              input.publishedAt + PUBLICATION_IDEMPOTENCY_TTL_MS,
              ...condition.params,
            ],
          },
        );
      }
      const superseded = deleteSupersededSnapshotsStatement(
        entry.id,
        entry.draft.id,
        snapshot,
        condition.sql,
      );
      s.push({ sql: superseded.sql, params: [...superseded.params, ...condition.params] });
      return s;
    },
  };
  return !observed || (candidate === undefined && projected !== undefined)
    ? plan
    : guardEntryReferences(plan, {
        entryId: entry.id,
        phase: "published",
        references: candidate?.references ?? [],
        ...(candidate === undefined ? {} : { config: candidate }),
        ...(projected === undefined ? { copyFromSnapshotId: entry.draft.id } : {}),
        blockKeys: entry.draft.blocks.map((block) => block.key),
      });
}

/** Applies stable precedence and portable errors to same-unit admission evidence. */
export function publicationGuardResult(
  input: PublishContentEntryCommand,
  entry: ContentEntry,
  miss: PublicationGuardMiss,
): import("@lacecms/application").PublishContentEntryResult {
  switch (miss.kind) {
    case "replay":
      if (input.idempotency === undefined || miss.requestHash !== input.idempotency.fingerprint)
        throw new DomainError(
          "CONTENT_INVALID_STATE",
          "Publication idempotency key was reused with different input.",
        );
      return {
        entry: JSON.parse(miss.responseJson) as ContentEntry,
        outcome: "replayed",
        status: "published",
      };
    case "revision":
      throw new DomainError(
        "CONTENT_REVISION_CONFLICT",
        "The draft revision no longer matches the expected revision.",
      );
    case "links":
      assertPublishedInternalLinkTargets(
        miss.rows,
        entry.draft.blocks.map((block) => block.key),
      );
      throw new DomainError("CONTENT_INVALID_STATE", "Publication guard failed.");
    case "route":
      throw new DomainError("CONTENT_ROUTE_CONFLICT", "The public path belongs to another entry.");
    case "reference-config":
    case "reference-conflict":
    case "reference-issues":
      return rejectReferenceWrite(miss);
  }
}
