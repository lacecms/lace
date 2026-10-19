import {
  DomainError,
  isMediaFocalCoordinate,
  mediaId,
  normalizeMediaText,
  requirePermission,
  unixMilliseconds,
} from "@lacecms/domain";
import type {
  Actor,
  ContentEntryId,
  MediaFocalPoint,
  MediaId,
  MediaMetadata,
  MediaTextKind,
  UnixMilliseconds,
} from "@lacecms/domain";
import {
  DEFAULT_MEDIA_SORT,
  MAX_MEDIA_SEARCH_LENGTH,
  MAX_MEDIA_USAGE_ENTRIES,
  MEDIA_SORTS,
} from "./index.js";
import type {
  ActorSummary,
  ByteStream,
  Clock,
  CursorPage,
  IdGenerator,
  ImageInspector,
  MediaCatalogItem,
  MediaCatalogPort,
  MediaCommandPort,
  MediaListPort,
  MediaMimeType,
  MediaReadPort,
  MediaSort,
  MediaUsageEntry,
  ObjectStorage,
  OpaqueCursor,
  OperationalLogger,
  PublicContentReadPort,
} from "./index.js";

export const MAX_MEDIA_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 12_000;
export const MAX_IMAGE_PIXELS = 100_000_000;
export const ALLOWED_MEDIA_MIME_TYPES = Object.freeze([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const);

export interface MediaView {
  readonly alt?: string;
  readonly caption?: string;
  readonly createdAt: UnixMilliseconds;
  readonly createdBy: ActorSummary;
  readonly filename: string;
  readonly focalPoint?: MediaFocalPoint;
  readonly height?: number;
  readonly id: MediaId;
  readonly mimeType: MediaMimeType;
  readonly size: number;
  readonly status: MediaMetadata["status"];
  readonly updatedAt: UnixMilliseconds;
  readonly usageCount: number;
  readonly width?: number;
}

/** A single media item with the bounded list of entries that use it. */
export interface MediaDetailView extends MediaView {
  readonly usage: readonly MediaUsageEntry[];
}

export interface CreateMediaUseCaseInput {
  readonly actor: Actor;
  readonly body: ByteStream;
  readonly filename: string;
}

export interface ListMediaUseCaseInput {
  readonly actor: Actor;
  readonly after?: OpaqueCursor;
  readonly limit: number;
  readonly q?: string;
  readonly sort?: string;
  readonly type?: string;
}

export interface GetMediaUseCaseInput {
  readonly actor: Actor;
  readonly mediaId: MediaId;
}

export interface DeleteMediaUseCaseInput extends GetMediaUseCaseInput {
  /**
   * `drafts` first removes the item from the current draft of every using
   * entry; it is refused while any current publication uses the item.
   */
  readonly detach?: "drafts";
}

/** Removes one media item from an entry's current draft (a guarded draft save). */
export interface MediaDraftDetachPort {
  detachMedia(input: {
    readonly actor: Actor;
    readonly entryId: ContentEntryId;
    readonly mediaId: MediaId;
  }): Promise<unknown>;
}

/** An omitted value stays unchanged; `null` (or empty text) clears it. */
export interface MediaMetadataPatch {
  readonly alt?: string | null | undefined;
  readonly caption?: string | null | undefined;
  readonly focalPoint?: MediaFocalPoint | null | undefined;
}

export interface UpdateMediaMetadataUseCaseInput {
  readonly actor: Actor;
  /** The `updatedAt` of the version the writer edited. */
  readonly expectedUpdatedAt: UnixMilliseconds;
  readonly mediaId: MediaId;
  readonly patch: MediaMetadataPatch;
}

export type MediaBuildOutcome =
  | { readonly status: "not-dispatched" }
  | { readonly status: "queued"; readonly targetVersion: number };

export interface UpdateMediaMetadataUseCaseResult {
  readonly build: MediaBuildOutcome;
  readonly media: MediaView;
}

/** Normalized patch values; `undefined` keeps the stored value. */
export interface NormalizedMediaMetadataPatch {
  readonly alt?: string | null;
  readonly caption?: string | null;
  readonly focalPoint?: MediaFocalPoint | null;
}

export interface PublicMediaBinaryUseCaseInput {
  readonly mediaId: MediaId;
}

export interface MediaBinary {
  readonly body: ByteStream;
  readonly filename: string;
  readonly mimeType: MediaMimeType;
}

export interface MediaUseCaseDependencies {
  readonly clock: Clock;
  /** Required only for deletion requests that detach draft usage. */
  readonly drafts?: MediaDraftDetachPort;
  readonly idGenerator: IdGenerator;
  readonly imageInspector: ImageInspector;
  readonly logger: OperationalLogger;
  readonly media: MediaReadPort & MediaListPort & MediaCatalogPort & MediaCommandPort;
  readonly publicMedia?: Pick<PublicContentReadPort, "loadPublicMedia">;
  readonly storage: ObjectStorage;
}

function failure(message: string): never {
  throw new DomainError("CONTENT_INVALID_STATE", message);
}

function detached<Value>(value: Value): Value {
  return JSON.parse(JSON.stringify(value)) as Value;
}

function isPrefix(bytes: Uint8Array, prefix: readonly number[]): boolean {
  return prefix.every((value, index) => bytes[index] === value);
}

/** Detects format only; ImageInspector validates container structure and dimensions. */
export function detectMediaMimeType(bytes: Uint8Array): MediaMimeType {
  if (bytes.byteLength === 0) failure("Media upload must not be empty.");
  if (isPrefix(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (isPrefix(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  // GIF87a or GIF89a.
  if (
    isPrefix(bytes, [0x47, 0x49, 0x46, 0x38]) &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return "image/gif";
  }
  if (
    bytes.byteLength >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  if (
    bytes.byteLength >= 16 &&
    String.fromCharCode(...bytes.slice(4, 8)) === "ftyp" &&
    ["avif", "avis"].includes(String.fromCharCode(...bytes.slice(8, 12)))
  ) {
    return "image/avif";
  }
  failure("Media upload is not an allowed image format.");
}

export function sanitizeMediaFilename(value: string): string {
  const withoutUnsafeCharacters = [...value.normalize("NFKC")]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code <= 0x1f ||
        (code >= 0x7f && code <= 0x9f) ||
        character === "/" ||
        character === "\\"
        ? " "
        : character;
    })
    .join("");
  const normalized = withoutUnsafeCharacters.replace(/\s+/gu, " ").trim().slice(0, 255);
  return normalized.length === 0 ? "upload" : normalized;
}

export async function collectMediaBytes(body: ByteStream): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of body) {
    if (!(chunk instanceof Uint8Array)) failure("Media stream yielded invalid binary data.");
    size += chunk.byteLength;
    if (size > MAX_MEDIA_BYTES) failure("Media upload exceeds the 10 MiB limit.");
    chunks.push(chunk.slice());
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function streamBytes(bytes: Uint8Array): ByteStream {
  return {
    async *[Symbol.asyncIterator](): AsyncGenerator<Uint8Array> {
      yield bytes.slice();
    },
  };
}

function normalizeText(value: unknown, kind: MediaTextKind): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const normalized = typeof value === "string" ? normalizeMediaText(value, kind) : undefined;
  if (normalized === undefined) {
    failure(
      kind === "alt"
        ? "Alt text must be single-line plain text of at most 1,000 characters."
        : "A caption must be plain text of at most 2,000 characters.",
    );
  }
  return normalized;
}

/**
 * Validates a metadata patch with the shared domain rules: trims text, maps
 * empty text to `null`, normalizes caption line breaks, and requires a focal
 * point of two finite coordinates from 0 to 1.
 */
export function normalizeMediaMetadataPatch(
  patch: MediaMetadataPatch,
): NormalizedMediaMetadataPatch {
  if (typeof patch !== "object" || patch === null) failure("Media metadata patch is invalid.");
  const keys = Object.keys(patch);
  if (keys.some((key) => key !== "alt" && key !== "caption" && key !== "focalPoint")) {
    failure("Media metadata patch contains an unknown value.");
  }
  if (keys.every((key) => patch[key as keyof MediaMetadataPatch] === undefined)) {
    failure("Supply at least one of alt, caption, or focalPoint.");
  }
  const alt = normalizeText(patch.alt, "alt");
  const caption = normalizeText(patch.caption, "caption");
  let focalPoint: MediaFocalPoint | null | undefined;
  if (patch.focalPoint === null) focalPoint = null;
  else if (patch.focalPoint !== undefined) {
    const point = patch.focalPoint as unknown;
    if (
      typeof point !== "object" ||
      point === null ||
      Object.keys(point).length !== 2 ||
      !isMediaFocalCoordinate((point as { x?: unknown }).x) ||
      !isMediaFocalCoordinate((point as { y?: unknown }).y)
    ) {
      failure("A focal point must have x and y coordinates from 0 to 1.");
    }
    focalPoint = Object.freeze({
      x: (point as MediaFocalPoint).x,
      y: (point as MediaFocalPoint).y,
    });
  }
  return Object.freeze({
    ...(alt === undefined ? {} : { alt }),
    ...(caption === undefined ? {} : { caption }),
    ...(focalPoint === undefined ? {} : { focalPoint }),
  });
}

function sameFocalPoint(left: MediaFocalPoint | null, right: MediaFocalPoint | null): boolean {
  return left === null || right === null
    ? left === right
    : left.x === right.x && left.y === right.y;
}

function toMediaView(item: MediaCatalogItem): MediaView {
  const value = item.media;
  const mimeType = value.mimeType;
  if (!ALLOWED_MEDIA_MIME_TYPES.includes(mimeType as MediaMimeType)) {
    failure("Media metadata has an unsupported MIME type.");
  }
  return Object.freeze({
    ...(value.alt === undefined ? {} : { alt: value.alt }),
    ...(value.caption === undefined ? {} : { caption: value.caption }),
    createdAt: value.createdAt,
    createdBy: Object.freeze({ displayName: item.createdBy.displayName, id: item.createdBy.id }),
    filename: value.filename,
    ...(value.focalPoint === undefined
      ? {}
      : { focalPoint: Object.freeze({ x: value.focalPoint.x, y: value.focalPoint.y }) }),
    ...(value.height === undefined ? {} : { height: value.height }),
    id: value.id,
    mimeType: mimeType as MediaMimeType,
    size: value.size,
    status: value.status,
    updatedAt: value.updatedAt,
    usageCount: item.usageCount,
    ...(value.width === undefined ? {} : { width: value.width }),
  });
}

function validateDimensions(width: number, height: number): void {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > MAX_IMAGE_DIMENSION ||
    height > MAX_IMAGE_DIMENSION ||
    width * height > MAX_IMAGE_PIXELS
  ) {
    failure("Image dimensions exceed the allowed limits.");
  }
}

/** Portable orchestration for media policy and metadata lifecycle commands. */
export class MediaUseCases {
  public constructor(private readonly dependencies: MediaUseCaseDependencies) {}

  public async create(input: CreateMediaUseCaseInput): Promise<MediaView> {
    requirePermission(input.actor, "media:write");
    const bytes = await collectMediaBytes(input.body);
    const mimeType = detectMediaMimeType(bytes);
    const dimensions = await this.dependencies.imageInspector.inspect(bytes, mimeType);
    validateDimensions(dimensions.width, dimensions.height);
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
        createdAt: now,
        createdBy: input.actor.id,
        filename: sanitizeMediaFilename(input.filename),
        height: dimensions.height,
        id,
        mimeType,
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
    const page = await this.dependencies.media.listMedia({
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
      focalPoint: current.focalPoint ?? null,
    };
    const next = {
      alt: patch.alt === undefined ? stored.alt : patch.alt,
      caption: patch.caption === undefined ? stored.caption : patch.caption,
      focalPoint: patch.focalPoint === undefined ? stored.focalPoint : patch.focalPoint,
    };
    if (
      next.alt === stored.alt &&
      next.caption === stored.caption &&
      sameFocalPoint(next.focalPoint, stored.focalPoint)
    ) {
      return Object.freeze({
        build: Object.freeze({ status: "not-dispatched" }),
        media: await this.catalogView(current.id, "Media could not be reloaded."),
      });
    }
    const result = await this.dependencies.media.updateMediaMetadata({
      ...next,
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
      throw new Error("Stored media has an unsupported MIME type.");
    }
    const body = await this.dependencies.storage.get(media.storageKey);
    if (body === null) throw new Error("Stored media object is unavailable.");
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
    if (item === null) throw new Error(missing);
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
