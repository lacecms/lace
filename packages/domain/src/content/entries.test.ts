import type { JsonObject } from "@lacecms/content";
import { expect, test } from "vitest";
import type { Actor } from "../access/actors.js";
import {
  actorId,
  blockKey,
  contentEntryId,
  contentModelKey,
  contentSnapshotId,
  unixMilliseconds,
} from "../shared/brands.js";
import { expectDomainError, present } from "../test-support/assertions.js";
import type { ContentBlock, ContentBlockInput } from "./blocks.js";
import {
  assertCollectionEntryOperation,
  assertEntryCreationAllowed,
  createContentEntry,
  publishContentEntry,
  requireMutableDraft,
  requirePublishedSnapshot,
  revertContentDraft,
  saveCompleteDraft,
  unpublishContentEntry,
} from "./entries.js";
import type { ContentEntry, DraftSnapshot } from "./entries.js";
import { contentPublicPath, hasPublicRoute, isRouteLessCollection } from "./routes.js";
import { normalizeEntrySeo } from "./seo.js";

const admin: Actor = { id: actorId("admin-1"), role: "admin" };
const editor: Actor = { id: actorId("editor-1"), role: "editor" };
const entryId = contentEntryId("entry-1");

/**
 * A legacy stored block without envelope values. The lifecycle completes the
 * omitted values, so the fixture is typed as the stored block it stands for.
 */
function block(
  key: string,
  position: number,
  data: JsonObject = { body: "Original" },
): ContentBlock {
  const legacy: ContentBlockInput = {
    data,
    key: blockKey(key),
    position,
    schemaVersion: 1,
    type: "richText",
  };
  return legacy as ContentBlock;
}

function draft(overrides: Partial<DraftSnapshot> = {}): DraftSnapshot {
  return {
    blocks: [block("block-1", 1000, { nested: { body: "Original" } })],
    createdAt: unixMilliseconds(1),
    entryId,
    fields: { nested: { value: "Original" } },
    id: contentSnapshotId("draft-1"),
    revision: 1,
    state: "draft",
    title: "Original",
    updatedAt: unixMilliseconds(1),
    updatedBy: editor,
    ...overrides,
  };
}

function entry(overrides: Partial<Parameters<typeof createContentEntry>[0]> = {}): ContentEntry {
  return createContentEntry({
    draft: draft(),
    id: entryId,
    model: { key: contentModelKey("posts"), kind: "collection", route: "/blog/:slug" },
    ...overrides,
  });
}

test("keeps published data immutable and isolated from later complete draft saves", () => {
  const callerFields = { nested: { value: "Original" } };
  const sourceDraft = draft({ fields: callerFields });
  const initial = entry({ draft: sourceDraft });
  callerFields.nested.value = "Caller mutation";

  const published = publishContentEntry(initial, {
    expectedRevision: 1,
    publishedAt: unixMilliseconds(2),
    publishedBy: admin,
    publishedSnapshotId: contentSnapshotId("published-1"),
  });
  const publication = present(published.published);
  expect(publication.fields).toEqual({ nested: { value: "Original" } });
  expect(Object.isFrozen(publication.fields["nested"])).toBe(true);
  expectDomainError(() => requireMutableDraft(publication), "CONTENT_PUBLISHED_IMMUTABLE");

  const saved = saveCompleteDraft(published, {
    blocks: [block("block-2", 1000, { nested: { body: "Edited" } })],
    expectedRevision: 1,
    fields: { nested: { value: "Edited" } },
    mediaReferences: [],
    slug: "release-notes",
    title: "Edited",
    updatedAt: unixMilliseconds(3),
    updatedBy: editor,
  });
  expect(saved.draft).toMatchObject({ revision: 2, slug: "release-notes", title: "Edited" });
  expect(saved.published).toMatchObject({ revision: 1, title: "Original" });
  expect(present(saved.published).fields).toEqual({ nested: { value: "Original" } });
  expectDomainError(
    () => saveCompleteDraft(saved, { ...draft(), expectedRevision: 1, mediaReferences: [] }),
    "CONTENT_REVISION_CONFLICT",
  );

  const republished = publishContentEntry(saved, {
    expectedRevision: 2,
    publishedAt: unixMilliseconds(4),
    publishedBy: admin,
    publishedSnapshotId: contentSnapshotId("published-2"),
  });
  expect(republished.published).toMatchObject({ id: "published-2", revision: 2, title: "Edited" });
  expect(republished).not.toHaveProperty("published.previousPublished");
});

test("unpublishes and reverts against the current publication", () => {
  const initial = entry();
  expectDomainError(() => requirePublishedSnapshot(initial), "CONTENT_NOT_PUBLISHED");
  expectDomainError(
    () => unpublishContentEntry(initial, contentSnapshotId("published-1")),
    "CONTENT_NOT_PUBLISHED",
  );
  const published = publishContentEntry(initial, {
    expectedRevision: 1,
    publishedAt: unixMilliseconds(2),
    publishedBy: admin,
    publishedSnapshotId: contentSnapshotId("published-1"),
  });
  const changed = saveCompleteDraft(published, {
    blocks: [block("block-2", 1000)],
    expectedRevision: 1,
    fields: { nested: { value: "Edited" } },
    mediaReferences: [],
    slug: "edited",
    title: "Edited",
    updatedAt: unixMilliseconds(3),
    updatedBy: editor,
  });
  expectDomainError(
    () => requirePublishedSnapshot(changed, contentSnapshotId("stale")),
    "CONTENT_REVISION_CONFLICT",
  );

  const unpublished = unpublishContentEntry(changed, contentSnapshotId("published-1"));
  expect(unpublished).not.toHaveProperty("published");
  expect(unpublished.draft).toEqual(changed.draft);

  const revert = {
    expectedPublishedSnapshotId: contentSnapshotId("published-1"),
    expectedRevision: 2,
    revertedAt: unixMilliseconds(4),
    revertedBy: editor,
  };
  expectDomainError(
    () => revertContentDraft(changed, { ...revert, expectedRevision: 1 }),
    "CONTENT_REVISION_CONFLICT",
  );
  expectDomainError(() => revertContentDraft(unpublished, revert), "CONTENT_NOT_PUBLISHED");
  const reverted = revertContentDraft(changed, revert);
  const changedPublication = present(changed.published);
  expect(reverted.draft).toMatchObject({
    blocks: changedPublication.blocks,
    fields: { nested: { value: "Original" } },
    id: "draft-1",
    revision: 3,
    title: "Original",
    updatedAt: 4,
    updatedBy: editor,
  });
  expect(reverted.draft).not.toHaveProperty("slug");
  expect(reverted.published).toEqual({ ...changedPublication, revision: 3 });
  expect(Object.isFrozen(reverted.draft.fields["nested"])).toBe(true);
});

test("refuses page deletion and duplication", () => {
  const page: Pick<ContentEntry, "model"> = {
    model: { key: contentModelKey("home"), kind: "page", path: "/" },
  };
  expectDomainError(() => assertCollectionEntryOperation(page, "delete"), "CONTENT_PAGE_SINGLETON");
  expectDomainError(
    () => assertCollectionEntryOperation(page, "duplicate"),
    "CONTENT_PAGE_SINGLETON",
  );
  expect(() => assertCollectionEntryOperation(entry(), "delete")).not.toThrow();
});

test("treats a global as a route-less singleton", () => {
  const global: Pick<ContentEntry, "model"> = {
    model: { key: contentModelKey("settings"), kind: "global" },
  };
  expect(contentPublicPath(global.model)).toBeUndefined();
  expect(contentPublicPath({ key: contentModelKey("home"), kind: "page", path: "/" })).toBe("/");
  expect(
    contentPublicPath(
      { key: contentModelKey("posts"), kind: "collection", route: "/blog/:slug" },
      "a",
    ),
  ).toBe("/blog/a");
  for (const operation of ["delete", "duplicate"] as const) {
    expectDomainError(
      () => assertCollectionEntryOperation(global, operation),
      "CONTENT_PAGE_SINGLETON",
    );
  }
});

test("treats a route-less collection entry as many entries without a public path", () => {
  const testimonials = { key: contentModelKey("testimonials"), kind: "collection" } as const;
  expect(contentPublicPath(testimonials)).toBeUndefined();
  expect(contentPublicPath(testimonials, "ignored")).toBeUndefined();
  expect(hasPublicRoute(testimonials)).toBe(false);
  expect(isRouteLessCollection(testimonials)).toBe(true);
  const posts = {
    key: contentModelKey("posts"),
    kind: "collection",
    route: "/blog/:slug",
  } as const;
  expect(hasPublicRoute(posts)).toBe(true);
  expect(isRouteLessCollection(posts)).toBe(false);
  expect(hasPublicRoute({ key: contentModelKey("settings"), kind: "global" })).toBe(false);
  expect(() => assertEntryCreationAllowed("collection", 3)).not.toThrow();
  const routeLessEntry: Pick<ContentEntry, "model"> = { model: testimonials };
  for (const operation of ["delete", "duplicate"] as const) {
    expect(() => assertCollectionEntryOperation(routeLessEntry, operation)).not.toThrow();
  }
});

test("rejects an invalid committed lifecycle", () => {
  // Invariant under test: a committed entry refuses a non-draft snapshot as its draft.
  const publishedDraft = { ...draft(), state: "published" } as unknown as DraftSnapshot;
  expectDomainError(
    () => createContentEntry({ ...entry(), draft: publishedDraft }),
    "CONTENT_INVALID_STATE",
  );
});

test("publication and revert preserve the SEO group", () => {
  const seo = present(normalizeEntrySeo({ image: "media-1", title: "Hello" }, { enabled: true }));
  const saved = saveCompleteDraft(entry(), {
    blocks: [],
    expectedRevision: 1,
    fields: {},
    mediaReferences: [],
    seo,
    title: "Original",
    updatedAt: unixMilliseconds(2),
    updatedBy: editor,
  });
  expect(saved.draft.seo).toEqual({ image: "media-1", title: "Hello" });
  const published = publishContentEntry(saved, {
    expectedRevision: 2,
    publishedAt: unixMilliseconds(3),
    publishedBy: admin,
    publishedSnapshotId: contentSnapshotId("published-1"),
  });
  expect(present(published.published).seo).toEqual(seo);
  const cleared = saveCompleteDraft(published, {
    blocks: [],
    expectedRevision: 2,
    fields: {},
    mediaReferences: [],
    title: "Original",
    updatedAt: unixMilliseconds(4),
    updatedBy: editor,
  });
  expect(cleared.draft).not.toHaveProperty("seo");
  const reverted = revertContentDraft(cleared, {
    expectedPublishedSnapshotId: contentSnapshotId("published-1"),
    expectedRevision: 3,
    revertedAt: unixMilliseconds(5),
    revertedBy: editor,
  });
  expect(reverted.draft.seo).toEqual(seo);
  expect(Object.isFrozen(reverted.draft.seo)).toBe(true);
});

test("publication and revert preserve block envelopes and complete legacy blocks", () => {
  const legacy = entry();
  expect(legacy.draft.blocks[0]).toEqual({
    ...block("block-1", 1000, { nested: { body: "Original" } }),
    hidden: false,
    settings: {},
  });
  expect(legacy.draft.blocks[0]).not.toHaveProperty("anchor");
  const envelope = {
    anchor: "pricing",
    className: "wide",
    hidden: true,
    settings: { align: "center" },
  };
  const saved = saveCompleteDraft(legacy, {
    blocks: [{ ...block("block-1", 1000), ...envelope }],
    expectedRevision: 1,
    fields: {},
    mediaReferences: [],
    title: "Original",
    updatedAt: unixMilliseconds(2),
    updatedBy: editor,
  });
  expect(saved.draft.blocks[0]).toMatchObject(envelope);
  const published = publishContentEntry(saved, {
    expectedRevision: 2,
    publishedAt: unixMilliseconds(3),
    publishedBy: admin,
    publishedSnapshotId: contentSnapshotId("published-1"),
  });
  expect(present(published.published).blocks[0]).toMatchObject(envelope);
  const changed = saveCompleteDraft(published, {
    blocks: [{ ...block("block-1", 1000), settings: { align: "left" } }],
    expectedRevision: 2,
    fields: {},
    mediaReferences: [],
    title: "Original",
    updatedAt: unixMilliseconds(4),
    updatedBy: editor,
  });
  expect(changed.draft.blocks[0]).toMatchObject({ hidden: false, settings: { align: "left" } });
  expect(changed.draft.blocks[0]).not.toHaveProperty("anchor");
  const reverted = revertContentDraft(changed, {
    expectedPublishedSnapshotId: contentSnapshotId("published-1"),
    expectedRevision: 3,
    revertedAt: unixMilliseconds(5),
    revertedBy: editor,
  });
  expect(reverted.draft.blocks[0]).toMatchObject(envelope);
  expect(Object.isFrozen(present(reverted.draft.blocks[0]).settings)).toBe(true);
});
