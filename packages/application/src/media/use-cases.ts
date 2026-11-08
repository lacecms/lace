import { InvariantError, MAX_PAGE_SIZE } from "@lacecms/content";
import {
  DomainError,
  isMediaSha256,
  mediaId,
  normalizeMediaTag,
  requirePermission,
  unixMilliseconds,
} from "@lacecms/domain";
import type { Actor, MediaId, MediaMetadata } from "@lacecms/domain";
import { DEFAULT_MEDIA_SORT, MEDIA_SORTS } from "../ports/media.js";
import type {
  ListMediaTagsInput,
  MediaTagCount,
  MediaMimeType,
  MediaSort,
} from "../ports/media.js";
import { MAX_MEDIA_SEARCH_LENGTH, MAX_MEDIA_USAGE_ENTRIES } from "../shared/limits.js";
import type { CursorPage } from "../shared/pagination.js";
import type {
  MediaUseCaseDependencies,
  CreateMediaUseCaseInput,
  GetMediaUseCaseInput,
  DeleteMediaUseCaseInput,
  ListMediaUseCaseInput,
  UpdateMediaMetadataUseCaseInput,
  UpdateMediaMetadataUseCaseResult,
  PublicMediaBinaryUseCaseInput,
  MediaBinary,
  MediaView,
  MediaDetailView,
} from "./types.js";
import { ALLOWED_MEDIA_MIME_TYPES } from "./limits.js";
import { detached, failure } from "./helpers.js";
import {
  collectMediaBytes,
  detectMediaMimeType,
  mediaSha256,
  sanitizeMediaFilename,
  streamBytes,
} from "./upload.js";
import { normalizeMediaMetadataPatch, sameFocalPoint, validatedTags } from "./metadata.js";
import { toMediaView, validateDimensions } from "./projection.js";

/** Portable orchestration for media policy and metadata lifecycle commands. */
export class MediaUseCases {
  public constructor(private readonly dependencies: MediaUseCaseDependencies) {}

  public async create(input: CreateMediaUseCaseInput): Promise<MediaView> {
    requirePermission(input.actor, "media:write");
    const tags = validatedTags(input.tags === undefined ? [] : input.tags);
    const bytes = await collectMediaBytes(input.body);
    const mimeType = detectMediaMimeType(bytes);
    const dimensions = await this.dependencies.imageInspector.inspect(bytes, mimeType);
    validateDimensions(dimensions.width, dimensions.height);
    const sha256 = await mediaSha256(bytes);
    const id = mediaId(this.dependencies.idGenerator.next());
    const storageKey = `media/${id}`;
    const stored = await this.dependencies.storage.put({
      body: streamBytes(bytes),
      contentType: mimeType,
      key: storageKey,
    });
    if (
      stored.key !== storageKey ||
      stored.contentType !== mimeType ||
      stored.size !== bytes.byteLength
    ) {
      await this.cleanupAfterMetadataFailure(storageKey, false);
      failure("Object storage returned unexpected media metadata.");
    }
    const now = this.dependencies.clock.now();
    try {
      await this.dependencies.media.createMedia({
        tags,
        createdAt: now,
        createdBy: input.actor.id,
        filename: sanitizeMediaFilename(input.filename),
        height: dimensions.height,
        id,
        mimeType,
        sha256,
        size: bytes.byteLength,
        storageKey,
        width: dimensions.width,
      });
    } catch (error) {
      await this.cleanupAfterMetadataFailure(storageKey, true);
      throw error;
    }
    // Metadata is committed: a reload failure must not trigger object cleanup.
    return this.catalogView(id, "Created media could not be reloaded.");
  }

  public async get(input: GetMediaUseCaseInput): Promise<MediaDetailView | null> {
    requirePermission(input.actor, "content:read");
    const item = await this.dependencies.media.loadMediaCatalogItem(input.mediaId);
    if (item === null) return null;
    const usage = await this.dependencies.media.loadMediaUsage({
      limit: MAX_MEDIA_USAGE_ENTRIES,
      mediaId: input.mediaId,
    });
    return Object.freeze({
      ...toMediaView(detached(item)),
      usage: Object.freeze(detached(usage.slice(0, MAX_MEDIA_USAGE_ENTRIES))),
    });
  }

  public async list(input: ListMediaUseCaseInput): Promise<CursorPage<MediaView>> {
    requirePermission(input.actor, "content:read");
    const tags = validatedTags(input.tags === undefined ? [] : input.tags, 5);
    const q = input.q?.trim();
    if (q !== undefined && q.length > MAX_MEDIA_SEARCH_LENGTH) {
      failure(`Search terms must not exceed ${MAX_MEDIA_SEARCH_LENGTH} characters.`);
    }
    if (
      input.type !== undefined &&
      !ALLOWED_MEDIA_MIME_TYPES.includes(input.type as MediaMimeType)
    ) {
      failure("Media type filter is unsupported.");
    }
    if (input.sort !== undefined && !MEDIA_SORTS.includes(input.sort as MediaSort)) {
      failure("Media sort is unsupported.");
    }
    if (input.sha256 !== undefined && !isMediaSha256(input.sha256)) {
      failure("A media hash must be 64 lowercase hexadecimal characters.");
    }
    const page = await this.dependencies.media.listMedia({
      tags,
      ...(input.sha256 === undefined ? {} : { sha256: input.sha256 }),
      ...(input.after === undefined ? {} : { after: input.after }),
      limit: input.limit,
      ...(q === undefined || q.length === 0 ? {} : { q }),
      sort: (input.sort as MediaSort | undefined) ?? DEFAULT_MEDIA_SORT,
      ...(input.type === undefined ? {} : { type: input.type as MediaMimeType }),
    });
    return Object.freeze({
      items: Object.freeze(page.items.map((item) => toMediaView(detached(item)))),
      ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
    });
  }

  public async listTags(
    input: ListMediaTagsInput & { readonly actor: Actor },
  ): Promise<CursorPage<MediaTagCount>> {
    requirePermission(input.actor, "content:read");
    if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > MAX_PAGE_SIZE)
      failure(`Tag catalog limit must be from 1 to ${MAX_PAGE_SIZE}.`);
    const q = input.q === undefined ? undefined : normalizeMediaTag(input.q);
    if (input.q !== undefined && q === undefined) failure("Tag prefix is invalid.");
    return detached(
      await this.dependencies.media.listMediaTags({
        limit: input.limit,
        ...(input.after === undefined ? {} : { after: input.after }),
        ...(q === undefined ? {} : { q }),
      }),
    );
  }

  public async requestDeletion(input: DeleteMediaUseCaseInput): Promise<MediaView> {
    requirePermission(input.actor, "media:write");
    if (input.detach === "drafts") await this.detachDraftUsage(input);
    const result = await this.dependencies.media.markForDeletion({
      mediaId: input.mediaId,
      requestedAt: this.dependencies.clock.now(),
      requestedBy: input.actor,
    });
    return this.catalogView(result.media.id, "Media deletion mark could not be reloaded.");
  }

  public async retryDeletion(input: DeleteMediaUseCaseInput): Promise<MediaView> {
    requirePermission(input.actor, "media:write");
    const result = await this.dependencies.media.retryDeletion({
      mediaId: input.mediaId,
      requestedAt: this.dependencies.clock.now(),
      requestedBy: input.actor,
    });
    return this.catalogView(result.media.id, "Media deletion retry could not be reloaded.");
  }

  /**
   * Edits an active item's descriptive metadata at the expected version. A
   * change to media used by a current publication advances the published
   * version and requests a build atomically; a submission that changes
   * nothing writes nothing. Returns `null` for an unknown item.
   */
  public async updateMetadata(
    input: UpdateMediaMetadataUseCaseInput,
  ): Promise<UpdateMediaMetadataUseCaseResult | null> {
    requirePermission(input.actor, "media:write");
    const patch = normalizeMediaMetadataPatch(input.patch);
    const expectedUpdatedAt = unixMilliseconds(input.expectedUpdatedAt);
    const current = await this.dependencies.media.loadMedia(input.mediaId);
    if (current === null) return null;
    if (current.status !== "active") failure("Only active media can be edited.");
    if (current.updatedAt !== expectedUpdatedAt) {
      throw new DomainError("MEDIA_UPDATE_CONFLICT", "The media was modified by another request.");
    }
    const stored = {
      alt: current.alt ?? null,
      caption: current.caption ?? null,
      tags: current.tags ?? [],
      focalPoint: current.focalPoint ?? null,
    };
    const next = {
      tags: patch.tags ?? stored.tags,
      alt: patch.alt === undefined ? stored.alt : patch.alt,
      caption: patch.caption === undefined ? stored.caption : patch.caption,
      focalPoint: patch.focalPoint === undefined ? stored.focalPoint : patch.focalPoint,
    };
    const descriptiveChanged = !(
      next.alt === stored.alt &&
      next.caption === stored.caption &&
      sameFocalPoint(next.focalPoint, stored.focalPoint)
    );
    if (!descriptiveChanged && JSON.stringify(next.tags) === JSON.stringify(stored.tags)) {
      return Object.freeze({
        build: Object.freeze({ status: "not-dispatched" }),
        media: await this.catalogView(current.id, "Media could not be reloaded."),
      });
    }
    const result = await this.dependencies.media.updateMediaMetadata({
      ...next,
      publishedEffect: descriptiveChanged,
      expectedUpdatedAt,
      mediaId: current.id,
      requestedBy: input.actor,
      updatedAt: unixMilliseconds(Math.max(this.dependencies.clock.now(), expectedUpdatedAt + 1)),
    });
    return Object.freeze({
      build: Object.freeze(
        result.targetVersion === undefined
          ? { status: "not-dispatched" }
          : { status: "queued", targetVersion: result.targetVersion },
      ),
      media: await this.catalogView(result.media.id, "Updated media could not be reloaded."),
    });
  }

  public async preview(input: GetMediaUseCaseInput): Promise<MediaBinary | null> {
    const media = await this.resolvePreview(input);
    return media === null ? null : this.openBinary(media);
  }

  public async readPublic(input: PublicMediaBinaryUseCaseInput): Promise<MediaBinary | null> {
    const media = await this.resolvePublic(input);
    return media === null ? null : this.openBinary(media);
  }

  /**
   * Decides authorization and preview eligibility without reading object
   * storage, so a caller can answer a conditional request first.
   */
  public async resolvePreview(input: GetMediaUseCaseInput): Promise<MediaMetadata | null> {
    requirePermission(input.actor, "content:read");
    const media = await this.dependencies.media.loadMedia(input.mediaId);
    return media === null || media.status !== "active" ? null : media;
  }

  /** Decides public eligibility (current publication use) without reading object storage. */
  public async resolvePublic(input: PublicMediaBinaryUseCaseInput): Promise<MediaMetadata | null> {
    const media = await this.dependencies.publicMedia?.loadPublicMedia(input.mediaId);
    return media === undefined || media === null || media.status !== "active" ? null : media;
  }

  /** Opens the stored bytes of media already resolved as eligible. */
  public async openBinary(media: MediaMetadata): Promise<MediaBinary> {
    const mimeType = media.mimeType;
    if (!ALLOWED_MEDIA_MIME_TYPES.includes(mimeType as MediaMimeType)) {
      throw new InvariantError("Stored media has an unsupported MIME type.");
    }
    const body = await this.dependencies.storage.get(media.storageKey);
    if (body === null) throw new InvariantError("Stored media object is unavailable.");
    return Object.freeze({
      body,
      filename: sanitizeMediaFilename(media.filename),
      mimeType: mimeType as MediaMimeType,
    });
  }

  /**
   * Detaches the item from every using draft before a deletion request. It
   * refuses, before changing any draft, an inactive item, an item a current
   * publication uses, and usage beyond the bounded usage read. Each draft save
   * is atomic on its own; the final deletion guard stays authoritative.
   */
  private async detachDraftUsage(input: DeleteMediaUseCaseInput): Promise<void> {
    requirePermission(input.actor, "content:write");
    const drafts = this.dependencies.drafts;
    if (drafts === undefined) failure("Detaching media from drafts is unavailable.");
    const item = await this.dependencies.media.loadMediaCatalogItem(input.mediaId);
    if (item === null) failure("Media does not exist.");
    if (item.media.status !== "active") failure("Only active media can be detached.");
    const usage = await this.dependencies.media.loadMediaUsage({
      limit: MAX_MEDIA_USAGE_ENTRIES,
      mediaId: input.mediaId,
    });
    const published = usage.some((entry) =>
      entry.locations.some((location) => location.states.includes("published")),
    );
    if (published) {
      throw new DomainError("MEDIA_IN_USE", "A current publication still uses this media.");
    }
    if (item.usageCount > usage.length) {
      throw new DomainError("MEDIA_IN_USE", "Too many entries use this media to detach it.");
    }
    for (const entry of usage) {
      await drafts.detachMedia({
        actor: input.actor,
        entryId: entry.entryId,
        mediaId: input.mediaId,
      });
    }
  }

  private async catalogView(id: MediaId, missing: string): Promise<MediaView> {
    const item = await this.dependencies.media.loadMediaCatalogItem(id);
    if (item === null) throw new InvariantError(missing);
    return toMediaView(detached(item));
  }

  private async cleanupAfterMetadataFailure(
    storageKey: string,
    metadataFailure: boolean,
  ): Promise<void> {
    if (metadataFailure) {
      await this.recordOperationalError({
        code: "MEDIA_METADATA_CREATE_FAILED",
        storageKey,
      });
    }
    try {
      await this.dependencies.storage.delete(storageKey);
    } catch {
      await this.recordOperationalError({
        code: "MEDIA_OBJECT_CLEANUP_FAILED",
        storageKey,
      });
    }
  }

  private async recordOperationalError(input: {
    readonly code: "MEDIA_METADATA_CREATE_FAILED" | "MEDIA_OBJECT_CLEANUP_FAILED";
    readonly storageKey: string;
  }): Promise<void> {
    try {
      await this.dependencies.logger.error(input);
    } catch {
      // Operational logging must not prevent object cleanup or replace the original failure.
    }
  }
}
