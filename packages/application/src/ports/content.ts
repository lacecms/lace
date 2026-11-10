import type {
  Actor,
  ActorId,
  BlockKey,
  CompleteDraftMutation,
  ContentEntry,
  ContentEntryId,
  ContentModelKey,
  ContentSnapshotId,
  DraftMediaReference,
  MediaMetadata,
  PublishedSnapshot,
  UnixMilliseconds,
} from "@lacecms/domain";
import type {
  InternalLinkReference,
  PublicInternalLinkReference,
  JsonObject,
  ListQueryLimits,
  ListQueryableFieldType,
} from "@lacecms/content";
import type {
  OpaqueCursor,
  PublicationIdempotencyKey,
  PublicationRequestFingerprint,
} from "../shared/brands.js";
import { CONTENT_ENTRY_SYSTEM_SORTS } from "@lacecms/content";
import type { CursorPage } from "../shared/pagination.js";
import type { ActorSummary } from "../shared/actors.js";
import type { LinkImpactAcknowledgment } from "./links.js";

export type CollectionQueryFieldType = ListQueryableFieldType;
export interface CollectionQueryField {
  readonly key: string;
  readonly type: CollectionQueryFieldType;
  readonly options?: readonly string[];
}
export type CollectionFieldFilter =
  | { readonly field: string; readonly op: "isSet" | "isNotSet" }
  | { readonly field: string; readonly op: "eq"; readonly value: boolean | number | string }
  | { readonly field: string; readonly op: "contains"; readonly value: string }
  | { readonly field: string; readonly op: "in"; readonly values: readonly string[] }
  | {
      readonly field: string;
      readonly op: "range";
      readonly min?: number;
      readonly max?: number;
      readonly from?: string;
      readonly to?: string;
    };
export interface ResolvedCollectionQuery {
  readonly filters: readonly CollectionFieldFilter[];
  readonly sortableFields: readonly CollectionQueryField[];
  readonly filterableFields: readonly CollectionQueryField[];
  readonly searchableFields: readonly CollectionQueryField[];
}
export interface PublicContentReadPort {
  /**
   * Reads one build-export page from a single published state. Fails with
   * `BuildExportVersionChangedError` when the cursor's version is no longer
   * current or a publication lands during the read, and with
   * `BuildExportCursorError` for a malformed or foreign cursor.
   */
  exportBuildContentPage(input: ExportBuildContentPageInput): Promise<BuildContentExportPage>;
  loadPublic(path: string): Promise<PublicContentEntry | null>;
  /** Reads a published global by model key without consulting published routes. */
  loadPublicGlobal(modelKey: ContentModelKey): Promise<PublicGlobalContent | null>;
  loadPublicMedia(id: string): Promise<MediaMetadata | null>;
  listPublic(input: ListPublicContentInput): Promise<CursorPage<PublicContentEntry>>;
  publishedContentVersion(): Promise<number>;
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
  | "updatedAt"
  | `field:${string}`
  | `-field:${string}`;

export const CONTENT_ENTRY_SORTS: readonly ContentEntrySort[] = CONTENT_ENTRY_SYSTEM_SORTS;

export const DEFAULT_CONTENT_ENTRY_SORT: ContentEntrySort = "-updatedAt";

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
  readonly listQueryLimits?: ListQueryLimits;
  readonly query?: ResolvedCollectionQuery;
  readonly after?: OpaqueCursor;
  readonly limit: number;
  /** Draft field keys whose scalar values are copied into each summary. */
  readonly listFields: readonly string[];
  readonly modelKey: ContentModelKey;
  /** A trimmed, non-empty title-or-slug substring; ASCII letters match case-insensitively. */
  readonly q?: string;
  /** Collections only: the exact current draft slug (import lookups, ADR 0016). */
  readonly slug?: string;
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
  readonly internalLinks?: readonly InternalLinkReference[];
  /** Commits the new entry only while the duplicated source draft is still at this revision. */
  readonly duplicateOf?: DuplicateSourceGuard;
  readonly entry: ContentEntry;
  readonly mediaReferences: readonly DraftMediaReference[];
}

/** The source draft revision on which a duplicate creation depends. */
export interface DuplicateSourceGuard {
  readonly entryId: ContentEntryId;
  readonly expectedRevision: number;
}

export interface SaveCompleteDraftInput {
  readonly internalLinks?: readonly InternalLinkReference[];
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
  /**
   * The published projection of the draft at `expectedRevision`, present when
   * its model or a draft block declares conditional-field rules. Repositories
   * write it instead of copying draft fields, block data and references.
   */
  readonly projection?: PublishedProjection;
}

/** Published values and references of a draft whose hidden targets are removed. */
export interface PublishedProjection {
  /** Every draft block exactly once, with its projected data. */
  readonly blocks: readonly { readonly data: JsonObject; readonly key: BlockKey }[];
  readonly fields: JsonObject;
  readonly internalLinks: readonly InternalLinkReference[];
  readonly mediaReferences: readonly DraftMediaReference[];
}

/** Atomic idempotency scope retained alongside a successful publication. */
export interface PublicationIdempotency {
  readonly actorId: ActorId;
  readonly fingerprint: PublicationRequestFingerprint;
  readonly key: PublicationIdempotencyKey;
}

export interface DeleteContentEntryInput {
  readonly linkImpact?: LinkImpactAcknowledgment;
  readonly deletedAt: UnixMilliseconds;
  readonly deletedBy: Actor;
  readonly entryId: ContentEntryId;
  readonly expectedPublishedSnapshotId?: ContentSnapshotId;
  readonly expectedRevision: number;
}

export interface UnpublishContentEntryCommand {
  readonly linkImpact?: LinkImpactAcknowledgment;
  readonly entryId: ContentEntryId;
  readonly expectedPublishedSnapshotId: ContentSnapshotId;
  readonly idempotency?: PublicationIdempotency;
  readonly unpublishedAt: UnixMilliseconds;
  readonly unpublishedBy: Actor;
}

export interface RevertContentDraftCommand {
  readonly entryId: ContentEntryId;
  readonly expectedPublishedSnapshotId: ContentSnapshotId;
  readonly expectedRevision: number;
  readonly revertedAt: UnixMilliseconds;
  readonly revertedBy: Actor;
}

export type ContentCommandStatus = "created" | "deleted" | "published" | "reverted" | "saved";

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

/** An unpublication result distinguishes a fresh commit from an idempotent replay. */
export type UnpublishContentEntryResult =
  | Readonly<{
      readonly entry: ContentEntry;
      readonly outcome: "unpublished";
      readonly status: "unpublished";
      readonly targetVersion: number;
    }>
  | Readonly<{
      readonly entry: ContentEntry;
      readonly outcome: "replayed";
      readonly status: "unpublished";
    }>;

/**
 * Specialized state-changing operations. These deliberately replace a generic
 * transaction callback so D1 and SQLite can preserve identical semantics.
 */
export interface ContentEntryCommandPort {
  create(input: CreateContentEntryInput): Promise<ContentCommandResult>;
  delete(input: DeleteContentEntryInput): Promise<ContentCommandResult>;
  publish(input: PublishContentEntryCommand): Promise<PublishContentEntryResult>;
  /** Copies the current publication into the draft and aligns both revisions. */
  revertDraft(input: RevertContentDraftCommand): Promise<ContentCommandResult>;
  saveCompleteDraft(input: SaveCompleteDraftInput): Promise<ContentCommandResult>;
  /** Removes the current publication and its route while keeping the draft. */
  unpublish(input: UnpublishContentEntryCommand): Promise<UnpublishContentEntryResult>;
}

export interface PublicContentEntry {
  readonly entry: ContentEntry;
  readonly internalLinks: readonly PublicInternalLinkReference[];
  /** Active media referenced by the entry's current published snapshot. */
  readonly media: readonly MediaMetadata[];
  readonly path: string;
}

export interface ListPublicContentInput {
  readonly after?: OpaqueCursor;
  readonly limit: number;
  readonly modelKey: ContentModelKey;
}

/** A published route-less global with the media its publication references. */
export interface PublicGlobalContent {
  readonly internalLinks: readonly PublicInternalLinkReference[];
  /** Published-only projection; never exposes the mutable draft. */
  readonly entry: ContentEntry;
  /** Active media referenced by the global's current published snapshot. */
  readonly media: readonly MediaMetadata[];
}

export interface ExportBuildContentPageInput {
  /** Continuation cursor of the previous page; absent for the first page. */
  readonly after?: OpaqueCursor;
  /** Entries per page, from 1 to `MAX_BUILD_EXPORT_PAGE_SIZE`. */
  readonly limit: number;
}

/** One page of the build export, read from a single published state. */
export interface BuildContentExportPage {
  /** Routed published entries ordered by path, continuing after the cursor. */
  readonly entries: readonly PublicContentEntry[];
  /** Published globals ordered by model key; on the first page only. */
  readonly globals?: readonly PublicGlobalContent[];
  /** Present exactly when further entries remain. */
  readonly nextCursor?: OpaqueCursor;
  /** The published-state version every page of the sequence was read at. */
  readonly version: number;
}

/** A candidate entry of a build-export page and its stored JSON size in bytes. */
export interface BuildExportCandidate {
  readonly bytes: number;
}
