import { withPublishedProjection } from "@lacecms/application";
import type {
  ContentCommandResult,
  ContentEntryCommandPort,
  CreateContentEntryInput,
  DeleteContentEntryInput,
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
  BUMP_INTERNAL_LINK_GRAPH_SQL,
  PUBLICATION_IDEMPOTENCY_TTL_MS,
  BLOCK_COPY_COLUMNS_SQL,
  assertDraftPersistenceBounds,
  failure,
  copySnapshotBlocksSql,
  copySnapshotReferencesSql,
  DUPLICATE_SOURCE_REVISION_SQL,
  notPublished,
  revertDraftSnapshotSql,
  unpublicationScope,
  seoJson,
  revisionConflict,
  snapshotValue,
  storedRole,
} from "@lacecms/db";
import type { StoredSnapshot } from "@lacecms/db";
import { contentPublicPath, isSingletonKind } from "@lacecms/domain";
import type { ContentEntry } from "@lacecms/domain";
import { GUARD_SQL } from "./batch.js";
import type { Condition } from "./batch.js";
import { D1RepositoryBase } from "./base.js";

/** D1 content entry creation, draft saves, publication, reversion and deletion. */
export class D1EntryCommands extends D1RepositoryBase implements ContentEntryCommandPort {
  public async create(input: CreateContentEntryInput): Promise<ContentCommandResult> {
    const { draft, id, model } = input.entry;
    assertDraftPersistenceBounds(draft.blocks, input.mediaReferences);
    const version = await this.first<{ readonly config_version: number }>(
      "select config_version from content_models where key = ?",
      model.key,
    );
    if (version === undefined) failure(`Content model ${model.key} does not exist.`);
    const batch = this.batch();
    const source = input.duplicateOf;
    const token =
      source === undefined
        ? undefined
        : this.guard(batch, draft.createdAt, {
            params: [source.entryId, source.expectedRevision],
            sql: "exists (select 1 from content_entries e join content_snapshots d on d.id = e.draft_snapshot_id where e.id = ? and d.revision = ?)",
          });
    const guarded = token === undefined ? "" : `where ${GUARD_SQL}`;
    batch.add(
      `insert into content_entries (id, model_key, singleton_key, created_by, created_at, updated_at) select ?, ?, ?, ?, ?, ? ${guarded}`,
      id,
      model.key,
      isSingletonKind(model.kind) ? 1 : null,
      draft.updatedBy.id,
      draft.createdAt,
      draft.updatedAt,
      ...(token === undefined ? [] : [token]),
    );
    this.addSnapshotInsert(batch, draft, version.config_version, token);
    this.addBlockInserts(batch, draft.id, draft.updatedAt, draft.blocks, token);
    this.addReferenceInserts(batch, draft.id, draft.updatedAt, input.mediaReferences, token);
    this.addInternalLinkDiff(batch, draft.id, input.internalLinks ?? [], token);
    batch.add(
      `update content_entries set draft_snapshot_id = ? where id = ? ${token === undefined ? "" : `and ${GUARD_SQL}`}`,
      draft.id,
      id,
      ...(token === undefined ? [] : [token]),
    );
    if (token !== undefined) this.releaseGuard(batch, token);
    const results = await this.execute(batch, isSingletonKind(model.kind));
    if (source !== undefined && results[0]!.meta.changes !== 1) {
      const current = await this.first<{ readonly revision: number }>(
        DUPLICATE_SOURCE_REVISION_SQL,
        source.entryId,
      );
      if (current === undefined) failure("Content entry does not exist.");
      revisionConflict("The source draft revision no longer matches the duplicate guard.");
    }
    const entry = await this.reader.loadEntry(id);
    if (entry === null) failure("Created content entry could not be reloaded.");
    return { entry, status: "created" };
  }

  public async saveCompleteDraft(input: SaveCompleteDraftInput): Promise<ContentCommandResult> {
    const { mutation } = input;
    assertDraftPersistenceBounds(mutation.blocks, mutation.mediaReferences);
    const existing = await this.entryRow(input.entryId);
    if (existing === undefined || existing.draft_snapshot_id === null) {
      failure("Content entry does not have a mutable draft.");
    }
    const draftId = existing.draft_snapshot_id;
    const batch = this.batch();
    const token = this.guard(batch, mutation.updatedAt, {
      params: [input.entryId, draftId, mutation.expectedRevision],
      sql: "exists (select 1 from content_snapshots s join content_entries e on e.draft_snapshot_id = s.id where e.id = ? and s.id = ? and s.revision = ?)",
    });
    batch.add(`delete from content_blocks where snapshot_id = ? and ${GUARD_SQL}`, draftId, token);
    batch.add(
      `delete from content_media_references where snapshot_id = ? and ${GUARD_SQL}`,
      draftId,
      token,
    );
    this.addBlockInserts(batch, draftId, mutation.updatedAt, mutation.blocks, token);
    this.addReferenceInserts(batch, draftId, mutation.updatedAt, mutation.mediaReferences, token);
    this.addInternalLinkDiff(batch, draftId, input.internalLinks ?? [], token);
    batch.add(
      `update content_entries set updated_at = ? where id = ? and ${GUARD_SQL}`,
      mutation.updatedAt,
      input.entryId,
      token,
    );
    batch.add(
      `update content_snapshots set revision = revision + 1, slug = ?, title = ?, fields_json = ?, seo_json = ?, updated_at = ?, updated_by = ? where id = ? and ${GUARD_SQL}`,
      mutation.slug ?? null,
      mutation.title,
      JSON.stringify(mutation.fields),
      seoJson(mutation.seo),
      mutation.updatedAt,
      mutation.updatedBy.id,
      draftId,
      token,
    );
    this.releaseGuard(batch, token);
    const results = await this.execute(batch, false);
    if (results[0]!.meta.changes !== 1) {
      revisionConflict("The draft revision no longer matches the expected revision.");
    }
    const entry = await this.reader.loadEntry(input.entryId);
    if (entry === null) failure("Saved content entry could not be reloaded.");
    return { entry, status: "saved" };
  }

  public async publish(input: PublishContentEntryCommand): Promise<PublishContentEntryResult> {
    const entry = await this.reader.loadEntry(input.entryId);
    if (entry === null) failure("Content entry does not exist.");
    const path = contentPublicPath(entry.model, entry.draft.slug);
    const idempotency = input.idempotency;
    const scope =
      idempotency === undefined ? undefined : `publication:${input.entryId}:${idempotency.actorId}`;
    if (idempotency !== undefined) {
      if (idempotency.actorId !== input.publishedBy.id)
        failure("Publication idempotency actor must match publisher.");
      const replay = await this.replayPublication(scope!, idempotency);
      if (replay !== null) return replay;
    }
    if (entry.draft.revision !== input.expectedRevision) {
      revisionConflict("The draft revision no longer matches the expected revision.");
    }
    const publisher = await this.first<{ readonly role: string }>(
      "select role from user where id = ?",
      input.publishedBy.id,
    );
    // A projection replaces the copied fields, block data and references (conditional fields).
    const projected =
      input.projection === undefined
        ? undefined
        : projectedPublicationRows(
            entry.draft.blocks.map((block) => block.key),
            input.projection,
          );
    const copiedEntry = this.publishedEntry(entry, input, publisher?.role);
    const committed =
      input.projection === undefined
        ? copiedEntry
        : withPublishedProjection(copiedEntry, input.projection);
    const newId = input.publishedSnapshotId;
    const draftId = entry.draft.id;
    const linkGuard =
      projected === undefined
        ? {
            sql: INVALID_PUBLISHED_LINK_TARGETS_SQL,
            params: [draftId, input.entryId, path ?? null],
          }
        : {
            sql: INVALID_PROJECTED_LINK_TARGETS_SQL,
            params: [projected.internalLinksJson, input.entryId, path ?? null],
          };
    const exists: Condition = {
      params: [newId],
      sql: "exists (select 1 from content_snapshots where id = ?)",
    };
    const batch = this.batch();
    batch.checkpoint("publish.snapshot");
    const snapshotIndex = batch.add(
      `insert into content_snapshots (id, entry_id, revision, slug, title, fields_json, seo_json, schema_version, created_at, updated_at, updated_by)
       select ?, s.entry_id, s.revision, s.slug, s.title, ${projected === undefined ? "s.fields_json" : "?"}, s.seo_json, s.schema_version, ?, ?, ?
         from content_snapshots s join content_entries e on e.draft_snapshot_id = s.id
        where e.id = ? and s.id = ? and s.revision = ?
          and not exists (${linkGuard.sql})
          ${idempotency === undefined ? "" : "and not exists (select 1 from idempotency_records where scope = ? and key = ?)"}`,
      newId,
      ...(projected === undefined ? [] : [projected.fieldsJson]),
      input.publishedAt,
      input.publishedAt,
      input.publishedBy.id,
      input.entryId,
      draftId,
      input.expectedRevision,
      ...linkGuard.params,
      ...(idempotency === undefined ? [] : [scope, idempotency.key]),
    );
    batch.checkpoint("publish.blocks");
    if (projected === undefined)
      batch.add(
        `insert into content_blocks (snapshot_id, ${BLOCK_COPY_COLUMNS_SQL})
       select ?, ${BLOCK_COPY_COLUMNS_SQL}
         from content_blocks where snapshot_id = ? and ${exists.sql}`,
        newId,
        draftId,
        ...exists.params,
      );
    else
      batch.add(
        projectedBlocksSql(exists.sql),
        newId,
        projected.blockDataJson,
        draftId,
        ...exists.params,
      );
    batch.add(
      `${BUMP_INTERNAL_LINK_GRAPH_SQL} and ${exists.sql}`,
      JSON.stringify([draftId, ...(entry.published === undefined ? [] : [entry.published.id])]),
      ...exists.params,
    );
    if (projected === undefined)
      batch.add(`${COPY_INTERNAL_LINKS_SQL} and ${exists.sql}`, newId, draftId, ...exists.params);
    else
      batch.add(
        projectedInternalLinksSql(exists.sql),
        newId,
        projected.internalLinksJson,
        ...exists.params,
      );
    batch.checkpoint("publish.references");
    if (projected === undefined)
      batch.add(
        `insert into content_media_references (snapshot_id, source_key, field_path, media_id, created_at)
       select ?, source_key, field_path, media_id, created_at
         from content_media_references where snapshot_id = ? and ${exists.sql}`,
        newId,
        draftId,
        ...exists.params,
      );
    else
      batch.add(
        projectedMediaReferencesSql(exists.sql),
        newId,
        input.publishedAt,
        projected.mediaReferencesJson,
        ...exists.params,
      );
    // A global has no route; its publication only replaces the snapshot.
    if (path !== undefined) {
      batch.checkpoint("publish.route");
      batch.add(
        `delete from published_routes where entry_id = ? and ${exists.sql}`,
        input.entryId,
        ...exists.params,
      );
      batch.add(
        `insert into published_routes (path, entry_id, snapshot_id, updated_at) select ?, ?, ?, ? where ${exists.sql}`,
        path,
        input.entryId,
        newId,
        input.publishedAt,
        ...exists.params,
      );
    }
    batch.add(
      `update content_entries set published_snapshot_id = ?, updated_at = ? where id = ? and ${exists.sql}`,
      newId,
      input.publishedAt,
      input.entryId,
      ...exists.params,
    );
    const state = this.addPublicStateBump(batch, exists, {
      reason: "publication",
      requestedAt: input.publishedAt,
      requestedBy: input.publishedBy.id,
      snapshotId: newId,
    });
    if (idempotency !== undefined) {
      batch.add(
        `insert into idempotency_records (scope, key, request_hash, response_json, created_at, expires_at) select ?, ?, ?, ?, ?, ? where ${exists.sql}`,
        scope,
        idempotency.key,
        idempotency.fingerprint,
        JSON.stringify(committed),
        input.publishedAt,
        input.publishedAt + PUBLICATION_IDEMPOTENCY_TTL_MS,
        ...exists.params,
      );
    }
    batch.add(
      `delete from content_snapshots where entry_id = ? and id <> ? and id <> ? and ${exists.sql}`,
      input.entryId,
      draftId,
      newId,
      ...exists.params,
    );
    const results = await this.execute(batch, false);
    if (results[snapshotIndex]!.meta.changes !== 1) {
      if (idempotency !== undefined) {
        const replay = await this.replayPublication(scope!, idempotency);
        if (replay !== null) return replay;
      }
      assertPublishedInternalLinkTargets(
        await this.all<import("@lacecms/db").InvalidPublishedLinkTargetRow>(
          linkGuard.sql,
          ...linkGuard.params,
        ),
        entry.draft.blocks.map((block) => block.key),
      );
      revisionConflict("The draft revision no longer matches the expected revision.");
    }
    return {
      entry: committed,
      outcome: "published",
      status: "published",
      targetVersion: this.stateVersion(results, state),
    };
  }

  public async unpublish(
    input: UnpublishContentEntryCommand,
  ): Promise<UnpublishContentEntryResult> {
    const idempotency = input.idempotency;
    const scope =
      idempotency === undefined
        ? undefined
        : unpublicationScope(input.entryId, idempotency.actorId);
    if (idempotency !== undefined) {
      if (idempotency.actorId !== input.unpublishedBy.id)
        failure("Unpublication idempotency actor must match the unpublishing actor.");
      const replay = await this.replayUnpublication(scope!, idempotency);
      if (replay !== null) return replay;
    }
    const entry = await this.reader.loadEntry(input.entryId);
    if (entry === null) failure("Content entry does not exist.");
    if (entry.published === undefined) notPublished();
    if (entry.published.id !== input.expectedPublishedSnapshotId) {
      revisionConflict("The published snapshot no longer matches the expected publication.");
    }
    const impact = await this.checkLinkRemoval(
      input.entryId,
      "unpublish",
      input.unpublishedBy.id,
      input.linkImpact,
    );
    const committed: ContentEntry = Object.freeze({
      draft: entry.draft,
      id: entry.id,
      model: entry.model,
    });
    const batch = this.batch();
    const token = this.guard(batch, input.unpublishedAt, {
      params: [
        input.entryId,
        input.expectedPublishedSnapshotId,
        ...(idempotency === undefined ? [] : [scope, idempotency.key]),
        ...impact.params,
      ],
      sql: `exists (select 1 from content_entries where id = ? and published_snapshot_id = ?)${
        idempotency === undefined
          ? ""
          : " and not exists (select 1 from idempotency_records where scope = ? and key = ?)"
      } and (${impact.sql})`,
    });
    const guarded: Condition = { params: [token], sql: GUARD_SQL };
    batch.add(
      `${BUMP_INTERNAL_LINK_GRAPH_SQL} and ${GUARD_SQL}`,
      JSON.stringify([input.expectedPublishedSnapshotId]),
      token,
    );
    batch.checkpoint("unpublish.route");
    batch.add(
      `delete from published_routes where entry_id = ? and ${GUARD_SQL}`,
      input.entryId,
      token,
    );
    batch.add(
      `update content_entries set published_snapshot_id = null, updated_at = ? where id = ? and ${GUARD_SQL}`,
      input.unpublishedAt,
      input.entryId,
      token,
    );
    const state = this.addPublicStateBump(batch, guarded, {
      reason: "publication",
      requestedAt: input.unpublishedAt,
      requestedBy: input.unpublishedBy.id,
      snapshotId: input.expectedPublishedSnapshotId,
    });
    if (idempotency !== undefined) {
      batch.add(
        `insert into idempotency_records (scope, key, request_hash, response_json, created_at, expires_at) select ?, ?, ?, ?, ?, ? where ${GUARD_SQL}`,
        scope,
        idempotency.key,
        idempotency.fingerprint,
        JSON.stringify(committed),
        input.unpublishedAt,
        input.unpublishedAt + PUBLICATION_IDEMPOTENCY_TTL_MS,
        token,
      );
    }
    batch.checkpoint("unpublish.snapshot");
    batch.add(
      `delete from content_snapshots where id = ? and ${GUARD_SQL}`,
      input.expectedPublishedSnapshotId,
      token,
    );
    this.releaseGuard(batch, token);
    const results = await this.execute(batch, false);
    if (results[0]!.meta.changes !== 1) {
      if (idempotency !== undefined) {
        const replay = await this.replayUnpublication(scope!, idempotency);
        if (replay !== null) return replay;
      }
      const current = await this.entryRow(input.entryId);
      if (current === undefined) failure("Content entry does not exist.");
      if (current.published_snapshot_id === null) notPublished();
      await this.checkLinkRemoval(
        input.entryId,
        "unpublish",
        input.unpublishedBy.id,
        input.linkImpact,
      );
      revisionConflict("The published snapshot no longer matches the expected publication.");
    }
    return {
      entry: committed,
      outcome: "unpublished",
      status: "unpublished",
      targetVersion: this.stateVersion(results, state),
    };
  }

  public async revertDraft(input: RevertContentDraftCommand): Promise<ContentCommandResult> {
    const entry = await this.entryRow(input.entryId);
    if (entry === undefined || entry.draft_snapshot_id === null) {
      failure("Content entry does not exist.");
    }
    if (entry.published_snapshot_id === null) notPublished();
    if (entry.published_snapshot_id !== input.expectedPublishedSnapshotId) {
      revisionConflict("The published snapshot no longer matches the expected publication.");
    }
    const draftId = entry.draft_snapshot_id;
    const publishedId = entry.published_snapshot_id;
    const batch = this.batch();
    const token = this.guard(batch, input.revertedAt, {
      params: [input.entryId, publishedId, input.expectedRevision],
      sql: "exists (select 1 from content_entries e join content_snapshots d on d.id = e.draft_snapshot_id where e.id = ? and e.published_snapshot_id = ? and d.revision = ?)",
    });
    batch.checkpoint("revert.draft");
    batch.add(
      revertDraftSnapshotSql(GUARD_SQL),
      input.revertedAt,
      input.revertedBy.id,
      publishedId,
      draftId,
      token,
    );
    batch.add(`delete from content_blocks where snapshot_id = ? and ${GUARD_SQL}`, draftId, token);
    batch.add(
      `delete from content_media_references where snapshot_id = ? and ${GUARD_SQL}`,
      draftId,
      token,
    );
    batch.checkpoint("revert.blocks");
    batch.add(copySnapshotBlocksSql(GUARD_SQL), draftId, publishedId, token);
    batch.add(copySnapshotReferencesSql(GUARD_SQL), draftId, publishedId, token);
    batch.checkpoint("revert.internal-links");
    for (const statement of copyInternalLinkDiffStatements(draftId, publishedId, GUARD_SQL))
      batch.add(statement.sql, ...statement.params, token);
    batch.checkpoint("revert.published");
    batch.add(
      `update content_snapshots set revision = ? where id = ? and ${GUARD_SQL}`,
      input.expectedRevision + 1,
      publishedId,
      token,
    );
    batch.add(
      `update content_entries set updated_at = ? where id = ? and ${GUARD_SQL}`,
      input.revertedAt,
      input.entryId,
      token,
    );
    this.releaseGuard(batch, token);
    const results = await this.execute(batch, false);
    if (results[0]!.meta.changes !== 1) {
      const current = await this.entryRow(input.entryId);
      if (current === undefined) failure("Content entry does not exist.");
      if (current.published_snapshot_id === null) notPublished();
      if (current.published_snapshot_id !== publishedId) {
        revisionConflict("The published snapshot no longer matches the expected publication.");
      }
      revisionConflict("The draft revision no longer matches the expected revision.");
    }
    const reverted = await this.reader.loadEntry(input.entryId);
    if (reverted === null) failure("Reverted content entry could not be reloaded.");
    return { entry: reverted, status: "reverted" };
  }

  public async delete(input: DeleteContentEntryInput): Promise<ContentCommandResult> {
    const entry = await this.entryRow(input.entryId);
    if (entry === undefined) failure("Content entry does not exist.");
    const expectedPublished = input.expectedPublishedSnapshotId ?? null;
    if (entry.published_snapshot_id !== expectedPublished) {
      revisionConflict("The publication state no longer matches the deletion guard.");
    }
    const impact = await this.checkLinkRemoval(
      input.entryId,
      "delete",
      input.deletedBy.id,
      input.linkImpact,
    );
    const batch = this.batch();
    const token = this.guard(batch, input.deletedAt, {
      params: [input.entryId, expectedPublished, input.expectedRevision, ...impact.params],
      sql: `exists (select 1 from content_entries e join content_snapshots d on d.id = e.draft_snapshot_id where e.id = ? and e.published_snapshot_id is ? and d.revision = ?) and (${impact.sql})`,
    });
    const guarded: Condition = { params: [token], sql: GUARD_SQL };
    if (expectedPublished !== null) {
      batch.checkpoint("delete.route");
      batch.add(
        `delete from published_routes where entry_id = ? and ${GUARD_SQL}`,
        input.entryId,
        token,
      );
      this.addPublicStateBump(batch, guarded, {
        reason: "publication",
        requestedAt: input.deletedAt,
        requestedBy: input.deletedBy.id,
        snapshotId: expectedPublished,
      });
    }
    batch.add(
      `${BUMP_INTERNAL_LINK_GRAPH_SQL} and ${GUARD_SQL}`,
      JSON.stringify(
        [entry.draft_snapshot_id, entry.published_snapshot_id].filter((id) => id !== null),
      ),
      token,
    );
    batch.checkpoint("delete.entry");
    batch.add(`delete from content_entries where id = ? and ${GUARD_SQL}`, input.entryId, token);
    this.releaseGuard(batch, token);
    const results = await this.execute(batch, false);
    if (results[0]!.meta.changes !== 1) {
      const current = await this.entryRow(input.entryId);
      if (current === undefined) failure("Content entry does not exist.");
      if (current.published_snapshot_id !== expectedPublished) {
        revisionConflict("The publication state no longer matches the deletion guard.");
      }
      await this.checkLinkRemoval(input.entryId, "delete", input.deletedBy.id, input.linkImpact);
      revisionConflict("The draft revision no longer matches the deletion guard.");
    }
    return { status: "deleted" };
  }

  private publishedEntry(
    entry: ContentEntry,
    input: PublishContentEntryCommand,
    publisherRole: string | undefined,
  ): ContentEntry {
    const draft = entry.draft;
    const source: StoredSnapshot = {
      blocks: draft.blocks,
      createdAt: input.publishedAt,
      entryId: draft.entryId,
      fields: draft.fields,
      id: input.publishedSnapshotId,
      revision: draft.revision,
      ...(draft.slug === undefined ? {} : { slug: draft.slug }),
      title: draft.title,
      updatedAt: input.publishedAt,
      updatedBy: { id: input.publishedBy.id, role: storedRole(publisherRole) },
    };
    return Object.freeze({
      draft,
      id: entry.id,
      model: entry.model,
      published: snapshotValue(source, "published"),
    });
  }

  private async replayPublication(
    scope: string,
    idempotency: NonNullable<PublishContentEntryCommand["idempotency"]>,
  ): Promise<PublishContentEntryResult | null> {
    const prior = await this.first<{
      readonly request_hash: string;
      readonly response_json: string;
    }>(
      "select request_hash, response_json from idempotency_records where scope = ? and key = ?",
      scope,
      idempotency.key,
    );
    if (prior === undefined) return null;
    if (prior.request_hash !== idempotency.fingerprint)
      failure("Publication idempotency key was reused with different input.");
    return {
      entry: JSON.parse(prior.response_json) as ContentEntry,
      outcome: "replayed",
      status: "published",
    };
  }

  private async replayUnpublication(
    scope: string,
    idempotency: NonNullable<UnpublishContentEntryCommand["idempotency"]>,
  ): Promise<UnpublishContentEntryResult | null> {
    const prior = await this.first<{
      readonly request_hash: string;
      readonly response_json: string;
    }>(
      "select request_hash, response_json from idempotency_records where scope = ? and key = ?",
      scope,
      idempotency.key,
    );
    if (prior === undefined) return null;
    if (prior.request_hash !== idempotency.fingerprint)
      failure("Unpublication idempotency key was reused with different input.");
    return {
      entry: JSON.parse(prior.response_json) as ContentEntry,
      outcome: "replayed",
      status: "unpublished",
    };
  }
}
