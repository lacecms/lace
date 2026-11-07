import { deepFreeze } from "@lacecms/content";
import type { ContentModelKind, JsonObject } from "@lacecms/content";
import { auditActor } from "../access/actors.js";
import type { Actor } from "../access/actors.js";
import type {
  BlockKey,
  ContentEntryId,
  ContentSnapshotId,
  MediaId,
  UnixMilliseconds,
} from "../shared/brands.js";
import { cloneJson, fail } from "../shared/failures.js";
import { assertOrderedBlockPositions, cloneBlock } from "./blocks.js";
import type { ContentBlock } from "./blocks.js";
import { isSingletonKind } from "./routes.js";
import type { ContentModelRoute } from "./routes.js";
import { cloneEntrySeo } from "./seo.js";
import type { EntrySeo } from "./seo.js";

interface SnapshotBase {
  readonly blocks: readonly ContentBlock[];
  readonly createdAt: UnixMilliseconds;
  readonly entryId: ContentEntryId;
  readonly fields: JsonObject;
  readonly id: ContentSnapshotId;
  readonly revision: number;
  /** The SEO system group, absent when no value is set. */
  readonly seo?: EntrySeo;
  readonly slug?: string;
  readonly title: string;
  readonly updatedAt: UnixMilliseconds;
  readonly updatedBy: Actor;
}

export interface DraftSnapshot extends SnapshotBase {
  readonly state: "draft";
}

export interface PublishedSnapshot extends SnapshotBase {
  readonly state: "published";
}

export type ContentSnapshot = DraftSnapshot | PublishedSnapshot;

/** A committed entry always owns a draft and optionally its current publication. */
export interface ContentEntry {
  readonly draft: DraftSnapshot;
  readonly id: ContentEntryId;
  readonly model: ContentModelRoute;
  readonly published?: PublishedSnapshot;
}

function cloneSnapshot<Snapshot extends ContentSnapshot>(snapshot: Snapshot): Snapshot {
  return {
    blocks: snapshot.blocks.map(cloneBlock),
    createdAt: snapshot.createdAt,
    entryId: snapshot.entryId,
    fields: cloneJson(snapshot.fields) as JsonObject,
    id: snapshot.id,
    revision: snapshot.revision,
    ...(snapshot.seo === undefined ? {} : { seo: cloneEntrySeo(snapshot.seo) }),
    ...(snapshot.slug === undefined ? {} : { slug: snapshot.slug }),
    state: snapshot.state,
    title: snapshot.title,
    updatedAt: snapshot.updatedAt,
    updatedBy: auditActor(snapshot.updatedBy),
  } as unknown as Snapshot;
}

/** Enforces singleton cardinality before a specialized atomic store operation. */
export function assertEntryCreationAllowed(
  kind: ContentModelKind,
  existingEntryCount: number,
): void {
  if (!Number.isSafeInteger(existingEntryCount) || existingEntryCount < 0) {
    fail("CONTENT_INVALID_STATE", "existingEntryCount must be a non-negative safe integer.");
  }
  if (isSingletonKind(kind) && existingEntryCount > 0) {
    fail("CONTENT_MODEL_CARDINALITY_CONFLICT", `A ${kind} model already has its singleton entry.`);
  }
}

function assertDraft(snapshot: ContentSnapshot): asserts snapshot is DraftSnapshot {
  if (snapshot.state === "published") {
    fail("CONTENT_PUBLISHED_IMMUTABLE", "Published snapshots cannot be mutated.");
  }
}

function assertSnapshot(snapshot: ContentSnapshot, entryId: ContentEntryId): void {
  if (snapshot.entryId !== entryId) {
    fail("CONTENT_INVALID_STATE", "A snapshot must belong to its content entry.");
  }
  if (!Number.isSafeInteger(snapshot.revision) || snapshot.revision < 1) {
    fail("CONTENT_INVALID_STATE", "Snapshot revision must be a positive safe integer.");
  }
  if (typeof snapshot.title !== "string" || snapshot.title.length === 0) {
    fail("CONTENT_INVALID_STATE", "A snapshot must have a title.");
  }
  assertOrderedBlockPositions(snapshot.blocks);
}

/** Creates a detached committed entry with one valid draft and no publication. */
export function createContentEntry(input: {
  readonly draft: DraftSnapshot;
  readonly id: ContentEntryId;
  readonly model: ContentModelRoute;
}): ContentEntry {
  if (input.draft.state !== "draft") {
    fail("CONTENT_INVALID_STATE", "A committed entry requires a draft snapshot.");
  }
  assertSnapshot(input.draft, input.id);
  return deepFreeze({ draft: cloneSnapshot(input.draft), id: input.id, model: { ...input.model } });
}

/** A validated relational media-reference projection for one mutable draft. */
export interface DraftMediaReference {
  readonly fieldPath: string;
  readonly mediaId: MediaId;
  readonly sourceKey: "$fields" | "$seo" | BlockKey;
}

export interface CompleteDraftMutation {
  readonly blocks: readonly ContentBlock[];
  readonly expectedRevision: number;
  readonly fields: JsonObject;
  readonly mediaReferences: readonly DraftMediaReference[];
  readonly seo?: EntrySeo;
  readonly slug?: string;
  readonly title: string;
  readonly updatedAt: UnixMilliseconds;
  readonly updatedBy: Actor;
}

/** Replaces the whole mutable draft and advances its revision once. */
export function saveCompleteDraft(
  entry: ContentEntry,
  mutation: CompleteDraftMutation,
): ContentEntry {
  assertDraft(entry.draft);
  assertSnapshot(entry.draft, entry.id);
  if (mutation.expectedRevision !== entry.draft.revision) {
    fail(
      "CONTENT_REVISION_CONFLICT",
      "The draft revision no longer matches the expected revision.",
    );
  }
  const draft: DraftSnapshot = {
    blocks: mutation.blocks.map(cloneBlock),
    createdAt: entry.draft.createdAt,
    entryId: entry.id,
    fields: cloneJson(mutation.fields) as JsonObject,
    id: entry.draft.id,
    revision: entry.draft.revision + 1,
    ...(mutation.seo === undefined ? {} : { seo: cloneEntrySeo(mutation.seo) }),
    ...(mutation.slug === undefined ? {} : { slug: mutation.slug }),
    state: "draft",
    title: mutation.title,
    updatedAt: mutation.updatedAt,
    updatedBy: auditActor(mutation.updatedBy),
  };
  assertSnapshot(draft, entry.id);
  return deepFreeze({
    draft: cloneSnapshot(draft),
    id: entry.id,
    model: { ...entry.model },
    ...(entry.published === undefined ? {} : { published: cloneSnapshot(entry.published) }),
  });
}

export interface PublishContentEntryInput {
  readonly expectedRevision: number;
  readonly publishedAt: UnixMilliseconds;
  readonly publishedBy: Actor;
  readonly publishedSnapshotId: ContentSnapshotId;
}

/** Copies the current draft into a detached immutable current publication. */
export function publishContentEntry(
  entry: ContentEntry,
  input: PublishContentEntryInput,
): ContentEntry {
  assertDraft(entry.draft);
  assertSnapshot(entry.draft, entry.id);
  if (input.expectedRevision !== entry.draft.revision) {
    fail(
      "CONTENT_REVISION_CONFLICT",
      "The draft revision no longer matches the expected revision.",
    );
  }
  if (input.publishedSnapshotId === entry.draft.id) {
    fail("CONTENT_INVALID_STATE", "Published and draft snapshots must have different identities.");
  }
  const published: PublishedSnapshot = {
    ...cloneSnapshot(entry.draft),
    createdAt: input.publishedAt,
    id: input.publishedSnapshotId,
    state: "published",
    updatedAt: input.publishedAt,
    updatedBy: auditActor(input.publishedBy),
  };
  return deepFreeze({
    draft: cloneSnapshot(entry.draft),
    id: entry.id,
    model: { ...entry.model },
    published: cloneSnapshot(published),
  });
}

/**
 * Returns the entry's current publication, failing when it has none or when
 * a supplied expected identity no longer names it.
 */
export function requirePublishedSnapshot(
  entry: ContentEntry,
  expectedPublishedSnapshotId?: ContentSnapshotId,
): PublishedSnapshot {
  if (entry.published === undefined) {
    fail("CONTENT_NOT_PUBLISHED", "The entry is not published.");
  }
  if (
    expectedPublishedSnapshotId !== undefined &&
    entry.published.id !== expectedPublishedSnapshotId
  ) {
    fail(
      "CONTENT_REVISION_CONFLICT",
      "The published snapshot no longer matches the expected publication.",
    );
  }
  return entry.published;
}

/** Refuses lifecycle operations that configuration-defined singletons do not support. */
export function assertCollectionEntryOperation(
  entry: Pick<ContentEntry, "model">,
  operation: "delete" | "duplicate",
): void {
  if (isSingletonKind(entry.model.kind)) {
    fail(
      "CONTENT_PAGE_SINGLETON",
      `Page and global entries are defined by configuration and cannot be ${operation === "delete" ? "deleted" : "duplicated"}.`,
    );
  }
}

/** Removes the current publication while keeping the draft unchanged. */
export function unpublishContentEntry(
  entry: ContentEntry,
  expectedPublishedSnapshotId: ContentSnapshotId,
): ContentEntry {
  requirePublishedSnapshot(entry, expectedPublishedSnapshotId);
  return deepFreeze({ draft: cloneSnapshot(entry.draft), id: entry.id, model: { ...entry.model } });
}

export interface RevertContentDraftInput {
  readonly expectedPublishedSnapshotId: ContentSnapshotId;
  readonly expectedRevision: number;
  readonly revertedAt: UnixMilliseconds;
  readonly revertedBy: Actor;
}

/**
 * Replaces the draft with the published content, advances the draft revision
 * once, and aligns the publication's revision so the entry reads as in sync.
 */
export function revertContentDraft(
  entry: ContentEntry,
  input: RevertContentDraftInput,
): ContentEntry {
  assertDraft(entry.draft);
  const published = requirePublishedSnapshot(entry, input.expectedPublishedSnapshotId);
  if (input.expectedRevision !== entry.draft.revision) {
    fail(
      "CONTENT_REVISION_CONFLICT",
      "The draft revision no longer matches the expected revision.",
    );
  }
  const revision = entry.draft.revision + 1;
  const content = cloneSnapshot(published);
  const draft: DraftSnapshot = {
    blocks: content.blocks,
    createdAt: entry.draft.createdAt,
    entryId: entry.id,
    fields: content.fields,
    id: entry.draft.id,
    revision,
    ...(content.seo === undefined ? {} : { seo: content.seo }),
    ...(content.slug === undefined ? {} : { slug: content.slug }),
    state: "draft",
    title: content.title,
    updatedAt: input.revertedAt,
    updatedBy: auditActor(input.revertedBy),
  };
  return deepFreeze({
    draft,
    id: entry.id,
    model: { ...entry.model },
    published: { ...cloneSnapshot(published), revision },
  });
}

/** Explicitly rejects attempts to use a published snapshot as a mutation target. */
export function requireMutableDraft(snapshot: ContentSnapshot): DraftSnapshot {
  assertDraft(snapshot);
  return snapshot;
}
