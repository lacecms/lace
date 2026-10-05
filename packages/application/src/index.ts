import type { JsonObject } from "@lacecms/content";
import type {
  Actor,
  ActorId,
  BlockKey,
  Brand,
  CompleteDraftMutation,
  ContentEntry,
  ContentEntryId,
  ContentModelKey,
  ContentSnapshotId,
  DraftMediaReference,
  MediaId,
  MediaMetadata,
  PublishedSnapshot,
  SiteBuildId,
  SiteBuildStatus,
  TrackedSiteBuildOutcome,
  UnixMilliseconds,
} from "@lacecms/domain";
import { requirePermission } from "@lacecms/domain";

export const packageName = "@lacecms/application";

export * from "./configuration-sync.js";
export * from "./site-build-use-cases.js";
export * from "./dispatchers.js";

export type OpaqueCursor = Brand<string, "OpaqueCursor">;
export type OpaqueTokenSecret = Brand<string, "OpaqueTokenSecret">;
export type OpaqueTokenVerifier = Brand<string, "OpaqueTokenVerifier">;
export type DispatcherEventId = Brand<string, "DispatcherEventId">;
export type DispatcherLeaseId = Brand<string, "DispatcherLeaseId">;
export type PublicationIdempotencyKey = Brand<string, "PublicationIdempotencyKey">;
export type PublicationRequestFingerprint = Brand<string, "PublicationRequestFingerprint">;

function opaqueBrand<Name extends string>(value: string, name: Name): Brand<string, Name> {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${name} must be a non-empty string.`);
  }
  return value as Brand<string, Name>;
}

export function opaqueCursor(value: string): OpaqueCursor {
  return opaqueBrand(value, "OpaqueCursor");
}

export function opaqueTokenSecret(value: string): OpaqueTokenSecret {
  return opaqueBrand(value, "OpaqueTokenSecret");
}

export function opaqueTokenVerifier(value: string): OpaqueTokenVerifier {
  return opaqueBrand(value, "OpaqueTokenVerifier");
}

export function dispatcherEventId(value: string): DispatcherEventId {
  return opaqueBrand(value, "DispatcherEventId");
}

export function dispatcherLeaseId(value: string): DispatcherLeaseId {
  return opaqueBrand(value, "DispatcherLeaseId");
}

/** A caller-supplied key that makes one guarded publication retry-safe. */
export function publicationIdempotencyKey(value: string): PublicationIdempotencyKey {
  return opaqueBrand(value, "PublicationIdempotencyKey");
}

/** Canonical application-generated identity of the complete publication request. */
export function publicationRequestFingerprint(value: string): PublicationRequestFingerprint {
  return opaqueBrand(value, "PublicationRequestFingerprint");
}

/** A transport-neutral cursor page. Cursors are intentionally opaque to callers. */
export interface CursorPage<Value> {
  readonly items: readonly Value[];
  readonly nextCursor?: OpaqueCursor;
}

/** Publication state derived from the draft and current published revisions. */
export type ContentEntryStatus = "changed" | "draft" | "published";

export const CONTENT_ENTRY_STATUSES: readonly ContentEntryStatus[] = Object.freeze([
  "changed",
  "draft",
  "published",
]);

/** Admin entry-list order; a leading `-` sorts descending. */
export type ContentEntrySort =
  | "-publishedAt"
  | "-title"
  | "-updatedAt"
  | "publishedAt"
  | "title"
  | "updatedAt";

export const CONTENT_ENTRY_SORTS: readonly ContentEntrySort[] = Object.freeze([
  "-publishedAt",
  "-title",
  "-updatedAt",
  "publishedAt",
  "title",
  "updatedAt",
]);

export const DEFAULT_CONTENT_ENTRY_SORT: ContentEntrySort = "-updatedAt";
export const MAX_CONTENT_ENTRY_SEARCH_LENGTH = 200;

/** Display name used for `system:` audit actors such as configuration sync. */
export const SYSTEM_ACTOR_DISPLAY_NAME = "System";
/** Display name used when an audit actor no longer has a user record. */
export const UNKNOWN_ACTOR_DISPLAY_NAME = "Unknown user";

/** A human-readable actor reference that keeps raw IDs out of rendered lists. */
export interface ActorSummary {
  readonly displayName: string;
  readonly id: ActorId;
}

/** Resolves the portable display-name fallbacks shared by every runtime adapter. */
export function actorDisplayName(id: string, storedName?: string | null): string {
  const name = storedName?.trim();
  if (name !== undefined && name.length > 0) return name;
  return id.startsWith("system:") ? SYSTEM_ACTOR_DISPLAY_NAME : UNKNOWN_ACTOR_DISPLAY_NAME;
}

/** Folds only ASCII letters, matching SQLite `lower()` so every adapter searches alike. */
export function foldAscii(value: string): string {
  return value.replace(/[A-Z]/gu, (letter) => letter.toLowerCase());
}

/** Scalar draft values of a model's configured list fields. */
export type ContentEntryListValues = Readonly<Record<string, boolean | number | string>>;

export interface ContentEntrySummary {
  readonly draftRevision: number;
  readonly id: ContentEntryId;
  readonly listValues: ContentEntryListValues;
  readonly modelKey: ContentModelKey;
  readonly publishedAt?: UnixMilliseconds;
  readonly publishedSnapshotId?: ContentSnapshotId;
  readonly slug?: string;
  readonly status: ContentEntryStatus;
  readonly title: string;
  readonly updatedAt: UnixMilliseconds;
  readonly updatedBy: ActorSummary;
}

/** Entry counts for one model and search term, independent of status filter and cursor. */
export interface ContentEntryStatusTotals {
  readonly all: number;
  readonly changed: number;
  readonly draft: number;
  readonly published: number;
}

export interface ContentEntryListPage extends CursorPage<ContentEntrySummary> {
  readonly totals: ContentEntryStatusTotals;
}

export interface LoadContentEntryInput {
  readonly entryId: ContentEntryId;
}

export interface ListContentEntriesInput {
  readonly after?: OpaqueCursor;
  readonly limit: number;
  /** Draft field keys whose scalar values are copied into each summary. */
  readonly listFields: readonly string[];
  readonly modelKey: ContentModelKey;
  /** A trimmed, non-empty title-or-slug substring; ASCII letters match case-insensitively. */
  readonly q?: string;
  readonly sort: ContentEntrySort;
  readonly status?: ContentEntryStatus;
}

export interface ContentEntryReadPort {
  /** Returns one summary per requested ID, in order, with display-name fallbacks applied. */
  describeActors(ids: readonly ActorId[]): Promise<readonly ActorSummary[]>;
  load(input: LoadContentEntryInput): Promise<ContentEntry | null>;
  loadDraft(input: LoadContentEntryInput): Promise<ContentEntry["draft"] | null>;
  loadPublished(input: LoadContentEntryInput): Promise<PublishedSnapshot | null>;
  list(input: ListContentEntriesInput): Promise<ContentEntryListPage>;
}

export interface CreateContentEntryInput {
  readonly entry: ContentEntry;
  readonly mediaReferences: readonly DraftMediaReference[];
}

export interface SaveCompleteDraftInput {
  readonly entryId: ContentEntryId;
  readonly mutation: CompleteDraftMutation;
}

export interface PublishContentEntryCommand {
  readonly entryId: ContentEntryId;
  readonly expectedRevision: number;
  readonly idempotency?: PublicationIdempotency;
  readonly publishedAt: UnixMilliseconds;
  readonly publishedBy: Actor;
  readonly publishedSnapshotId: ContentSnapshotId;
}

/** Atomic idempotency scope retained alongside a successful publication. */
export interface PublicationIdempotency {
  readonly actorId: ActorId;
  readonly fingerprint: PublicationRequestFingerprint;
  readonly key: PublicationIdempotencyKey;
}

export interface DeleteContentEntryInput {
  readonly deletedAt: UnixMilliseconds;
  readonly deletedBy: Actor;
  readonly entryId: ContentEntryId;
  readonly expectedPublishedSnapshotId?: ContentSnapshotId;
  readonly expectedRevision: number;
}

export type ContentCommandStatus = "created" | "deleted" | "published" | "saved";

/** A complete state change returned by a specialized atomic command. */
export interface ContentCommandResult {
  readonly entry?: ContentEntry;
  readonly status: ContentCommandStatus;
}

/** A publication result distinguishes a fresh commit from an idempotent replay. */
export type PublishContentEntryResult =
  | Readonly<{
      readonly entry: ContentEntry;
      readonly outcome: "published";
      readonly status: "published";
      readonly targetVersion: number;
    }>
  | Readonly<{
      readonly entry: ContentEntry;
      readonly outcome: "replayed";
      readonly status: "published";
    }>;

/**
 * Specialized state-changing operations. These deliberately replace a generic
 * transaction callback so D1 and SQLite can preserve identical semantics.
 */
export interface ContentEntryCommandPort {
  create(input: CreateContentEntryInput): Promise<ContentCommandResult>;
  delete(input: DeleteContentEntryInput): Promise<ContentCommandResult>;
  publish(input: PublishContentEntryCommand): Promise<PublishContentEntryResult>;
  saveCompleteDraft(input: SaveCompleteDraftInput): Promise<ContentCommandResult>;
}

export interface PublicContentEntry {
  readonly entry: ContentEntry;
  readonly path: string;
}

export interface ListPublicContentInput {
  readonly after?: OpaqueCursor;
  readonly limit: number;
  readonly modelKey: ContentModelKey;
}

export interface BuildContentExport {
  readonly entries: readonly PublicContentEntry[];
  readonly version: number;
}

export interface PublicContentReadPort {
  exportBuildContent(): Promise<BuildContentExport>;
  loadPublic(path: string): Promise<PublicContentEntry | null>;
  loadPublicMedia(id: string): Promise<MediaMetadata | null>;
  listPublic(input: ListPublicContentInput): Promise<CursorPage<PublicContentEntry>>;
  publishedContentVersion(): Promise<number>;
}

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

export type MediaMimeType = "image/avif" | "image/jpeg" | "image/png" | "image/webp";

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

/** Operational evidence is deliberately sanitized before it crosses this port. */
export interface OperationalLogger {
  error(input: OperationalError): void | Promise<void>;
}

export interface OperationalError {
  readonly code: "MEDIA_METADATA_CREATE_FAILED" | "MEDIA_OBJECT_CLEANUP_FAILED";
  readonly storageKey: string;
}

/** A derived cache; callers must always remain correct on a miss. */
export interface Cache {
  delete(key: string): Promise<void>;
  get<Value>(key: string): Promise<Value | null>;
  set<Value>(key: string, value: Value): Promise<void>;
}

export interface SiteBuildRequest {
  readonly buildId: SiteBuildId;
  readonly targetVersion: number;
}

/**
 * `succeeded` is proven publication only. `accepted` is untracked provider
 * acceptance; `tracking` means this runtime will track the exact deployment.
 */
export type BuildTriggerResult =
  | Readonly<{ readonly status: "accepted"; readonly providerBuildId?: string }>
  | Readonly<{ readonly status: "tracking"; readonly providerBuildId: string }>
  | Readonly<{ readonly status: "succeeded" }>
  | Readonly<{ readonly status: "failed"; readonly reason: string; readonly path?: string }>;

export interface SiteBuildTrigger {
  trigger(input: SiteBuildRequest): Promise<BuildTriggerResult>;
}

export interface BuildQueueReceipt {
  readonly coalesced: boolean;
  readonly eventId: DispatcherEventId;
  readonly targetVersion: number;
}

export interface EnqueueSiteBuildInput {
  readonly requestedAt: UnixMilliseconds;
  readonly requestedBy: Actor;
  readonly retryOfBuildId?: SiteBuildId;
}

export interface SiteBuildCommandPort {
  requestBuild(input: EnqueueSiteBuildInput): Promise<BuildQueueReceipt>;
}

/** Persisted build history visible to authenticated admin sessions. */
export interface SiteBuildRecord {
  readonly id: SiteBuildId;
  readonly reason: string;
  readonly status: SiteBuildStatus;
  readonly targetVersion: number;
  readonly requestedBy: string;
  readonly requestedAt: UnixMilliseconds;
  readonly startedAt?: UnixMilliseconds;
  readonly completedAt?: UnixMilliseconds;
  readonly providerBuildId?: string;
  readonly error?: string;
  readonly errorPath?: string;
}

export interface SiteBuildReadPort {
  listSiteBuilds(limit: number): Promise<readonly SiteBuildRecord[]>;
  getSiteBuild(buildId: SiteBuildId): Promise<SiteBuildRecord | null>;
}

export interface SiteBuildWorkLease extends DispatcherLease {
  readonly buildId: SiteBuildId;
  readonly targetVersion: number;
}

export interface SiteBuildDispatchPort {
  claimSiteBuilds(input: {
    readonly limit: number;
    readonly now: UnixMilliseconds;
  }): Promise<readonly SiteBuildWorkLease[]>;
  renewSiteBuildLease(input: {
    readonly leaseId: DispatcherLeaseId;
    readonly now: UnixMilliseconds;
  }): Promise<boolean>;
  /** Untracked provider acceptance: terminal `accepted`, optional provider ID. */
  recordSiteBuildAccepted(input: {
    readonly leaseId: DispatcherLeaseId;
    readonly now: UnixMilliseconds;
    readonly providerBuildId?: string;
  }): Promise<void>;
  /** Tracked provider acceptance: the build stays `running` and its event completes. */
  recordSiteBuildTracking(input: {
    readonly leaseId: DispatcherLeaseId;
    readonly now: UnixMilliseconds;
    readonly providerBuildId: string;
  }): Promise<void>;
  recordSiteBuildSuccess(input: {
    readonly leaseId: DispatcherLeaseId;
    readonly now: UnixMilliseconds;
  }): Promise<void>;
  recordSiteBuildFailure(input: {
    readonly leaseId: DispatcherLeaseId;
    readonly now: UnixMilliseconds;
    readonly reason: string;
    readonly path?: string;
    readonly retryAt?: UnixMilliseconds;
    readonly terminal: boolean;
  }): Promise<void>;
  /**
   * Ends a tracked deployment for the exact build and provider ID; idempotent
   * for the same outcome and never reopens a terminal build.
   */
  completeTrackedSiteBuild(input: {
    readonly buildId: SiteBuildId;
    readonly providerBuildId: string;
    readonly now: UnixMilliseconds;
    readonly outcome: TrackedSiteBuildOutcome;
    readonly reason?: string;
  }): Promise<void>;
}

export interface Clock {
  now(): UnixMilliseconds;
}

export interface IdGenerator {
  next(): string;
}

/** Persistence receives only the derived verifier, never an opaque secret. */
export interface OpaqueTokenHasher {
  hash(secret: OpaqueTokenSecret): Promise<OpaqueTokenVerifier>;
  verify(secret: OpaqueTokenSecret, verifier: OpaqueTokenVerifier): Promise<boolean>;
}

export type SecurityRole = "admin" | "editor" | "viewer";

export interface ManagedUser {
  readonly disabled: boolean;
  readonly email: string;
  readonly id: string;
  readonly role: SecurityRole;
}

export interface BuildTokenMetadata {
  readonly capabilities: readonly ["content:build:read"];
  readonly createdAt: UnixMilliseconds;
  readonly id: string;
  readonly lastUsedAt?: UnixMilliseconds;
  readonly name: string;
  readonly revokedAt?: UnixMilliseconds;
  readonly tokenPrefix: string;
}

export interface IssuedBuildToken extends BuildTokenMetadata {
  /** Returned exactly once by the creation command; never persisted or logged. */
  readonly token: OpaqueTokenSecret;
}

/** Security lifecycle boundary implemented by each runtime's durable adapter. */
export interface SecurityService {
  /** Read-only durable completion marker; never infers completion from users. */
  isSetupComplete(): Promise<boolean>;
  bootstrap(input: {
    readonly email: string;
    readonly password: string;
    readonly token: OpaqueTokenSecret;
  }): Promise<{ readonly user: ManagedUser }>;
  createSetupToken(): Promise<{
    readonly expiresAt: UnixMilliseconds;
    readonly token: OpaqueTokenSecret;
  }>;
  createUser(input: {
    readonly email: string;
    readonly password: string;
    readonly role: SecurityRole;
  }): Promise<ManagedUser>;
  createBuildToken(input: {
    readonly name: string;
    readonly now: UnixMilliseconds;
  }): Promise<IssuedBuildToken>;
  disableUser(input: { readonly userId: string }): Promise<ManagedUser>;
  listBuildTokens(): Promise<readonly BuildTokenMetadata[]>;
  listUsers(): Promise<readonly ManagedUser[]>;
  revokeBuildToken(input: {
    readonly tokenId: string;
    readonly now: UnixMilliseconds;
  }): Promise<BuildTokenMetadata | null>;
  updateUser(input: {
    readonly role?: SecurityRole;
    readonly userId: string;
    readonly disabled?: boolean;
  }): Promise<ManagedUser | null>;
  verifyBuildToken(input: {
    readonly token: OpaqueTokenSecret;
    readonly now: UnixMilliseconds;
  }): Promise<boolean>;
}

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly retryAfterSeconds: number;
}

export interface SensitiveRateLimiter {
  check(input: {
    readonly operation: "auth" | "setup" | "token" | "upload";
    readonly subject: string;
    readonly now: UnixMilliseconds;
  }): Promise<RateLimitDecision>;
}

/** Keeps the role matrix in the domain policy rather than HTTP handlers. */
export function requireUsersManager(actor: Actor): void {
  requirePermission(actor, "users:manage");
}

export interface DispatcherEvent {
  readonly attempts: number;
  readonly availableAt: UnixMilliseconds;
  readonly id: DispatcherEventId;
  readonly payload: JsonObject;
  readonly type: string;
}

/** Fixed dispatcher timing keeps recovery semantics identical across runtimes. */
export const DISPATCHER_LEASE_DURATION_MS = 60_000;
export const SITE_BUILD_DEBOUNCE_MS = 5_000;

export interface DispatcherRetryPolicy {
  readonly baseDelayMs: number;
  readonly maxAttempts: number;
  readonly maxDelayMs: number;
}

export const defaultDispatcherRetryPolicy: DispatcherRetryPolicy = Object.freeze({
  baseDelayMs: 1_000,
  maxAttempts: 8,
  maxDelayMs: 15 * 60_000,
});

export const siteBuildRetryPolicy: DispatcherRetryPolicy = Object.freeze({
  baseDelayMs: 5_000,
  maxAttempts: 8,
  maxDelayMs: 15 * 60_000,
});

/** Calculates full-jitter exponential retry delay without choosing the random sample. */
export function dispatcherRetryDelay(
  policy: DispatcherRetryPolicy,
  failedAttempt: number,
  random: number,
): number {
  if (
    !Number.isSafeInteger(policy.baseDelayMs) ||
    !Number.isSafeInteger(policy.maxDelayMs) ||
    !Number.isSafeInteger(policy.maxAttempts) ||
    policy.baseDelayMs < 1 ||
    policy.maxDelayMs < policy.baseDelayMs ||
    policy.maxAttempts < 1 ||
    !Number.isSafeInteger(failedAttempt) ||
    failedAttempt < 1 ||
    !Number.isFinite(random) ||
    random < 0 ||
    random >= 1
  ) {
    throw new TypeError("Dispatcher retry inputs are invalid.");
  }
  const ceiling = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** (failedAttempt - 1));
  return Math.floor(random * (ceiling + 1));
}

export interface DispatcherLease {
  readonly event: DispatcherEvent;
  readonly expiresAt: UnixMilliseconds;
  readonly id: DispatcherLeaseId;
}

export interface ClaimDispatcherEventsInput {
  readonly eventTypes: readonly string[];
  readonly limit: number;
  readonly now: UnixMilliseconds;
}

export interface CompleteDispatcherLeaseInput {
  readonly completedAt: UnixMilliseconds;
  readonly error?: string;
  readonly leaseId: DispatcherLeaseId;
  readonly outcome: "succeeded";
}

export interface RetryDispatcherLeaseInput {
  readonly error: string;
  readonly failedAt: UnixMilliseconds;
  readonly leaseId: DispatcherLeaseId;
  readonly retryAt?: UnixMilliseconds;
}

export interface DispatcherLeasePort {
  claim(input: ClaimDispatcherEventsInput): Promise<readonly DispatcherLease[]>;
  complete(input: CompleteDispatcherLeaseInput): Promise<void>;
  retry(input: RetryDispatcherLeaseInput): Promise<void>;
}

/** Metadata-only media reads remain separate from binary object storage. */
export interface MediaReadPort {
  loadMedia(id: string): Promise<MediaMetadata | null>;
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
export const MAX_MEDIA_SEARCH_LENGTH = 200;
/** Upper bound on the referencing entries returned by one media usage read. */
export const MAX_MEDIA_USAGE_ENTRIES = 50;

export interface ListMediaInput {
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

export interface MediaListPort {
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

/** Mutation remains separate from metadata reads and binary object storage. */
export interface MediaCommandPort {
  createMedia(input: CreateMediaMetadataInput): Promise<MediaMetadata>;
  markForDeletion(input: MarkMediaForDeletionInput): Promise<MarkMediaForDeletionResult>;
  retryDeletion(input: MarkMediaForDeletionInput): Promise<MarkMediaForDeletionResult>;
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

export * from "./content-use-cases.js";
export * from "./media-use-cases.js";

/** Authorizes read-only installation metadata with the existing content permission. */
export function requireContentReader(actor: Actor): void {
  requirePermission(actor, "content:read");
}
