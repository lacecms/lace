import { actorDisplayName, opaqueCursor } from "@lacecms/application";
import type {
  ActorSummary,
  ContentEntrySummary,
  CursorPage,
  MediaCatalogItem,
  MediaUsageEntry,
  MediaUsageLocation,
  MediaUsageState,
  StoredContentModelState,
  OpaqueCursor,
  PublishContentEntryCommand,
} from "@lacecms/application";
import { DomainError } from "@lacecms/domain";
import type {
  ActorId,
  BlockKey,
  ContentEntry,
  DraftMediaReference,
  MediaMetadata,
  PublishedRoute,
} from "@lacecms/domain";

import type { InternalLinkReference } from "@lacecms/content";
import { assertPositiveInteger, clone } from "../shared/assertions.js";
import {
  copyCursorPage,
  entrySnapshots,
  type StoredPublicationIdempotency,
  entryStatus,
  listValues,
} from "./support.js";

export class InMemoryContentStoreState {
  public readonly configurationSyncBuildRequests: number[] = [];

  public readonly mediaDeletionRequests: string[] = [];

  public readonly mediaMetadataBuildRequests: number[] = [];

  protected readonly actorNames = new Map<string, string>();

  protected entries = new Map<string, ContentEntry>();

  protected modelStates = new Map<string, StoredContentModelState>();

  protected readonly media = new Map<string, MediaMetadata>();

  protected readonly publicationIdempotency = new Map<string, StoredPublicationIdempotency>();

  protected readonly linkReferences = new Map<string, readonly InternalLinkReference[]>();

  protected readonly references = new Map<string, readonly DraftMediaReference[]>();

  protected readonly routes = new Map<string, PublishedRoute>();

  protected publicVersion = 0;

  public setStoredModelStates(models: readonly StoredContentModelState[]): void {
    this.modelStates.clear();
    for (const model of models) this.modelStates.set(model.key, clone(model));
  }

  public storedModelStates(): readonly StoredContentModelState[] {
    return Object.freeze(
      [...this.modelStates.values()]
        .map((model) => {
          const entries = [...this.entries.values()].filter(
            (entry) => entry.model.key === model.key,
          );
          const snapshots = entries.flatMap(entrySnapshots);
          const updatedAt = snapshots.map((snapshot) => snapshot.updatedAt);
          const references = snapshots.flatMap((snapshot) =>
            (this.references.get(snapshot.id) ?? []).map((reference) => ({
              ...reference,
              createdAt: snapshot.updatedAt,
            })),
          );
          return Object.freeze({
            ...clone(model),
            draftSnapshotCount: entries.length,
            entryCount: entries.length,
            publishedSnapshotCount: entries.filter((entry) => entry.published !== undefined).length,
            snapshotFingerprint: [
              snapshots.length,
              snapshots.reduce((sum, snapshot) => sum + snapshot.revision, 0),
              updatedAt.reduce((sum, value) => sum + value, 0),
              updatedAt.length === 0 ? 0 : Math.max(...updatedAt),
              references.length,
              references.reduce((sum, reference) => sum + reference.createdAt, 0),
              references.reduce(
                (sum, reference) =>
                  sum +
                  reference.sourceKey.length +
                  reference.fieldPath.length +
                  reference.mediaId.length,
                0,
              ),
            ].join(":"),
          });
        })
        .sort((left, right) => left.key.localeCompare(right.key)),
    );
  }

  protected assertActiveReferences(references: readonly DraftMediaReference[]): void {
    for (const reference of references) {
      const media = this.media.get(reference.mediaId);
      // Some application tests intentionally validate media through a separate
      // read double; when this store owns the record it still enforces the
      // persistence-time active-state guard.
      if (media !== undefined && media.status !== "active") {
        throw new DomainError("CONTENT_INVALID_STATE", "Media is unavailable for reference.");
      }
    }
  }

  protected catalogItem(media: MediaMetadata): MediaCatalogItem {
    return Object.freeze({
      createdBy: this.actorSummary(media.createdBy),
      media: clone(media),
      usageCount: this.mediaUsage(media.id).length,
    });
  }

  protected mediaUsage(mediaIdValue: string): MediaUsageEntry[] {
    const usage: { readonly entry: MediaUsageEntry; readonly updatedAt: number }[] = [];
    for (const entry of this.entries.values()) {
      const locations = new Map<
        string,
        {
          blockKey?: BlockKey;
          blockType?: string;
          field: string;
          position: number;
          seo?: true;
          states: Set<MediaUsageState>;
        }
      >();
      const snapshots = [
        ["draft", entry.draft] as const,
        ...(entry.published === undefined ? [] : [["published", entry.published] as const]),
      ];
      for (const [state, snapshot] of snapshots) {
        for (const reference of this.references.get(snapshot.id) ?? []) {
          if (reference.mediaId !== mediaIdValue) continue;
          const seo = reference.sourceKey === "$seo";
          const block =
            reference.sourceKey === "$fields" || seo
              ? undefined
              : snapshot.blocks.find((candidate) => candidate.key === reference.sourceKey);
          if (reference.sourceKey !== "$fields" && !seo && block === undefined) {
            throw new Error("A media reference names a block that does not exist.");
          }
          const key = `${reference.sourceKey}\u0000${reference.fieldPath}`;
          const location = locations.get(key) ?? {
            ...(block === undefined ? {} : { blockKey: block.key, blockType: block.type }),
            field: reference.fieldPath,
            position: block?.position ?? 0,
            ...(seo ? { seo: true as const } : {}),
            states: new Set<MediaUsageState>(),
          };
          if (block !== undefined) {
            if (state === "draft") location.blockType = block.type;
            location.position = Math.min(location.position, block.position);
          }
          location.states.add(state);
          locations.set(key, location);
        }
      }
      if (locations.size === 0) continue;
      const rank = (location: { blockKey?: BlockKey; seo?: true }): number =>
        location.blockKey !== undefined ? 2 : location.seo === true ? 1 : 0;
      const ordered = [...locations.values()].sort((left, right) => {
        if (rank(left) !== rank(right)) return rank(left) - rank(right);
        if (left.position !== right.position) return left.position - right.position;
        const leftKey = `${left.blockKey ?? ""}\u0000${left.field}`;
        const rightKey = `${right.blockKey ?? ""}\u0000${right.field}`;
        return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
      });
      const states = (value: ReadonlySet<MediaUsageState>): readonly MediaUsageState[] =>
        Object.freeze((["draft", "published"] as const).filter((state) => value.has(state)));
      usage.push({
        entry: Object.freeze({
          entryId: entry.id,
          locations: Object.freeze(
            ordered.map((location): MediaUsageLocation =>
              location.seo === true
                ? Object.freeze({
                    field: "image" as const,
                    source: "seo" as const,
                    states: states(location.states),
                  })
                : location.blockKey === undefined
                  ? Object.freeze({
                      field: location.field,
                      source: "field" as const,
                      states: states(location.states),
                    })
                  : Object.freeze({
                      blockKey: location.blockKey,
                      blockType: location.blockType!,
                      field: location.field,
                      source: "block" as const,
                      states: states(location.states),
                    }),
            ),
          ),
          modelKey: entry.model.key,
          ...(entry.draft.slug === undefined ? {} : { slug: entry.draft.slug }),
          status: entryStatus(entry),
          title: entry.draft.title,
        }),
        // Mirrors the Node `content_entries.updated_at`, which publication also advances.
        updatedAt: Math.max(entry.draft.updatedAt, entry.published?.createdAt ?? 0),
      });
    }
    return usage
      .sort((left, right) =>
        left.updatedAt === right.updatedAt
          ? left.entry.entryId < right.entry.entryId
            ? 1
            : left.entry.entryId > right.entry.entryId
              ? -1
              : 0
          : right.updatedAt - left.updatedAt,
      )
      .map(({ entry }) => entry);
  }

  protected actorSummary(id: ActorId): ActorSummary {
    return Object.freeze({ displayName: actorDisplayName(id, this.actorNames.get(id)), id });
  }

  protected summarize(entry: ContentEntry, listFields: readonly string[]): ContentEntrySummary {
    return Object.freeze({
      draftRevision: entry.draft.revision,
      id: entry.id,
      listValues: listValues(entry, listFields),
      modelKey: entry.model.key,
      ...(entry.published === undefined
        ? {}
        : { publishedAt: entry.published.createdAt, publishedSnapshotId: entry.published.id }),
      ...(entry.draft.slug === undefined ? {} : { slug: entry.draft.slug }),
      status: entryStatus(entry),
      title: entry.draft.title,
      updatedAt: entry.draft.updatedAt,
      updatedBy: this.actorSummary(entry.draft.updatedBy.id),
    });
  }

  protected page<Value>(
    items: readonly Value[],
    after: OpaqueCursor | undefined,
    limit: number,
    prefix: string,
  ): CursorPage<Value> {
    assertPositiveInteger(limit, "limit");
    const start = this.cursorOffset(after, prefix);
    const slice = items.slice(start, start + limit);
    const nextOffset = start + slice.length;
    return copyCursorPage({
      items: slice,
      ...(nextOffset < items.length ? { nextCursor: opaqueCursor(`${prefix}:${nextOffset}`) } : {}),
    });
  }

  protected cursorOffset(cursor: OpaqueCursor | undefined, prefix: string): number {
    if (cursor === undefined) return 0;
    const cursorPrefix = `${prefix}:`;
    if (!cursor.startsWith(cursorPrefix)) {
      throw new DomainError("CONTENT_INVALID_STATE", "Cursor is invalid.");
    }
    const offsetText = cursor.slice(cursorPrefix.length);
    const offset = Number(offsetText);
    if (!Number.isSafeInteger(offset) || offset < 0 || String(offset) !== offsetText) {
      throw new DomainError("CONTENT_INVALID_STATE", "Cursor offset is invalid.");
    }
    return offset;
  }

  protected publicationIdempotencyMapKey(input: PublishContentEntryCommand): string | undefined {
    if (input.idempotency === undefined) return undefined;
    if (input.idempotency.actorId !== input.publishedBy.id) {
      throw new DomainError(
        "CONTENT_INVALID_STATE",
        "Publication idempotency actor must match the publishing actor.",
      );
    }
    return `${input.entryId}:${input.idempotency.actorId}:${input.idempotency.key}`;
  }
}
