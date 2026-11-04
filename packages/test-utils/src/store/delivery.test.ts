import { present } from "../test-support/fixtures.js";
import type { MediaMetadata, ContentModelRoute } from "@lacecms/domain";
import { opaqueCursor } from "@lacecms/application";
import { expect, test } from "vitest";
import {
  DeterministicClock,
  DeterministicIdGenerator,
  InMemoryContentStore,
  readAllBuildContentPages,
} from "../index.js";
import {
  blockKey,
  contentEntryId,
  contentModelKey,
  contentSnapshotId,
  mediaId,
  unixMilliseconds,
} from "@lacecms/domain";

import { ContentUseCases } from "@lacecms/application";
import { defineCollection, defineConfig } from "@lacecms/config";
import { defineBlock, field } from "@lacecms/content";
import { admin, editor, entry, savedMutation } from "../test-support/fixtures.js";

test("reports rejected and unavailable builds without undoing a publication", async () => {
  const config = await defineConfig({
    blocks: [
      defineBlock({
        fields: { image: field.media({ required: true }) },
        type: "asset",
        version: 1,
      }),
    ],
    content: [
      defineCollection({ blocks: ["asset"], key: "posts", route: "/blog/:slug", version: 1 }),
    ],
  });
  const store = new InMemoryContentStore();
  const dependencies = {
    clock: new DeterministicClock(unixMilliseconds(10)),
    config: config.runtime,
    content: store,
    idGenerator: new DeterministicIdGenerator("build"),
    media: {
      async loadMediaMany(ids: readonly string[]) {
        return (await Promise.all(ids.map(() => this.loadMedia()))).filter(Boolean);
      },
      async loadMedia() {
        return {
          createdAt: unixMilliseconds(1),
          createdBy: admin.id,
          filename: "cover.png",
          id: mediaId("media-1"),
          mimeType: "image/png",
          size: 1,
          status: "active" as const,
          tags: [],
          storageKey: "media/cover.png",
          updatedAt: unixMilliseconds(1),
        };
      },
    },
  };
  const draft = {
    blocks: [
      {
        data: { image: "media-1" },
        key: blockKey("hero"),
        position: 1000,
        schemaVersion: 1,
        type: "asset",
      },
    ],
    fields: {},
    slug: "first",
    title: "First",
  };
  const rejected = new ContentUseCases(dependencies);
  const entry = await rejected.create({ actor: editor, modelKey: "posts", ...draft });
  await expect(
    rejected.publish({ actor: admin, entryId: entry.id, expectedRevision: 1 }),
  ).resolves.toMatchObject({
    build: { status: "queued", targetVersion: 1 },
    publication: "published",
  });
  expect(present(await rejected.loadPublished({ actor: admin, entryId: entry.id })).title).toBe(
    "First",
  );

  await rejected.save({
    actor: editor,
    entryId: entry.id,
    expectedRevision: 1,
    ...draft,
    title: "Second",
  });
  const unavailable = new ContentUseCases(dependencies);
  await expect(
    unavailable.publish({ actor: admin, entryId: entry.id, expectedRevision: 2 }),
  ).resolves.toMatchObject({
    build: { status: "queued", targetVersion: 2 },
    publication: "published",
  });
  expect(present(await unavailable.loadPublished({ actor: admin, entryId: entry.id })).title).toBe(
    "Second",
  );
});

test("in-memory public reads expose published values and published media only", async () => {
  const store = new InMemoryContentStore();
  const media = (id: string, extra: Partial<MediaMetadata> = {}): MediaMetadata => ({
    createdAt: unixMilliseconds(1),
    createdBy: editor.id,
    filename: "image.png",
    id: mediaId(id),
    mimeType: "image/png",
    size: 1,
    status: "active",
    storageKey: `media/${id}`,
    tags: [],
    updatedAt: unixMilliseconds(1),
    ...extra,
  });
  store.registerMedia(media("media-2", { alt: "Office", height: 900, width: 1600 }));
  store.registerMedia(media("media-1"));
  store.registerMedia(media("media-3"));
  const model: ContentModelRoute = {
    key: contentModelKey("posts"),
    kind: "collection",
    route: "/blog/:slug",
  };
  await store.create({
    entry: entry({ id: "post", model, slug: "post" }),
    mediaReferences: [
      { fieldPath: "image", mediaId: mediaId("media-2"), sourceKey: "$fields" },
      { fieldPath: "image", mediaId: mediaId("media-1"), sourceKey: blockKey("post-block") },
    ],
  });
  await store.publish({
    entryId: contentEntryId("post"),
    expectedRevision: 1,
    publishedAt: unixMilliseconds(2),
    publishedBy: editor,
    publishedSnapshotId: contentSnapshotId("post-published"),
  });
  await store.saveCompleteDraft({
    entryId: contentEntryId("post"),
    mutation: {
      blocks: [],
      expectedRevision: 1,
      fields: {},
      mediaReferences: [{ fieldPath: "image", mediaId: mediaId("media-3"), sourceKey: "$fields" }],
      title: "DRAFT ONLY",
      updatedAt: unixMilliseconds(3),
      updatedBy: editor,
    },
  });
  for (const value of [
    await store.loadPublic("/blog/post"),
    (await store.listPublic({ limit: 10, modelKey: contentModelKey("posts") })).items[0],
    (await readAllBuildContentPages(store)).entries[0],
  ]) {
    const item = present(value);
    expect(item.media.map((item) => item.id)).toEqual(["media-1", "media-2"]);
    expect(item.media[1]).toMatchObject({ alt: "Office", height: 900, width: 1600 });
    expect(item.entry.draft.title).toBe("Original");
    expect(JSON.stringify(item)).not.toContain("DRAFT ONLY");
  }
});

test("pages the in-memory build export by path, limit, byte budget and version", async () => {
  const store = new InMemoryContentStore();
  const posts: ContentModelRoute = {
    key: contentModelKey("posts"),
    kind: "collection",
    route: "/blog/:slug",
  };
  let revisionTime = 10;
  async function publishPost(slug: string, body = slug) {
    const id = `post-${slug}`;
    await store.create({ entry: entry({ id, model: posts }), mediaReferences: [] });
    await store.saveCompleteDraft({
      entryId: contentEntryId(id),
      mutation: { ...savedMutation(1, slug, slug), fields: { body }, mediaReferences: [] },
    });
    revisionTime += 1;
    await store.publish({
      entryId: contentEntryId(id),
      expectedRevision: 2,
      publishedAt: unixMilliseconds(revisionTime),
      publishedBy: admin,
      publishedSnapshotId: contentSnapshotId(`${id}-published`),
    });
  }
  for (const slug of ["e", "a", "d", "b", "c"]) await publishPost(slug);
  const version = await store.publishedContentVersion();

  const first = await store.exportBuildContentPage({ limit: 2 });
  expect(first).toMatchObject({ globals: [], version });
  expect(first.entries.map((item) => item.path)).toEqual(["/blog/a", "/blog/b"]);
  const second = await store.exportBuildContentPage({ after: present(first.nextCursor), limit: 2 });
  expect(second).not.toHaveProperty("globals");
  expect(second.entries.map((item) => item.path)).toEqual(["/blog/c", "/blog/d"]);
  const third = await store.exportBuildContentPage({ after: present(second.nextCursor), limit: 2 });
  expect(third.entries.map((item) => item.path)).toEqual(["/blog/e"]);
  expect(third).not.toHaveProperty("nextCursor");
  expect((await readAllBuildContentPages(store, 2)).entries).toHaveLength(5);

  for (const limit of [0, 101, 1.5]) {
    await expect(store.exportBuildContentPage({ limit })).rejects.toMatchObject({
      code: "CONTENT_INVALID_STATE",
    });
  }
  const collectionCursor = (await store.listPublic({ limit: 1, modelKey: posts.key })).nextCursor;
  for (const after of [
    present(collectionCursor),
    opaqueCursor("build-export:x:/a"),
    opaqueCursor("garbage"),
  ]) {
    await expect(store.exportBuildContentPage({ after, limit: 2 })).rejects.toMatchObject({
      code: "CONTENT_INVALID_STATE",
      name: "BuildExportCursorError",
    });
  }

  // Byte budget: about 1.5 MB each, so two fit in 4 MB and an oversized entry is alone.
  await publishPost("f1", "x".repeat(1_500_000));
  await publishPost("f2", "x".repeat(1_500_000));
  await publishPost("f3", "x".repeat(1_500_000));
  await publishPost("g", "x".repeat(4_500_000));
  const pages = (await readAllBuildContentPages(store)).pages.map((page) =>
    page.entries.map((item) => item.path),
  );
  expect(pages).toEqual([
    ["/blog/a", "/blog/b", "/blog/c", "/blog/d", "/blog/e", "/blog/f1", "/blog/f2"],
    ["/blog/f3"],
    ["/blog/g"],
  ]);

  const stale = await store.exportBuildContentPage({ limit: 1 });
  await publishPost("h");
  await expect(
    store.exportBuildContentPage({ after: present(stale.nextCursor), limit: 1 }),
  ).rejects.toMatchObject({
    actualVersion: stale.version + 1,
    code: "BUILD_EXPORT_VERSION_CHANGED",
    expectedVersion: stale.version,
  });
});
