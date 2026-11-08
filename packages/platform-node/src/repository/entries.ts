import type {
  ContentCommandResult,
  ContentEntryCommandPort,
  CreateContentEntryInput,
  PublishContentEntryCommand,
  PublishContentEntryResult,
  RevertContentDraftCommand,
  SaveCompleteDraftInput,
  UnpublishContentEntryCommand,
  UnpublishContentEntryResult,
} from "@lacecms/application";
import {
  INVALID_PUBLISHED_LINK_TARGETS_SQL,
  INVALID_PROJECTED_LINK_TARGETS_SQL,
  projectedBlocksSql,
  projectedInternalLinksSql,
  projectedMediaReferencesSql,
  projectedPublicationRows,
  assertPublishedInternalLinkTargets,
  copyInternalLinkDiffStatements,
  COPY_INTERNAL_LINKS_SQL,
  seoJson,
  PUBLICATION_IDEMPOTENCY_TTL_MS,
  BLOCK_COPY_COLUMNS_SQL,
  assertDraftPersistenceBounds,
  failure,
  copySnapshotBlocksSql,
  copySnapshotReferencesSql,
  DUPLICATE_SOURCE_REVISION_SQL,
  notPublished,
  revertDraftSnapshotSql,
  revisionConflict,
  unpublicationScope,
} from "@lacecms/db";
import {
  DomainError,
  contentSnapshotId,
  contentPublicPath,
  isSingletonKind,
} from "@lacecms/domain";
import type { ContentEntry } from "@lacecms/domain";
import { NodeRepositoryBase } from "./base.js";

/** Node content entry creation, draft saves, publication, reversion and deletion. */
export class NodeEntryCommands extends NodeRepositoryBase implements ContentEntryCommandPort {
  public async create(input: CreateContentEntryInput): Promise<ContentCommandResult> {
    const { draft, id, model } = input.entry;
    assertDraftPersistenceBounds(draft.blocks, input.mediaReferences);
    try {
      this.connection.transaction(() => {
        if (input.duplicateOf !== undefined) {
          const source = this.connection
            .prepare(DUPLICATE_SOURCE_REVISION_SQL)
            .get(input.duplicateOf.entryId) as { readonly revision: number } | undefined;
          if (source === undefined) failure("Content entry does not exist.");
          if (source.revision !== input.duplicateOf.expectedRevision) {
            revisionConflict("The source draft revision no longer matches the duplicate guard.");
          }
        }
        const version = this.connection
          .prepare("select config_version from content_models where key = ?")
          .get(model.key) as { readonly config_version: number } | undefined;
        if (version === undefined) failure(`Content model ${model.key} does not exist.`);
        this.connection
          .prepare(
            "insert into content_entries (id, model_key, singleton_key, created_by, created_at, updated_at) values (?, ?, ?, ?, ?, ?)",
          )
          .run(
            id,
            model.key,
            isSingletonKind(model.kind) ? 1 : null,
            draft.updatedBy.id,
            draft.createdAt,
            draft.updatedAt,
          );
        this.insertSnapshot(draft, version.config_version);
        this.insertBlocks(draft);
        this.insertReferences(draft.id, input.mediaReferences, draft.updatedAt);
        this.replaceInternalLinks(draft.id, input.internalLinks ?? []);
        this.connection
          .prepare("update content_entries set draft_snapshot_id = ? where id = ?")
          .run(draft.id, id);
      })();
    } catch (error) {
      this.throwWriteError(error, isSingletonKind(model.kind));
    }
    const entry = this.loadEntry(id);
    if (entry === null) failure("Created content entry could not be reloaded.");
    return { entry, status: "created" };
  }

  public async saveCompleteDraft(input: SaveCompleteDraftInput): Promise<ContentCommandResult> {
    assertDraftPersistenceBounds(input.mutation.blocks, input.mutation.mediaReferences);
    const existing = this.entryRow(input.entryId);
    if (existing === undefined || existing.draft_snapshot_id === null) {
      failure("Content entry does not have a mutable draft.");
    }
    const draftSnapshotId = existing.draft_snapshot_id;
    try {
      this.connection.transaction(() => {
        const changed = this.connection
          .prepare(
            "update content_snapshots set revision = revision + 1, slug = ?, title = ?, fields_json = ?, seo_json = ?, updated_at = ?, updated_by = ? where id = ? and revision = ?",
          )
          .run(
            input.mutation.slug ?? null,
            input.mutation.title,
            JSON.stringify(input.mutation.fields),
            seoJson(input.mutation.seo),
            input.mutation.updatedAt,
            input.mutation.updatedBy.id,
            draftSnapshotId,
            input.mutation.expectedRevision,
          );
        if (changed.changes !== 1) {
          throw new DomainError(
            "CONTENT_REVISION_CONFLICT",
            "The draft revision no longer matches the expected revision.",
          );
        }
        this.connection
          .prepare("delete from content_blocks where snapshot_id = ?")
          .run(draftSnapshotId);
        this.connection
          .prepare("delete from content_media_references where snapshot_id = ?")
          .run(draftSnapshotId);
        this.insertBlocks({ ...input.mutation, id: contentSnapshotId(draftSnapshotId) });
        this.insertReferences(
          draftSnapshotId,
          input.mutation.mediaReferences,
          input.mutation.updatedAt,
        );
        this.replaceInternalLinks(draftSnapshotId, input.internalLinks ?? []);
        this.connection
          .prepare("update content_entries set updated_at = ? where id = ?")
          .run(input.mutation.updatedAt, input.entryId);
      })();
    } catch (error) {
      this.throwWriteError(error, false);
    }
    const entry = this.loadEntry(input.entryId);
    if (entry === null) failure("Saved content entry could not be reloaded.");
    return { entry, status: "saved" };
  }

  public async publish(input: PublishContentEntryCommand): Promise<PublishContentEntryResult> {
    const entry = this.loadEntry(input.entryId);
    if (entry === null) failure("Content entry does not exist.");
    const path = contentPublicPath(entry.model, entry.draft.slug);
    const scope =
      input.idempotency === undefined
        ? undefined
        : `publication:${input.entryId}:${input.idempotency.actorId}`;
    try {
      const result = this.connection.transaction(() => {
        if (input.idempotency !== undefined) {
          if (input.idempotency.actorId !== input.publishedBy.id)
            failure("Publication idempotency actor must match publisher.");
          const prior = this.connection
            .prepare(
              "select request_hash, response_json from idempotency_records where scope = ? and key = ?",
            )
            .get(scope, input.idempotency.key) as
            | { request_hash: string; response_json: string }
            | undefined;
          if (prior !== undefined) {
            if (prior.request_hash !== input.idempotency.fingerprint)
              failure("Publication idempotency key was reused with different input.");
            return {
              entry: JSON.parse(prior.response_json) as ContentEntry,
              outcome: "replayed" as const,
              status: "published" as const,
            };
          }
        }
        // A projection replaces the copied fields, block data and references (conditional fields).
        const projected =
          input.projection === undefined
            ? undefined
            : projectedPublicationRows(
                entry.draft.blocks.map((block) => block.key),
                input.projection,
              );
        assertPublishedInternalLinkTargets(
          (projected === undefined
            ? this.connection
                .prepare(INVALID_PUBLISHED_LINK_TARGETS_SQL)
                .all(entry.draft.id, entry.id, path ?? null)
            : this.connection
                .prepare(INVALID_PROJECTED_LINK_TARGETS_SQL)
                .all(
                  projected.internalLinksJson,
                  entry.id,
                  path ?? null,
                )) as readonly import("@lacecms/db").InvalidPublishedLinkTargetRow[],
          entry.draft.blocks.map((block) => block.key),
        );
        this.checkpoint("publish.snapshot");
        const copied = this.connection
          .prepare(
            `insert into content_snapshots (id, entry_id, revision, slug, title, fields_json, seo_json, schema_version, created_at, updated_at, updated_by) select ?, s.entry_id, s.revision, s.slug, s.title, ${projected === undefined ? "s.fields_json" : "?"}, s.seo_json, s.schema_version, ?, ?, ? from content_snapshots s join content_entries e on e.draft_snapshot_id = s.id where e.id = ? and s.revision = ?`,
          )
          .run(
            input.publishedSnapshotId,
            ...(projected === undefined ? [] : [projected.fieldsJson]),
            input.publishedAt,
            input.publishedAt,
            input.publishedBy.id,
            input.entryId,
            input.expectedRevision,
          );
        if (copied.changes !== 1)
          throw new DomainError(
            "CONTENT_REVISION_CONFLICT",
            "The draft revision no longer matches the expected revision.",
          );
        this.checkpoint("publish.blocks");
        if (projected === undefined)
          this.connection
            .prepare(
              `insert into content_blocks (snapshot_id, ${BLOCK_COPY_COLUMNS_SQL}) select ?, ${BLOCK_COPY_COLUMNS_SQL} from content_blocks where snapshot_id = ?`,
            )
            .run(input.publishedSnapshotId, entry.draft.id);
        else
          this.connection
            .prepare(projectedBlocksSql())
            .run(input.publishedSnapshotId, projected.blockDataJson, entry.draft.id);
        this.bumpLinkGraph([
          entry.draft.id,
          ...(entry.published === undefined ? [] : [entry.published.id]),
        ]);
        if (projected === undefined)
          this.connection
            .prepare(COPY_INTERNAL_LINKS_SQL)
            .run(input.publishedSnapshotId, entry.draft.id);
        else
          this.connection
            .prepare(projectedInternalLinksSql())
            .run(input.publishedSnapshotId, projected.internalLinksJson);
        this.checkpoint("publish.references");
        if (projected === undefined)
          this.connection
            .prepare(
              "insert into content_media_references (snapshot_id, source_key, field_path, media_id, created_at) select ?, source_key, field_path, media_id, created_at from content_media_references where snapshot_id = ?",
            )
            .run(input.publishedSnapshotId, entry.draft.id);
        else
          this.connection
            .prepare(projectedMediaReferencesSql())
            .run(input.publishedSnapshotId, input.publishedAt, projected.mediaReferencesJson);
        // A global has no route; its publication only replaces the snapshot.
        if (path !== undefined) {
          this.checkpoint("publish.route");
          this.connection
            .prepare("delete from published_routes where entry_id = ?")
            .run(input.entryId);
          this.connection
            .prepare(
              "insert into published_routes (path, entry_id, snapshot_id, updated_at) values (?, ?, ?, ?)",
            )
            .run(path, input.entryId, input.publishedSnapshotId, input.publishedAt);
        }
        this.connection
          .prepare(
            "update content_entries set published_snapshot_id = ?, updated_at = ? where id = ?",
          )
          .run(input.publishedSnapshotId, input.publishedAt, input.entryId);
        const targetVersion = this.bumpPublicState(
          input.publishedAt,
          input.publishedBy.id,
          input.publishedSnapshotId,
          "publication",
        );
        const committed = this.loadEntry(input.entryId);
        if (committed === null) failure("Published content entry could not be reloaded.");
        if (input.idempotency !== undefined)
          this.connection
            .prepare(
              "insert into idempotency_records (scope, key, request_hash, response_json, created_at, expires_at) values (?, ?, ?, ?, ?, ?)",
            )
            .run(
              scope,
              input.idempotency.key,
              input.idempotency.fingerprint,
              JSON.stringify(committed),
              input.publishedAt,
              input.publishedAt + PUBLICATION_IDEMPOTENCY_TTL_MS,
            );
        if (entry.published !== undefined)
          this.connection
            .prepare("delete from content_snapshots where id = ?")
            .run(entry.published.id);
        return {
          entry: committed,
          outcome: "published" as const,
          status: "published" as const,
          targetVersion,
        };
      })();
      return result;
    } catch (error) {
      this.throwWriteError(error, false);
    }
  }

  public async unpublish(
    input: UnpublishContentEntryCommand,
  ): Promise<UnpublishContentEntryResult> {
    const idempotency = input.idempotency;
    const scope =
      idempotency === undefined
        ? undefined
        : unpublicationScope(input.entryId, idempotency.actorId);
    try {
      return this.connection.transaction((): UnpublishContentEntryResult => {
        if (idempotency !== undefined) {
          if (idempotency.actorId !== input.unpublishedBy.id)
            failure("Unpublication idempotency actor must match the unpublishing actor.");
          const prior = this.connection
            .prepare(
              "select request_hash, response_json from idempotency_records where scope = ? and key = ?",
            )
            .get(scope, idempotency.key) as
            | { request_hash: string; response_json: string }
            | undefined;
          if (prior !== undefined) {
            if (prior.request_hash !== idempotency.fingerprint)
              failure("Unpublication idempotency key was reused with different input.");
            return {
              entry: JSON.parse(prior.response_json) as ContentEntry,
              outcome: "replayed",
              status: "unpublished",
            };
          }
        }
        const entry = this.entryRow(input.entryId);
        if (entry === undefined) failure("Content entry does not exist.");
        if (entry.published_snapshot_id === null) notPublished();
        if (entry.published_snapshot_id !== input.expectedPublishedSnapshotId) {
          revisionConflict("The published snapshot no longer matches the expected publication.");
        }
        this.checkLinkRemoval(input.entryId, "unpublish", input.unpublishedBy.id, input.linkImpact);
        this.bumpLinkGraph([input.expectedPublishedSnapshotId]);
        this.checkpoint("unpublish.route");
        this.connection
          .prepare("delete from published_routes where entry_id = ?")
          .run(input.entryId);
        this.connection
          .prepare(
            "update content_entries set published_snapshot_id = null, updated_at = ? where id = ?",
          )
          .run(input.unpublishedAt, input.entryId);
        const targetVersion = this.bumpPublicState(
          input.unpublishedAt,
          input.unpublishedBy.id,
          input.expectedPublishedSnapshotId,
          "publication",
        );
        const committed = this.loadEntry(input.entryId);
        if (committed === null) failure("Unpublished content entry could not be reloaded.");
        if (idempotency !== undefined)
          this.connection
            .prepare(
              "insert into idempotency_records (scope, key, request_hash, response_json, created_at, expires_at) values (?, ?, ?, ?, ?, ?)",
            )
            .run(
              scope,
              idempotency.key,
              idempotency.fingerprint,
              JSON.stringify(committed),
              input.unpublishedAt,
              input.unpublishedAt + PUBLICATION_IDEMPOTENCY_TTL_MS,
            );
        this.checkpoint("unpublish.snapshot");
        this.connection
          .prepare("delete from content_snapshots where id = ?")
          .run(input.expectedPublishedSnapshotId);
        return { entry: committed, outcome: "unpublished", status: "unpublished", targetVersion };
      })();
    } catch (error) {
      this.throwWriteError(error, false);
    }
  }

  public async revertDraft(input: RevertContentDraftCommand): Promise<ContentCommandResult> {
    try {
      this.connection.transaction(() => {
        const entry = this.entryRow(input.entryId);
        if (entry === undefined || entry.draft_snapshot_id === null) {
          failure("Content entry does not exist.");
        }
        if (entry.published_snapshot_id === null) notPublished();
        if (entry.published_snapshot_id !== input.expectedPublishedSnapshotId) {
          revisionConflict("The published snapshot no longer matches the expected publication.");
        }
        const draftId = entry.draft_snapshot_id;
        const publishedId = entry.published_snapshot_id;
        this.checkpoint("revert.draft");
        const changed = this.connection
          .prepare(revertDraftSnapshotSql("content_snapshots.revision = ?"))
          .run(input.revertedAt, input.revertedBy.id, publishedId, draftId, input.expectedRevision);
        if (changed.changes !== 1) {
          revisionConflict("The draft revision no longer matches the expected revision.");
        }
        this.connection.prepare("delete from content_blocks where snapshot_id = ?").run(draftId);
        this.connection
          .prepare("delete from content_media_references where snapshot_id = ?")
          .run(draftId);
        this.checkpoint("revert.blocks");
        this.connection.prepare(copySnapshotBlocksSql()).run(draftId, publishedId);
        this.connection.prepare(copySnapshotReferencesSql()).run(draftId, publishedId);
        this.checkpoint("revert.internal-links");
        for (const statement of copyInternalLinkDiffStatements(draftId, publishedId))
          this.connection.prepare(statement.sql).run(...statement.params);
        this.checkpoint("revert.published");
        this.connection
          .prepare("update content_snapshots set revision = ? where id = ?")
          .run(input.expectedRevision + 1, publishedId);
        this.connection
          .prepare("update content_entries set updated_at = ? where id = ?")
          .run(input.revertedAt, input.entryId);
      })();
    } catch (error) {
      this.throwWriteError(error, false);
    }
    const entry = this.loadEntry(input.entryId);
    if (entry === null) failure("Reverted content entry could not be reloaded.");
    return { entry, status: "reverted" };
  }

  public async delete(
    input: import("@lacecms/application").DeleteContentEntryInput,
  ): Promise<ContentCommandResult> {
    try {
      this.connection.transaction(() => {
        const entry = this.entryRow(input.entryId);
        if (entry === undefined) failure("Content entry does not exist.");
        const expectedPublishedSnapshotId = input.expectedPublishedSnapshotId ?? null;
        if (entry.published_snapshot_id !== expectedPublishedSnapshotId) {
          throw new DomainError(
            "CONTENT_REVISION_CONFLICT",
            "The publication state no longer matches the deletion guard.",
          );
        }
        this.checkLinkRemoval(input.entryId, "delete", input.deletedBy.id, input.linkImpact);
        if (entry.published_snapshot_id !== null) {
          this.checkpoint("delete.route");
          this.connection
            .prepare("delete from published_routes where entry_id = ?")
            .run(input.entryId);
          this.bumpPublicState(
            input.deletedAt,
            input.deletedBy.id,
            entry.published_snapshot_id,
            "publication",
          );
        }
        this.bumpLinkGraph(
          [entry.draft_snapshot_id, entry.published_snapshot_id].filter(
            (id): id is string => id !== null,
          ),
        );
        this.checkpoint("delete.entry");
        const deleted = this.connection
          .prepare(
            "delete from content_entries where id = ? and published_snapshot_id is ? and exists (select 1 from content_snapshots where id = content_entries.draft_snapshot_id and revision = ?)",
          )
          .run(input.entryId, expectedPublishedSnapshotId, input.expectedRevision);
        if (deleted.changes !== 1) {
          throw new DomainError(
            "CONTENT_REVISION_CONFLICT",
            "The draft revision no longer matches the deletion guard.",
          );
        }
      })();
    } catch (error) {
      this.throwWriteError(error, false);
    }
    return { status: "deleted" };
  }
}
