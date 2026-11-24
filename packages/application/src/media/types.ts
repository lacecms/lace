import type {
  Actor,
  ContentEntryId,
  MediaFocalPoint,
  MediaId,
  MediaMetadata,
  UnixMilliseconds,
} from "@lacecms/domain";
import type { ActorSummary } from "../shared/actors.js";
import type {
  ByteStream,
  ImageInspector,
  MediaCatalogPort,
  MediaDraftOwner,
  MediaCommandPort,
  MediaListPort,
  MediaMimeType,
  MediaReadPort,
  MediaUploadOwnershipPort,
  MediaUsageEntry,
  ObjectStorage,
} from "../ports/media.js";
import type { Clock, IdGenerator, OperationalLogger } from "../ports/infrastructure.js";
import type { OpaqueCursor } from "../shared/brands.js";
import type { PublicContentReadPort } from "../ports/content.js";

export interface MediaView {
  readonly tags: readonly string[];
  readonly sha256?: string;
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
  readonly tags?: readonly string[];
  readonly actor: Actor;
  readonly body: ByteStream;
  readonly filename: string;
  /** Receives only the identity after the original and metadata are known committed. */
  readonly onCommitted?: (id: MediaId) => void;
}

export interface ListMediaUseCaseInput {
  readonly tags?: readonly string[];
  readonly sha256?: string;
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

export type DeleteMediaUseCaseInput = GetMediaUseCaseInput;
export type MediaDetachStep =
  | { readonly step?: "finish" }
  | ({ readonly step: "entry" } & MediaDraftOwner);
export type MediaDetachProgress =
  | { readonly state: "drafts"; readonly drafts: readonly MediaDraftOwner[] }
  | { readonly state: "entry-complete"; readonly entryId: ContentEntryId };

/** Removes one media item from an entry's current draft (a guarded draft save). */
export interface MediaDraftDetachPort {
  detachMedia(input: {
    readonly expectedRevision: number;
    readonly actor: Actor;
    readonly entryId: ContentEntryId;
    readonly mediaId: MediaId;
  }): Promise<boolean>;
}

/** An omitted value stays unchanged; `null` (or empty text) clears it. */
export interface MediaMetadataPatch {
  readonly tags?: readonly string[] | undefined;
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
  readonly tags?: readonly string[];
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
  readonly media: MediaReadPort &
    MediaListPort &
    MediaCatalogPort &
    MediaCommandPort &
    MediaUploadOwnershipPort;
  readonly publicMedia?: Pick<PublicContentReadPort, "loadPublicMedia">;
  readonly storage: ObjectStorage;
}
