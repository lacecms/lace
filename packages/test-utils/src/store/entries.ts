import { withPublishedProjection } from "@lacecms/application";
import type {
  ActorSummary,
  ContentCommandResult,
  ContentEntryListPage,
  CreateContentEntryInput,
  DeleteContentEntryInput,
  ListContentEntriesInput,
  LoadContentEntryInput,
  PublishContentEntryCommand,
  PublishContentEntryResult,
  RevertContentDraftCommand,
  SaveCompleteDraftInput,
  UnpublishContentEntryCommand,
  UnpublishContentEntryResult,
} from "@lacecms/application";
import {
  DomainError,
  assertEntryCreationAllowed,
  assertPublicPathAvailable,
  publishContentEntry,
  contentPublicPath,
  revertContentDraft,
  saveCompleteDraft,
  unpublishContentEntry,
} from "@lacecms/domain";
import type { ActorId, ContentEntry, PublishedSnapshot } from "@lacecms/domain";

import { clone } from "../shared/assertions.js";
import { copyEntry, entryStatus, matchesSearch, compareSummaries } from "./support.js";
import { InMemoryContentStoreSync } from "./sync.js";

export class InMemoryContentStoreEntries extends InMemoryContentStoreSync {
  public async create(input: CreateContentEntryInput): Promise<ContentCommandResult> {
    const entry = copyEntry(input.entry);
    if (this.entries.has(entry.id)) {
      throw new DomainError("CONTENT_INVALID_STATE", "Content entry already exists.");
    }
    const existingEntryCount = [...this.entries.values()].filter(
      (candidate) => candidate.model.key === entry.model.key,
    ).length;
    assertEntryCreationAllowed(entry.model.kind, existingEntryCount);
    if (input.duplicateOf !== undefined) {
      const source = this.entries.get(input.duplicateOf.entryId);
      if (source === undefined)
        throw new DomainError("CONTENT_INVALID_STATE", "Content entry does not exist.");
      if (source.draft.revision !== input.duplicateOf.expectedRevision) {
        throw new DomainError(
          "CONTENT_REVISION_CONFLICT",
          "The source draft revision no longer matches the duplicate guard.",
        );
      }
    }
    this.assertActiveReferences(input.mediaReferences ?? []);
    this.entries.set(entry.id, entry);
    this.references.set(entry.draft.id, clone(input.mediaReferences ?? []));
    this.linkReferences.set(entry.draft.id, clone(input.internalLinks ?? []));
    return Object.freeze({ entry: copyEntry(entry), status: "created" });
  }

  public async delete(input: DeleteContentEntryInput): Promise<ContentCommandResult> {
    const entry = this.entries.get(input.entryId);
    if (entry === undefined)
      throw new DomainError("CONTENT_INVALID_STATE", "Content entry does not exist.");
    if (
      entry.draft.revision !== input.expectedRevision ||
      entry.published?.id !== input.expectedPublishedSnapshotId
    ) {
      throw new DomainError(
        "CONTENT_REVISION_CONFLICT",
        "The draft revision or publication state no longer matches the deletion guard.",
      );
    }
    const nextRoutes = new Map(this.routes);
    for (const [path, route] of nextRoutes)
      if (route.entryId === input.entryId) nextRoutes.delete(path);
    this.entries.delete(input.entryId);
    this.references.delete(entry.draft.id);
    this.linkReferences.delete(entry.draft.id);
    if (entry.published !== undefined) {
      this.references.delete(entry.published.id);
      this.linkReferences.delete(entry.published.id);
    }
    this.routes.clear();
    for (const [path, route] of nextRoutes) this.routes.set(path, route);
    if (entry.published !== undefined) this.publicVersion += 1;
    return Object.freeze({ status: "deleted" });
  }

  public async load(input: LoadContentEntryInput): Promise<ContentEntry | null> {
    const entry = this.entries.get(input.entryId);
    return entry === undefined ? null : copyEntry(entry);
  }

  public async loadDraft(input: LoadContentEntryInput): Promise<ContentEntry["draft"] | null> {
    const entry = await this.load(input);
    return entry?.draft ?? null;
  }

  public async loadPublished(input: LoadContentEntryInput): Promise<PublishedSnapshot | null> {
    const entry = await this.load(input);
    return entry?.published ?? null;
  }

  public setActorDisplayNames(names: Readonly<Record<string, string>>): void {
    this.actorNames.clear();
    for (const [id, name] of Object.entries(names)) this.actorNames.set(id, name);
  }

  public async describeActors(ids: readonly ActorId[]): Promise<readonly ActorSummary[]> {
    return Object.freeze(ids.map((id) => this.actorSummary(id)));
  }

  public async list(input: ListContentEntriesInput): Promise<ContentEntryListPage> {
    const matching = [...this.entries.values()].filter(
      (entry) =>
        entry.model.key === input.modelKey &&
        matchesSearch(entry, input.q) &&
        (input.slug === undefined || entry.draft.slug === input.slug),
    );
    const totals = { all: matching.length, changed: 0, draft: 0, published: 0 };
    for (const entry of matching) totals[entryStatus(entry)] += 1;
    const summaries = matching
      .filter((entry) => input.status === undefined || entryStatus(entry) === input.status)
      .map((entry) => this.summarize(entry, input.listFields))
      .sort((left, right) => compareSummaries(left, right, input.sort));
    const prefix = JSON.stringify([
      "entries",
      input.modelKey,
      input.sort,
      input.status ?? null,
      input.q ?? null,
      ...(input.slug === undefined ? [] : [input.slug]),
    ]);
    return Object.freeze({
      ...this.page(summaries, input.after, input.limit, prefix),
      totals: Object.freeze(totals),
    });
  }

  public async saveCompleteDraft(input: SaveCompleteDraftInput): Promise<ContentCommandResult> {
    const entry = this.entries.get(input.entryId);
    if (entry === undefined)
      throw new DomainError("CONTENT_INVALID_STATE", "Content entry does not exist.");
    this.assertActiveReferences(input.mutation.mediaReferences ?? []);
    const saved = saveCompleteDraft(entry, input.mutation);
    this.entries.set(saved.id, saved);
    this.references.set(saved.draft.id, clone(input.mutation.mediaReferences ?? []));
    this.linkReferences.set(saved.draft.id, clone(input.internalLinks ?? []));
    return Object.freeze({ entry: copyEntry(saved), status: "saved" });
  }

  public async publish(input: PublishContentEntryCommand): Promise<PublishContentEntryResult> {
    const idempotencyMapKey = this.publicationIdempotencyMapKey(input);
    if (idempotencyMapKey !== undefined) {
      const prior = this.publicationIdempotency.get(idempotencyMapKey);
      if (prior !== undefined) {
        if (prior.fingerprint !== input.idempotency!.fingerprint) {
          throw new DomainError(
            "CONTENT_INVALID_STATE",
            "Publication idempotency key was reused with different input.",
          );
        }
        return Object.freeze({
          entry: copyEntry(prior.entry),
          outcome: "replayed",
          status: "published",
        });
      }
    }
    const entry = this.entries.get(input.entryId);
    if (entry === undefined)
      throw new DomainError("CONTENT_INVALID_STATE", "Content entry does not exist.");
    const copied = publishContentEntry(entry, input);
    const published =
      input.projection === undefined ? copied : withPublishedProjection(copied, input.projection);
    const path = contentPublicPath(published.model, published.published!.slug);
    const nextRoutes = new Map(this.routes);
    // A global has no route; its publication only replaces the snapshot.
    if (path !== undefined) {
      assertPublicPathAvailable(path, published.id, this.routes.get(path));
      for (const [existingPath, route] of nextRoutes) {
        if (route.entryId === published.id) nextRoutes.delete(existingPath);
      }
      nextRoutes.set(path, {
        entryId: published.id,
        path,
        snapshotId: published.published!.id,
        updatedAt: input.publishedAt,
      });
    }
    this.entries.set(published.id, published);
    // Publication replaces the prior published snapshot, as SQLite cascades its references.
    if (entry.published !== undefined) this.references.delete(entry.published.id);
    this.references.set(
      published.published!.id,
      clone(input.projection?.mediaReferences ?? this.references.get(entry.draft.id) ?? []),
    );
    if (entry.published !== undefined) this.linkReferences.delete(entry.published.id);
    this.linkReferences.set(
      published.published!.id,
      clone(input.projection?.internalLinks ?? this.linkReferences.get(entry.draft.id) ?? []),
    );
    this.routes.clear();
    for (const [routePath, route] of nextRoutes) this.routes.set(routePath, route);
    this.publicVersion += 1;
    if (idempotencyMapKey !== undefined) {
      this.publicationIdempotency.set(idempotencyMapKey, {
        entry: copyEntry(published),
        fingerprint: input.idempotency!.fingerprint,
      });
    }
    return Object.freeze({
      entry: copyEntry(published),
      outcome: "published",
      status: "published",
      targetVersion: this.publicVersion,
    });
  }

  public async unpublish(
    input: UnpublishContentEntryCommand,
  ): Promise<UnpublishContentEntryResult> {
    let idempotencyMapKey: string | undefined;
    if (input.idempotency !== undefined) {
      if (input.idempotency.actorId !== input.unpublishedBy.id) {
        throw new DomainError(
          "CONTENT_INVALID_STATE",
          "Unpublication idempotency actor must match the unpublishing actor.",
        );
      }
      idempotencyMapKey = `unpublication:${input.entryId}:${input.idempotency.actorId}:${input.idempotency.key}`;
      const prior = this.publicationIdempotency.get(idempotencyMapKey);
      if (prior !== undefined) {
        if (prior.fingerprint !== input.idempotency.fingerprint) {
          throw new DomainError(
            "CONTENT_INVALID_STATE",
            "Unpublication idempotency key was reused with different input.",
          );
        }
        return Object.freeze({
          entry: copyEntry(prior.entry),
          outcome: "replayed",
          status: "unpublished",
        });
      }
    }
    const entry = this.entries.get(input.entryId);
    if (entry === undefined)
      throw new DomainError("CONTENT_INVALID_STATE", "Content entry does not exist.");
    const unpublished = unpublishContentEntry(entry, input.expectedPublishedSnapshotId);
    for (const [path, route] of this.routes) {
      if (route.entryId === entry.id) this.routes.delete(path);
    }
    this.entries.set(unpublished.id, unpublished);
    this.references.delete(input.expectedPublishedSnapshotId);
    this.linkReferences.delete(input.expectedPublishedSnapshotId);
    this.publicVersion += 1;
    if (idempotencyMapKey !== undefined) {
      this.publicationIdempotency.set(idempotencyMapKey, {
        entry: copyEntry(unpublished),
        fingerprint: input.idempotency!.fingerprint,
      });
    }
    return Object.freeze({
      entry: copyEntry(unpublished),
      outcome: "unpublished",
      status: "unpublished",
      targetVersion: this.publicVersion,
    });
  }

  public async revertDraft(input: RevertContentDraftCommand): Promise<ContentCommandResult> {
    const entry = this.entries.get(input.entryId);
    if (entry === undefined)
      throw new DomainError("CONTENT_INVALID_STATE", "Content entry does not exist.");
    const reverted = revertContentDraft(entry, input);
    this.entries.set(reverted.id, reverted);
    this.references.set(
      reverted.draft.id,
      clone(this.references.get(input.expectedPublishedSnapshotId) ?? []),
    );
    this.linkReferences.set(
      reverted.draft.id,
      clone(this.linkReferences.get(input.expectedPublishedSnapshotId) ?? []),
    );
    return Object.freeze({ entry: copyEntry(reverted), status: "reverted" });
  }
}
