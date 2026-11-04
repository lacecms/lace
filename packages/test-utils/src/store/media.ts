import { normalizeMediaTags } from "@lacecms/domain";
import {
  ALLOWED_MEDIA_MIME_TYPES,
  MAX_MEDIA_USAGE_ENTRIES,
  MEDIA_SORTS,
  foldAscii,
} from "@lacecms/application";
import type {
  CreateMediaMetadataInput,
  CursorPage,
  MarkMediaForDeletionInput,
  MarkMediaForDeletionResult,
  UpdateMediaMetadataInput,
  UpdateMediaMetadataResult,
  LoadMediaUsageInput,
  MediaCatalogItem,
  MediaUsageEntry,
} from "@lacecms/application";
import { DomainError } from "@lacecms/domain";
import type { DraftMediaReference, MediaMetadata } from "@lacecms/domain";

import { clone } from "../shared/assertions.js";
import { compareMedia } from "./support.js";
import { InMemoryContentStoreState } from "./state.js";

export class InMemoryContentStoreMedia extends InMemoryContentStoreState {
  public registerMedia(value: MediaMetadata): void {
    this.media.set(value.id, clone(value));
  }

  public mediaReferences(snapshotId: string): readonly DraftMediaReference[] {
    return Object.freeze(clone(this.references.get(snapshotId) ?? []));
  }

  public async createMedia(input: CreateMediaMetadataInput): Promise<MediaMetadata> {
    if (
      this.media.has(input.id) ||
      [...this.media.values()].some((value) => value.storageKey === input.storageKey)
    ) {
      throw new DomainError(
        "CONTENT_INVALID_STATE",
        "Media identity or storage key already exists.",
      );
    }
    const normalized = normalizeMediaTags(input.tags ?? []);
    if ("issue" in normalized)
      throw new DomainError("CONTENT_INVALID_STATE", "Invalid media tags.");
    const media: MediaMetadata = {
      tags: normalized.tags,
      createdAt: input.createdAt,
      createdBy: input.createdBy,
      filename: input.filename,
      height: input.height,
      id: input.id,
      mimeType: input.mimeType,
      ...(input.sha256 === undefined ? {} : { sha256: input.sha256 }),
      size: input.size,
      status: "active",
      storageKey: input.storageKey,
      updatedAt: input.createdAt,
      width: input.width,
    };
    this.media.set(media.id, clone(media));
    return clone(media);
  }

  public async listMedia(
    input: import("@lacecms/application").ListMediaInput,
  ): Promise<CursorPage<MediaCatalogItem>> {
    if (!MEDIA_SORTS.includes(input.sort)) {
      throw new DomainError("CONTENT_INVALID_STATE", "Media sort is unsupported.");
    }
    if (input.type !== undefined && !ALLOWED_MEDIA_MIME_TYPES.includes(input.type)) {
      throw new DomainError("CONTENT_INVALID_STATE", "Media type filter is unsupported.");
    }
    const term = input.q === undefined ? undefined : foldAscii(input.q);
    const items = [...this.media.values()]
      .filter(
        (value) =>
          (term === undefined || foldAscii(value.filename).includes(term)) &&
          (input.type === undefined || value.mimeType === input.type) &&
          (input.tags ?? []).every((tag) => (value.tags ?? []).includes(tag)) &&
          (input.sha256 === undefined ||
            (value.sha256 === input.sha256 && value.status === "active")),
      )
      .sort((left, right) => compareMedia(left, right, input.sort))
      .map((value) => this.catalogItem(value));
    const prefix = JSON.stringify([
      "media",
      input.sort,
      input.type ?? null,
      input.q ?? null,
      [...(input.tags ?? [])].sort(),
      ...(input.sha256 === undefined ? [] : [input.sha256]),
    ]);
    return this.page(items, input.after, input.limit, prefix);
  }

  public async listMediaTags(
    input: import("@lacecms/application").ListMediaTagsInput,
  ): Promise<CursorPage<import("@lacecms/application").MediaTagCount>> {
    const counts = new Map<string, number>();
    for (const item of this.media.values())
      for (const tag of item.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    const items = [...counts]
      .filter(([tag]) => input.q === undefined || tag.startsWith(input.q))
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([tag, count]) => ({ tag, count }));
    return this.page(
      items,
      input.after,
      input.limit,
      JSON.stringify(["media-tags", input.q ?? null]),
    );
  }

  public async loadMediaCatalogItem(id: string): Promise<MediaCatalogItem | null> {
    const media = this.media.get(id);
    return media === undefined ? null : this.catalogItem(media);
  }

  public async loadMediaUsage(input: LoadMediaUsageInput): Promise<readonly MediaUsageEntry[]> {
    if (
      !Number.isSafeInteger(input.limit) ||
      input.limit < 1 ||
      input.limit > MAX_MEDIA_USAGE_ENTRIES
    ) {
      throw new DomainError("CONTENT_INVALID_STATE", "Media usage limit is invalid.");
    }
    return Object.freeze(this.mediaUsage(input.mediaId).slice(0, input.limit));
  }

  public async loadMediaMany(ids: readonly string[]): Promise<readonly MediaMetadata[]> {
    return [...new Set(ids)].flatMap((id) => {
      const media = this.media.get(id);
      return media === undefined ? [] : [clone(media)];
    });
  }

  public async loadMedia(id: string): Promise<MediaMetadata | null> {
    const media = this.media.get(id);
    return media === undefined ? null : clone(media);
  }

  public async markForDeletion(
    input: MarkMediaForDeletionInput,
  ): Promise<MarkMediaForDeletionResult> {
    const media = this.media.get(input.mediaId);
    if (media === undefined || media.status !== "active") {
      throw new DomainError("CONTENT_INVALID_STATE", "Media is not eligible for deletion.");
    }
    if (this.mediaUsage(input.mediaId).length > 0) {
      throw new DomainError("MEDIA_IN_USE", "Media is still referenced by content.");
    }
    const deleting = { ...media, status: "deleting" as const, updatedAt: input.requestedAt };
    this.media.set(input.mediaId, clone(deleting));
    this.mediaDeletionRequests.push(input.mediaId);
    return Object.freeze({ media: clone(deleting), status: "deleting" });
  }

  public async retryDeletion(
    input: MarkMediaForDeletionInput,
  ): Promise<MarkMediaForDeletionResult> {
    const media = this.media.get(input.mediaId);
    if (media === undefined || media.status !== "delete_failed") {
      throw new DomainError("CONTENT_INVALID_STATE", "Media deletion cannot be retried.");
    }
    if (this.mediaUsage(input.mediaId).length > 0) {
      throw new DomainError("MEDIA_IN_USE", "Media is still referenced by content.");
    }
    const deleting = { ...media, status: "deleting" as const, updatedAt: input.requestedAt };
    this.media.set(input.mediaId, clone(deleting));
    this.mediaDeletionRequests.push(input.mediaId);
    return Object.freeze({ media: clone(deleting), status: "deleting" });
  }

  public async updateMediaMetadata(
    input: UpdateMediaMetadataInput,
  ): Promise<UpdateMediaMetadataResult> {
    const media = this.media.get(input.mediaId);
    if (media !== undefined && media.status !== "active") {
      throw new DomainError("CONTENT_INVALID_STATE", "Only active media can be edited.");
    }
    if (media === undefined || media.updatedAt !== input.expectedUpdatedAt) {
      throw new DomainError("MEDIA_UPDATE_CONFLICT", "The media was modified by another request.");
    }
    const { alt: _alt, caption: _caption, focalPoint: _focalPoint, ...technical } = media;
    const updated: MediaMetadata = {
      ...technical,
      tags: input.tags ?? media.tags ?? [],
      ...(input.alt === null ? {} : { alt: input.alt }),
      ...(input.caption === null ? {} : { caption: input.caption }),
      ...(input.focalPoint === null
        ? {}
        : { focalPoint: { x: input.focalPoint.x, y: input.focalPoint.y } }),
      updatedAt: input.updatedAt,
    };
    const published = this.mediaUsage(input.mediaId).some((entry) =>
      entry.locations.some((location) => location.states.includes("published")),
    );
    this.media.set(input.mediaId, clone(updated));
    if (!published || input.publishedEffect === false)
      return Object.freeze({ media: clone(updated) });
    this.publicVersion += 1;
    this.mediaMetadataBuildRequests.push(this.publicVersion);
    return Object.freeze({ media: clone(updated), targetVersion: this.publicVersion });
  }
}
