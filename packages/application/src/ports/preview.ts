import type {
  ActorId,
  ContentEntryId,
  ContentModelKey,
  MediaMetadata,
  MediaId,
  PreviewFailureReason,
  PreviewState,
  UnixMilliseconds,
} from "@lacecms/domain";
import type { ContentBlock } from "@lacecms/domain";
import type { JsonObject, PublicInternalLinkReference } from "@lacecms/content";
import type {
  BuildContentExportPage,
  ExportBuildContentPageInput,
  PublishedProjection,
} from "./content.js";
import type { ByteStream } from "./media.js";

/** Values selected by operator configuration, never by a preview creation request. */
export interface PreviewSource {
  readonly commit: string;
  readonly executor: string;
}

export interface PreviewRequest {
  readonly entryId: ContentEntryId;
  readonly expectedRevision: number;
  readonly idempotencyKey: string;
}

export interface PreviewStatus {
  readonly id: string;
  readonly revision: number;
  readonly state: PreviewState;
  readonly createdAt: UnixMilliseconds;
  readonly readyAt?: UnixMilliseconds;
  readonly expiresAt?: UnixMilliseconds;
  readonly reason?: PreviewFailureReason;
}

export interface PreviewCaptureFence {
  readonly configuration: string;
  readonly publicVersion: number;
  readonly captureEpoch: number;
}

export interface PreviewGeneration extends PreviewStatus, PreviewCaptureFence {
  readonly entryId: ContentEntryId;
  readonly modelKey: ContentModelKey;
  readonly path: string;
  readonly source: PreviewSource;
  readonly overallDeadline: UnixMilliseconds;
}

export interface AdmitPreview extends PreviewRequest, PreviewCaptureFence {
  readonly id: string;
  readonly actorId: ActorId;
  readonly modelKey: ContentModelKey;
  readonly path: string;
  readonly draftSnapshotId: string;
  readonly projection: PublishedProjection;
  readonly source: PreviewSource;
  readonly now: UnixMilliseconds;
}

export type PreviewAdmission =
  | { readonly kind: "admitted"; readonly generation: PreviewGeneration }
  | { readonly kind: "replayed"; readonly generation: PreviewGeneration }
  | { readonly kind: "rejected"; readonly reason: PreviewFailureReason };

export interface PreviewTarget {
  readonly title: string;
  readonly slug?: string;
  readonly fields: JsonObject;
  readonly seo?: JsonObject;
  readonly blocks: readonly ContentBlock[];
  readonly internalLinks: readonly PublicInternalLinkReference[];
  readonly media: readonly MediaMetadata[];
}

export interface PreviewReadPort {
  readonly previewContextPage: (
    input: ExportBuildContentPageInput,
  ) => Promise<BuildContentExportPage>;
  readonly previewCaptureFence: () => Promise<PreviewCaptureFence>;
  readonly findPreviewRequest: (
    input: PreviewRequest & { readonly actorId: ActorId },
  ) => Promise<PreviewAdmission | null>;
  readonly currentPreview: (
    entryId: ContentEntryId,
    now: UnixMilliseconds,
  ) => Promise<PreviewStatus | null>;
  readonly readyPreview: (id: string, now: UnixMilliseconds) => Promise<PreviewObject | null>;
  readonly capturedPreviewTarget: (id: string) => Promise<PreviewTarget | null>;
}

export interface PreviewObject {
  readonly sha256: string;
  readonly bytes: number;
}

export interface PreviewClaim {
  readonly id: string;
  readonly executor: string;
  readonly run: string;
  readonly commit: string;
  /** Store only a one-way digest of the scoped token. */
  readonly credentialHash: string;
  readonly now: UnixMilliseconds;
}

export interface PreviewExecution {
  readonly generation: PreviewGeneration;
  readonly input: PreviewObject;
  readonly deadline: UnixMilliseconds;
}

export interface PreviewCapturePort {
  readonly admitPreview: (input: AdmitPreview) => Promise<PreviewAdmission>;
  readonly trackPreviewMedia: (
    id: string,
    media: readonly MediaId[],
    now: UnixMilliseconds,
  ) => Promise<boolean>;
  readonly sealPreviewInput: (
    id: string,
    manifest: PreviewObject,
    now: UnixMilliseconds,
  ) => Promise<boolean>;
  readonly failPreviewPreparation: (
    id: string,
    reason: PreviewFailureReason,
    now: UnixMilliseconds,
  ) => Promise<boolean>;
}

export interface PreviewCommandPort extends PreviewCapturePort {
  readonly runningPreview: (claim: PreviewClaim) => Promise<PreviewExecution | null>;
  readonly settlePreviewDeadline: (id: string, now: UnixMilliseconds) => Promise<boolean>;
  readonly claimPreview: (input: PreviewClaim) => Promise<PreviewExecution | null>;
  /** The trusted executor has completed site work and sealed this output. */
  readonly finalizePreview: (
    input: PreviewClaim & {
      readonly output: PreviewObject;
      readonly media: readonly MediaId[];
    },
  ) => Promise<boolean>;
  readonly failPreview: (
    id: string,
    reason: PreviewFailureReason,
    now: UnixMilliseconds,
    claim?: PreviewClaim,
  ) => Promise<boolean>;
}

export interface PreviewStopTarget extends PreviewGeneration {
  readonly run?: string;
}

export interface PreviewCleanupItem {
  readonly id: string;
  readonly scope: "input" | "all";
}

export interface PreviewMaintenancePort {
  readonly duePreviewDeadlines: (
    now: UnixMilliseconds,
    limit: number,
  ) => Promise<readonly string[]>;
  readonly settlePreviewDeadline: PreviewCommandPort["settlePreviewDeadline"];
  readonly previewExecutorToStop: () => Promise<PreviewStopTarget | null>;
  readonly confirmPreviewExecutorStopped: (id: string, now: UnixMilliseconds) => Promise<boolean>;
  readonly previewCleanup: (
    now: UnixMilliseconds,
    limit: number,
  ) => Promise<readonly PreviewCleanupItem[]>;
  readonly recordPreviewPurged: (
    item: PreviewCleanupItem,
    now: UnixMilliseconds,
  ) => Promise<boolean>;
  readonly purgePreviewHistory: (now: UnixMilliseconds, limit: number) => Promise<number>;
}

export interface PreviewRunner {
  readonly dispatch: (generation: PreviewGeneration) => Promise<void>;
  /** Confirm the executor cannot start or continue this generation before releasing capacity. */
  readonly stop: (generation: PreviewStopTarget) => Promise<"stopped" | "unconfirmed">;
}

export interface PreviewInputStore {
  readonly writeTarget: (id: string, target: PreviewTarget) => Promise<PreviewObject>;
  readonly writeContextPage: (
    id: string,
    index: number,
    page: BuildContentExportPage,
  ) => Promise<PreviewObject>;
  readonly sealInput: (
    id: string,
    target: PreviewObject,
    pages: readonly PreviewObject[],
  ) => Promise<PreviewObject>;
  /**
   * Delete a bounded batch under a generation's private namespace. Treat a missing object as
   * deleted. Return "empty" only after staged writes can no longer commit into that namespace.
   */
  readonly purge: (id: string, scope: "input" | "all", limit: number) => Promise<"empty" | "more">;
}

export interface PreviewArtifactStore {
  readonly read: (id: string, path: string) => Promise<ByteStream | null>;
}
