import type { ContentEntryStatus } from "./content.js";
import type {
  Actor,
  ActorId,
  BlockKey,
  ContentEntryId,
  ContentModelKey,
  MediaFocalPoint,
  MediaId,
  MediaMetadata,
  UnixMilliseconds,
} from "@lacecms/domain";
import type { OpaqueCursor, DispatcherLeaseId } from "../shared/brands.js";
import type { CursorPage } from "../shared/pagination.js";
import type { ActorSummary } from "../shared/actors.js";

export interface PutObjectInput {
  readonly body: ByteStream;
  readonly contentType: string;
  readonly key: string;
}

export interface StoredObject {
  readonly contentType: string;
  readonly key: string;
  readonly size: number;
}

/** A portable binary stream without binding the application layer to a runtime API. */
export interface ByteStream extends AsyncIterable<Uint8Array> {}

export interface ReadUrlOptions {
  readonly expiresAt?: UnixMilliseconds;
}

export interface ObjectStorage {
  createReadUrl(key: string, options?: ReadUrlOptions): Promise<string>;
  delete(key: string): Promise<void>;
  get(key: string): Promise<ByteStream | null>;
  put(input: PutObjectInput): Promise<StoredObject>;
}

export type MediaMimeType = "image/avif" | "image/gif" | "image/jpeg" | "image/png" | "image/webp";

/**
 * A verified image result. Implementations MUST parse the complete byte sequence,
 * reject malformed or trailing data, and report dimensions from the image itself
 * after applying its embedded orientation, so they are the displayed dimensions.
 */
export interface ImageInspector {
  inspect(bytes: Uint8Array, mimeType: MediaMimeType): Promise<ImageDimensions>;
}

export interface ImageDimensions {
  readonly height: number;
  readonly width: number;
}

/** Metadata-only media reads remain separate from binary object storage. */
export interface MediaReadPort {
  loadMedia(id: string): Promise<MediaMetadata | null>;
}

/** Bounded set-based metadata validation for complete content mutations. */
export interface ContentMediaReadPort extends MediaReadPort {
  loadMediaMany(ids: readonly string[]): Promise<readonly MediaMetadata[]>;
}

/** Admin media-list order; a leading `-` sorts descending. */
export type MediaSort = "-createdAt" | "-filename" | "-size" | "createdAt" | "filename" | "size";

export const MEDIA_SORTS: readonly MediaSort[] = Object.freeze([
  "-createdAt",
  "-filename",
  "-size",
  "createdAt",
  "filename",
  "size",
]);

export const DEFAULT_MEDIA_SORT: MediaSort = "-createdAt";

export interface ListMediaInput {
  readonly tags?: readonly string[];
  /** Restricts the page to `active` items with this lowercase-hex SHA-256. */
  readonly sha256?: string;
  readonly after?: OpaqueCursor;
  readonly limit: number;
  /** Trimmed, non-empty filename substring; matched case-insensitively for ASCII. */
  readonly q?: string;
  readonly sort: MediaSort;
  readonly type?: MediaMimeType;
}

/** Media metadata with its uploader's display name and distinct referencing-entry count. */
export interface MediaCatalogItem {
  readonly createdBy: ActorSummary;
  readonly media: MediaMetadata;
  readonly usageCount: number;
}

export interface ListMediaTagsInput {
  readonly after?: OpaqueCursor;
  readonly limit: number;
  readonly q?: string;
}

export interface MediaTagCount {
  readonly tag: string;
  readonly count: number;
}

export interface MediaListPort {
  listMediaTags(input: ListMediaTagsInput): Promise<CursorPage<MediaTagCount>>;
  listMedia(input: ListMediaInput): Promise<CursorPage<MediaCatalogItem>>;
}

/** Which of an entry's current snapshots reference a media item at one location. */
export type MediaUsageState = "draft" | "published";

export type MediaUsageLocation =
  | {
      readonly field: string;
      readonly source: "field";
      readonly states: readonly MediaUsageState[];
    }
  | {
      readonly field: "image";
      readonly source: "seo";
      readonly states: readonly MediaUsageState[];
    }
  | {
      readonly blockKey: BlockKey;
      readonly blockType: string;
      readonly field: string;
      readonly source: "block";
      readonly states: readonly MediaUsageState[];
    };

/** One entry whose current draft or published snapshot references a media item. */
export interface MediaUsageEntry {
  readonly entryId: ContentEntryId;
  readonly locations: readonly MediaUsageLocation[];
  readonly modelKey: ContentModelKey;
  readonly slug?: string;
  readonly status: ContentEntryStatus;
  readonly title: string;
}

export interface LoadMediaUsageInput {
  readonly limit: number;
  readonly mediaId: MediaId;
}

/**
 * Presentation reads derived from the same reference projection that guards
 * deletion; lifecycle reads stay on `MediaReadPort`.
 */
export interface MediaCatalogPort {
  loadMediaCatalogItem(id: string): Promise<MediaCatalogItem | null>;
  loadMediaUsage(input: LoadMediaUsageInput): Promise<readonly MediaUsageEntry[]>;
}

export interface CreateMediaMetadataInput {
  readonly tags?: readonly string[];
  /** SHA-256 of the stored bytes as lowercase hex. */
  readonly sha256?: string;
  readonly createdAt: UnixMilliseconds;
  readonly createdBy: ActorId;
  readonly filename: string;
  readonly height: number;
  readonly id: MediaId;
  readonly mimeType: MediaMimeType;
  readonly size: number;
  readonly storageKey: string;
  readonly width: number;
}

/** A durable request to delete binary media asynchronously after reference checks. */
export interface MarkMediaForDeletionInput {
  readonly mediaId: MediaId;
  readonly requestedAt: UnixMilliseconds;
  readonly requestedBy: Actor;
}

export interface MarkMediaForDeletionResult {
  readonly media: MediaMetadata;
  readonly status: "deleting";
}

/**
 * Replaces an active item's descriptive metadata with complete values, guarded
 * by the `updatedAt` the values were merged from.
 */
export interface UpdateMediaMetadataInput {
  readonly tags?: readonly string[];
  readonly publishedEffect?: boolean;
  readonly alt: string | null;
  readonly caption: string | null;
  readonly expectedUpdatedAt: UnixMilliseconds;
  readonly focalPoint: MediaFocalPoint | null;
  readonly mediaId: MediaId;
  readonly requestedBy: Actor;
  /** Strictly greater than `expectedUpdatedAt`, so every version has a distinct tag. */
  readonly updatedAt: UnixMilliseconds;
}

export interface UpdateMediaMetadataResult {
  readonly media: MediaMetadata;
  /** Present only when a current publication uses the item and a build was requested. */
  readonly targetVersion?: number;
}

/** Mutation remains separate from metadata reads and binary object storage. */
export interface MediaCommandPort {
  createMedia(input: CreateMediaMetadataInput): Promise<MediaMetadata>;
  markForDeletion(input: MarkMediaForDeletionInput): Promise<MarkMediaForDeletionResult>;
  retryDeletion(input: MarkMediaForDeletionInput): Promise<MarkMediaForDeletionResult>;
  updateMediaMetadata(input: UpdateMediaMetadataInput): Promise<UpdateMediaMetadataResult>;
}

/** Private worker-only boundary: transport never receives the storage key. */
export interface MediaDeletionDispatchPort {
  completeMediaDeletion(input: {
    readonly completedAt: UnixMilliseconds;
    readonly leaseId: DispatcherLeaseId;
    readonly mediaId: MediaId;
  }): Promise<void>;
  failMediaDeletion(input: {
    readonly failedAt: UnixMilliseconds;
    readonly leaseId: DispatcherLeaseId;
    readonly mediaId: MediaId;
    readonly sanitizedError: string;
    readonly terminal: boolean;
    readonly retryAt?: UnixMilliseconds;
  }): Promise<void>;
  loadDeletingMedia(id: MediaId): Promise<MediaMetadata | null>;
}
