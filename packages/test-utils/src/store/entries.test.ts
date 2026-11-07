import type { Actor, ContentModelRoute, MediaMetadata, ContentBlockInput } from "@lacecms/domain";
import type { CreateContentEntryInput } from "@lacecms/application";
import { present } from "../test-support/fixtures.js";
import { expect, test } from "vitest";
import {
  DeterministicClock,
  DeterministicIdGenerator,
  InMemoryContentStore,
  InMemorySiteBuildTrigger,
  readAllBuildContentPages,
} from "../index.js";
import {
  actorId,
  blockKey,
  contentEntryId,
  contentModelKey,
  contentSnapshotId,
  mediaId,
  unixMilliseconds,
} from "@lacecms/domain";
import { publicationIdempotencyKey, publicationRequestFingerprint } from "@lacecms/application";
import { ContentUseCases, duplicateTitle } from "@lacecms/application";
import { defineCollection, defineConfig, definePage } from "@lacecms/config";
import { defineBlock, field } from "@lacecms/content";
import {
  admin,
  editor,
  entry,
  savedMutation,
  lifecycleFixture,
  syncedGlobal,
  seoFixture,
  seoPost,
  envelopeFixture,
  panel,
  envelopePost,
} from "../test-support/fixtures.js";

test("provides detached stored model state and lists entry summaries through opaque cursors", async () => {
  const store = new InMemoryContentStore();
  const firstModel = {
    draftSnapshotCount: 0,
    entryCount: 0,
    key: contentModelKey("posts"),
    kind: "collection" as const,
    projectionHash: "projection-a",
    publishedSnapshotCount: 0,
    structureHash: "structure-a",
    version: 1,
  };
  store.setStoredModelStates([firstModel]);
  firstModel.projectionHash = "caller-mutated";
  const initialStates = store.storedModelStates();
  expect(initialStates).toMatchObject([{ key: "posts", projectionHash: "projection-a" }]);

  const model: ContentModelRoute = {
    key: contentModelKey("posts"),
    kind: "collection",
    route: "/blog/:slug",
  };
  await store.create({ mediaReferences: [], entry: entry({ id: "entry-a", model }) });
  await store.create({ mediaReferences: [], entry: entry({ id: "entry-b", model }) });
  expect(store.storedModelStates()).toMatchObject([
    { draftSnapshotCount: 2, entryCount: 2, key: "posts", publishedSnapshotCount: 0 },
  ]);
  expect(store.storedModelStates()[0]).not.toBe(initialStates[0]);
  const firstPage = await store.list({
    limit: 1,
    listFields: [],
    modelKey: model.key,
    sort: "updatedAt",
  });
  expect(firstPage.items.map((item) => item.id)).toEqual(["entry-a"]);
  expect(firstPage.nextCursor).toBeDefined();
  await expect(
    store.list({
      after: present(firstPage.nextCursor),
      limit: 1,
      listFields: [],
      modelKey: model.key,
      sort: "updatedAt",
    }),
  ).resolves.toMatchObject({ items: [{ id: "entry-b" }] });
});

test("enforces singleton, revision, route, and immutable-publication boundaries atomically", async () => {
  const store = new InMemoryContentStore();
  const posts: ContentModelRoute = {
    key: contentModelKey("posts"),
    kind: "collection",
    route: "/blog/:slug",
  };
  const page: ContentModelRoute = { key: contentModelKey("home"), kind: "page", path: "/" };
  await store.create({ mediaReferences: [], entry: entry({ id: "page-a", model: page }) });
  await expect(
    store.create({ mediaReferences: [], entry: entry({ id: "page-b", model: page }) }),
  ).rejects.toMatchObject({ code: "CONTENT_MODEL_CARDINALITY_CONFLICT" });

  await store.create({ mediaReferences: [], entry: entry({ id: "post-a", model: posts }) });
  await store.saveCompleteDraft({
    entryId: contentEntryId("post-a"),
    mutation: savedMutation(1, "Published", "first"),
  });
  await store.publish({
    entryId: contentEntryId("post-a"),
    expectedRevision: 2,
    publishedAt: unixMilliseconds(4),
    publishedBy: admin,
    publishedSnapshotId: contentSnapshotId("post-a-published"),
  });
  expect(await store.loadPublic("/blog/first")).toMatchObject({ entry: { id: "post-a" } });
  expect(await store.loadPublic("/blog/missing")).toBeNull();
  await expect(
    store.saveCompleteDraft({
      entryId: contentEntryId("post-a"),
      mutation: savedMutation(1, "Stale", "first"),
    }),
  ).rejects.toMatchObject({ code: "CONTENT_REVISION_CONFLICT" });
  await store.saveCompleteDraft({
    entryId: contentEntryId("post-a"),
    mutation: savedMutation(2, "Draft edit", "first"),
  });
  expect(
    present(present((await readAllBuildContentPages(store)).entries[0]).entry.published).title,
  ).toBe("Published");

  await store.create({ mediaReferences: [], entry: entry({ id: "post-b", model: posts }) });
  await store.saveCompleteDraft({
    entryId: contentEntryId("post-b"),
    mutation: savedMutation(1, "Collision", "first"),
  });
  await expect(
    store.publish({
      entryId: contentEntryId("post-b"),
      expectedRevision: 2,
      publishedAt: unixMilliseconds(4),
      publishedBy: admin,
      publishedSnapshotId: contentSnapshotId("post-b-published"),
    }),
  ).rejects.toMatchObject({ code: "CONTENT_ROUTE_CONFLICT" });
  expect(await store.loadPublished({ entryId: contentEntryId("post-b") })).toBeNull();
  expect((await readAllBuildContentPages(store)).entries).toHaveLength(1);
});

test("replays matching idempotent publications without changing public content", async () => {
  const store = new InMemoryContentStore();
  const model: ContentModelRoute = {
    key: contentModelKey("posts"),
    kind: "collection",
    route: "/blog/:slug",
  };
  await store.create({
    mediaReferences: [],
    entry: entry({ id: "post-idempotent", model, slug: "first" }),
  });
  const input = {
    entryId: contentEntryId("post-idempotent"),
    expectedRevision: 1,
    idempotency: {
      actorId: admin.id,
      fingerprint: publicationRequestFingerprint("sha256:first"),
      key: publicationIdempotencyKey("request-1"),
    },
    publishedAt: unixMilliseconds(2),
    publishedBy: admin,
    publishedSnapshotId: contentSnapshotId("post-idempotent-published"),
  };
  const first = await store.publish(input);
  const version = (await readAllBuildContentPages(store)).version;
  const replay = await store.publish(input);

  expect(first.outcome).toBe("published");
  expect(replay).toMatchObject({ outcome: "replayed", status: "published" });
  expect(replay.entry).not.toBe(first.entry);
  expect((await readAllBuildContentPages(store)).version).toBe(version);
  await expect(
    store.publish({
      ...input,
      idempotency: {
        ...input.idempotency,
        fingerprint: publicationRequestFingerprint("sha256:other"),
      },
    }),
  ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
  expect((await readAllBuildContentPages(store)).version).toBe(version);
});

test("runs the authorized in-memory content lifecycle with validation and isolated publications", async () => {
  const config = await defineConfig({
    blocks: [
      defineBlock({
        fields: { image: field.media({ required: true }) },
        type: "asset",
        version: 1,
      }),
    ],
    content: [
      definePage({
        blocks: ["asset"],
        fields: { label: field.text({ defaultValue: "Home" }) },
        key: "home",
        path: "/",
        version: 1,
      }),
      defineCollection({
        blocks: ["asset"],
        key: "posts",
        route: "/blog/:slug",
        version: 1,
      }),
    ],
  });
  const store = new InMemoryContentStore();
  const receivedCreateInputs: CreateContentEntryInput[] = [];
  const create = store.create.bind(store);
  store.create = async (input) => {
    receivedCreateInputs.push(input);
    return create(input);
  };
  const trigger = new InMemorySiteBuildTrigger({ status: "succeeded" });
  const useCases = new ContentUseCases({
    clock: new DeterministicClock(unixMilliseconds(10)),
    config: config.runtime,
    content: store,
    idGenerator: new DeterministicIdGenerator("content"),
    media: {
      async loadMediaMany(ids) {
        return (await Promise.all(ids.map((id) => this.loadMedia(id)))).filter(
          (item): item is MediaMetadata => item !== null,
        );
      },
      async loadMedia(id: string): Promise<MediaMetadata | null> {
        return id === "media-1"
          ? {
              createdAt: unixMilliseconds(1),
              createdBy: admin.id,
              filename: "cover.png",
              id: mediaId(id),
              tags: [],
              mimeType: "image/png",
              size: 1,
              status: "active",
              storageKey: "media/cover.png",
              updatedAt: unixMilliseconds(1),
            }
          : id === "inactive"
            ? {
                createdAt: unixMilliseconds(1),
                createdBy: admin.id,
                filename: "inactive.png",
                id: mediaId(id),
                tags: [],
                mimeType: "image/png",
                size: 1,
                status: "deleting",
                storageKey: "media/inactive.png",
                updatedAt: unixMilliseconds(1),
              }
            : null;
      },
    },
  });
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
    title: "Home",
  };

  const created = await useCases.create({ actor: editor, modelKey: "home", ...draft });
  expect(created.draft.fields).toEqual({ label: "Home" });
  expect(present(receivedCreateInputs[0]).mediaReferences).toEqual([
    { fieldPath: "image", mediaId: "media-1", sourceKey: "hero" },
  ]);
  const viewer: Actor = { id: actorId("viewer"), role: "viewer" };
  expect((await useCases.list({ actor: viewer, limit: 1, modelKey: "home" })).items).toHaveLength(
    1,
  );
  await expect(useCases.load({ actor: viewer, entryId: created.id })).resolves.toMatchObject({
    id: created.id,
  });
  await expect(
    useCases.create({ actor: viewer, modelKey: "posts", ...draft, slug: "denied" }),
  ).rejects.toMatchObject({
    code: "AUTHORIZATION_DENIED",
  });
  await expect(
    useCases.publish({ actor: editor, entryId: created.id, expectedRevision: 1 }),
  ).rejects.toMatchObject({
    code: "AUTHORIZATION_DENIED",
  });
  await expect(
    useCases.save({
      actor: editor,
      entryId: created.id,
      expectedRevision: 1,
      ...draft,
      blocks: [{ ...present(draft.blocks[0]), data: { image: "missing" } }],
    }),
  ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
  await expect(
    useCases.save({
      actor: editor,
      entryId: created.id,
      expectedRevision: 1,
      ...draft,
      fields: { unknown: true },
    }),
  ).rejects.toMatchObject({ name: "ContentValidationError" });
  await expect(
    useCases.save({
      actor: editor,
      entryId: created.id,
      expectedRevision: 1,
      ...draft,
      blocks: [
        ...draft.blocks,
        { ...present(draft.blocks[0]), key: blockKey("second"), position: 1000 },
      ],
    }),
  ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
  await expect(
    useCases.save({
      actor: editor,
      entryId: created.id,
      expectedRevision: 1,
      ...draft,
      title: "x".repeat(201),
    }),
  ).rejects.toMatchObject({ name: "ContentValidationError" });
  await expect(
    useCases.save({
      actor: editor,
      entryId: created.id,
      expectedRevision: 1,
      ...draft,
      blocks: [{ ...present(draft.blocks[0]), data: { image: "inactive" } }],
    }),
  ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
  expect(present(await useCases.loadDraft({ actor: admin, entryId: created.id })).revision).toBe(1);

  const incomplete = await useCases.create({
    actor: editor,
    modelKey: "posts",
    ...draft,
    blocks: [{ ...present(draft.blocks[0]), data: {} }],
    slug: "incomplete",
  });
  await expect(
    useCases.publish({ actor: admin, entryId: incomplete.id, expectedRevision: 1 }),
  ).rejects.toMatchObject({ name: "ContentValidationError" });

  const publication = await useCases.publish({
    actor: admin,
    entryId: created.id,
    expectedRevision: 1,
    idempotencyKey: "publish-home",
  });
  const replay = await useCases.publish({
    actor: admin,
    entryId: created.id,
    expectedRevision: 1,
    idempotencyKey: "publish-home",
  });
  expect(publication).toMatchObject({
    build: { status: "queued", targetVersion: 1 },
    publication: "published",
  });
  expect(replay).toMatchObject({ build: { status: "not-dispatched" }, publication: "replayed" });
  expect(trigger.requests).toHaveLength(0);

  await useCases.save({
    actor: editor,
    entryId: created.id,
    expectedRevision: 1,
    ...draft,
    title: "Edited draft",
  });
  expect(present(await useCases.loadPublished({ actor: admin, entryId: created.id })).title).toBe(
    "Home",
  );
  await expect(
    useCases.delete(
      // Exercise singleton guard with missing revision before input validation.
      { actor: editor, entryId: created.id } as unknown as Parameters<typeof useCases.delete>[0],
    ),
  ).rejects.toMatchObject({
    code: "CONTENT_PAGE_SINGLETON",
  });
  await expect(
    useCases.delete({ actor: admin, entryId: created.id, expectedRevision: 2 }),
  ).rejects.toMatchObject({ code: "CONTENT_PAGE_SINGLETON" });
  expect(await store.loadPublic("/")).toMatchObject({ entry: { id: created.id } });

  const firstPost = await useCases.create({
    actor: editor,
    modelKey: "posts",
    ...draft,
    slug: "first",
  });
  await expect(
    useCases.publish({ actor: admin, entryId: firstPost.id, expectedRevision: 1 }),
  ).resolves.toMatchObject({ publication: "published" });
  await expect(
    useCases.delete({ actor: admin, entryId: firstPost.id, expectedRevision: 0 }),
  ).rejects.toMatchObject({ code: "CONTENT_REVISION_CONFLICT" });
  expect(await useCases.load({ actor: admin, entryId: firstPost.id })).not.toBeNull();
  const conflictingPost = await useCases.create({
    actor: editor,
    modelKey: "posts",
    ...draft,
    slug: "first",
  });
  await expect(
    useCases.publish({ actor: admin, entryId: conflictingPost.id, expectedRevision: 1 }),
  ).rejects.toMatchObject({ code: "CONTENT_ROUTE_CONFLICT" });
  expect(await useCases.loadPublished({ actor: admin, entryId: conflictingPost.id })).toBeNull();
  await expect(
    useCases.delete({ actor: admin, entryId: firstPost.id, expectedRevision: 1 }),
  ).resolves.toBeUndefined();
  expect(await useCases.load({ actor: admin, entryId: firstPost.id })).toBeNull();

  const racedPost = await useCases.create({
    actor: editor,
    modelKey: "posts",
    ...draft,
    slug: "raced",
  });
  const deleteFromStore = store.delete.bind(store);
  let publishDuringDelete = true;
  store.delete = async (input) => {
    if (publishDuringDelete) {
      publishDuringDelete = false;
      await store.publish({
        entryId: racedPost.id,
        expectedRevision: 1,
        publishedAt: unixMilliseconds(11),
        publishedBy: admin,
        publishedSnapshotId: contentSnapshotId("raced-post-published"),
      });
    }
    return deleteFromStore(input);
  };
  await expect(
    useCases.delete({ actor: editor, entryId: racedPost.id, expectedRevision: 1 }),
  ).rejects.toMatchObject({ code: "CONTENT_REVISION_CONFLICT" });
  expect(await store.loadPublic("/blog/raced")).toMatchObject({ entry: { id: racedPost.id } });
});

test("runs the global lifecycle as a route-less singleton", async () => {
  const { config, store, useCases } = await lifecycleFixture();
  const viewer: Actor = { id: actorId("viewer"), role: "viewer" };
  const id = await syncedGlobal(config, store);
  const synced = present(await useCases.load({ actor: admin, entryId: id }));
  expect(synced).toMatchObject({
    draft: {
      blocks: [],
      revision: 1,
      title: "Site settings",
      updatedBy: { id: "system:content-sync" },
    },
    model: { key: "settings", kind: "global" },
  });
  expect(synced.draft).not.toHaveProperty("slug");

  const values = (overrides = {}) => ({
    blocks: [
      {
        data: { image: "media-2" },
        key: blockKey("banner"),
        position: 1000,
        schemaVersion: 1,
        type: "asset",
      },
    ],
    fields: { logo: "media-1", siteName: "Lace" },
    title: "Anything",
    ...overrides,
  });
  await expect(
    useCases.save({ actor: viewer, entryId: id, expectedRevision: 1, ...values() }),
  ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  await expect(
    useCases.save({ actor: editor, entryId: id, expectedRevision: 1, ...values({ slug: "x" }) }),
  ).rejects.toThrow(/slug/u);
  const saved = await useCases.save({
    actor: editor,
    entryId: id,
    expectedRevision: 1,
    ...values(),
  });
  expect(saved.draft).toMatchObject({ revision: 2, title: "Site settings" });

  await expect(
    useCases.create({ actor: admin, modelKey: "settings", ...values() }),
  ).rejects.toMatchObject({ code: "CONTENT_MODEL_CARDINALITY_CONFLICT" });
  for (const operation of [
    () => useCases.delete({ actor: admin, entryId: id, expectedRevision: 2 }),
    () => useCases.duplicate({ actor: admin, entryId: id }),
  ]) {
    await expect(operation()).rejects.toMatchObject({ code: "CONTENT_PAGE_SINGLETON" });
  }

  await expect(
    useCases.publish({ actor: editor, entryId: id, expectedRevision: 2 }),
  ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  const version = await store.publishedContentVersion();
  const published = await useCases.publish({ actor: admin, entryId: id, expectedRevision: 2 });
  expect(published.build).toEqual({ status: "queued", targetVersion: version + 1 });
  expect(await store.publishedContentVersion()).toBe(version + 1);
  const read = present(await store.loadPublicGlobal(contentModelKey("settings")));
  expect(read.entry.published).toMatchObject({
    fields: { siteName: "Lace" },
    title: "Site settings",
  });
  expect(read.media.map((item) => item.id)).toEqual(["media-1", "media-2"]);
  expect(await store.loadPublicGlobal(contentModelKey("home"))).toBeNull();
  expect(await store.loadPublicGlobal(contentModelKey("posts"))).toBeNull();
  expect(await store.loadPublicMedia("media-1")).toMatchObject({ id: "media-1" });
  const exported = await readAllBuildContentPages(store);
  expect(exported.entries).toEqual([]);
  expect(exported.globals.map((item) => item.entry.id)).toEqual([id]);
  expect(await store.loadPublic("/")).toBeNull();
  expect(
    (await store.listPublic({ limit: 10, modelKey: contentModelKey("settings") })).items,
  ).toEqual([]);

  await useCases.save({
    actor: editor,
    entryId: id,
    expectedRevision: 2,
    ...values({ fields: { logo: "media-3", siteName: "Changed" } }),
  });
  const reverted = await useCases.revertDraft({ actor: editor, entryId: id, expectedRevision: 3 });
  expect(reverted.draft).toMatchObject({ fields: { siteName: "Lace" }, revision: 4 });
  expect(await store.publishedContentVersion()).toBe(version + 1);

  await expect(
    useCases.unpublish({
      actor: editor,
      entryId: id,
      expectedPublishedSnapshotId: present(published.entry.published).id,
    }),
  ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  const unpublished = await useCases.unpublish({
    actor: admin,
    entryId: id,
    expectedPublishedSnapshotId: present(published.entry.published).id,
  });
  expect(unpublished.build).toEqual({ status: "queued", targetVersion: version + 2 });
  expect(await store.loadPublicGlobal(contentModelKey("settings"))).toBeNull();
  expect((await readAllBuildContentPages(store)).globals).toEqual([]);
  expect(await store.loadPublicMedia("media-1")).toBeNull();
  expect(unpublished.entry.draft.revision).toBe(4);
});

test("unpublishes guarded publications idempotently and keeps the draft", async () => {
  const { post, store, useCases } = await lifecycleFixture();
  const viewer: Actor = { id: actorId("viewer"), role: "viewer" };
  const created = await useCases.create({ actor: editor, modelKey: "posts", ...post("A", "a") });
  await expect(
    useCases.unpublish({
      actor: admin,
      entryId: created.id,
      expectedPublishedSnapshotId: contentSnapshotId("none"),
    }),
  ).rejects.toMatchObject({ code: "CONTENT_NOT_PUBLISHED" });
  const { entry: published } = await useCases.publish({
    actor: admin,
    entryId: created.id,
    expectedRevision: 1,
  });
  const changed = await useCases.save({
    actor: editor,
    entryId: created.id,
    expectedRevision: 1,
    ...post("Changed", "a", "media-2"),
  });
  const version = await store.publishedContentVersion();
  const unpublish = (actor: Actor, overrides = {}) =>
    useCases.unpublish({
      actor,
      entryId: created.id,
      expectedPublishedSnapshotId: present(published.published).id,
      ...overrides,
    });
  for (const actor of [editor, viewer]) {
    await expect(unpublish(actor)).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  }
  await expect(
    unpublish(admin, { expectedPublishedSnapshotId: contentSnapshotId("stale") }),
  ).rejects.toMatchObject({ code: "CONTENT_REVISION_CONFLICT" });
  expect(await store.publishedContentVersion()).toBe(version);
  expect(await store.loadPublic("/blog/a")).not.toBeNull();

  const result = await unpublish(admin, { idempotencyKey: "unpublish-a" });
  expect(result).toMatchObject({
    build: { status: "queued", targetVersion: version + 1 },
    unpublication: "unpublished",
  });
  expect(result.entry).not.toHaveProperty("published");
  expect(result.entry.draft).toEqual(changed.draft);
  expect(await store.loadPublic("/blog/a")).toBeNull();
  expect((await readAllBuildContentPages(store)).entries).toEqual([]);
  expect(
    (await useCases.list({ actor: admin, limit: 10, modelKey: "posts" })).items[0],
  ).toMatchObject({ status: "draft" });
  await expect(unpublish(admin, { idempotencyKey: "unpublish-a" })).resolves.toMatchObject({
    build: { status: "not-dispatched" },
    unpublication: "replayed",
  });
  await expect(
    unpublish(admin, {
      expectedPublishedSnapshotId: contentSnapshotId("other"),
      idempotencyKey: "unpublish-a",
    }),
  ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
  await expect(unpublish(admin)).rejects.toMatchObject({ code: "CONTENT_NOT_PUBLISHED" });
  expect(await store.publishedContentVersion()).toBe(version + 1);

  const republished = await useCases.publish({
    actor: admin,
    entryId: created.id,
    expectedRevision: 2,
  });
  expect(republished.entry.published).toMatchObject({ revision: 2, title: "Changed" });
  expect(present(republished.entry.published).id).not.toBe(present(published.published).id);
  expect(await store.loadPublic("/blog/a")).not.toBeNull();

  const page = await useCases.create({
    actor: editor,
    blocks: [],
    fields: {},
    modelKey: "home",
    title: "Home",
  });
  const { entry: publishedPage } = await useCases.publish({
    actor: admin,
    entryId: page.id,
    expectedRevision: 1,
  });
  await useCases.unpublish({
    actor: admin,
    entryId: page.id,
    expectedPublishedSnapshotId: present(publishedPage.published).id,
  });
  expect(await store.loadPublic("/")).toBeNull();
  expect(await useCases.load({ actor: admin, entryId: page.id })).toMatchObject({
    draft: { title: "Home" },
  });
});

test("reverts a changed draft to its publication without changing public content", async () => {
  const { post, store, useCases } = await lifecycleFixture();
  const viewer: Actor = { id: actorId("viewer"), role: "viewer" };
  const created = await useCases.create({ actor: editor, modelKey: "posts", ...post("A", "a") });
  await expect(
    useCases.revertDraft({ actor: editor, entryId: created.id, expectedRevision: 1 }),
  ).rejects.toMatchObject({ code: "CONTENT_NOT_PUBLISHED" });
  const { entry: published } = await useCases.publish({
    actor: admin,
    entryId: created.id,
    expectedRevision: 1,
  });
  await useCases.save({
    actor: editor,
    entryId: created.id,
    expectedRevision: 1,
    ...post("Changed", "changed", "media-2"),
  });
  const version = await store.publishedContentVersion();
  await expect(
    useCases.revertDraft({ actor: viewer, entryId: created.id, expectedRevision: 2 }),
  ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  await expect(
    useCases.revertDraft({ actor: editor, entryId: created.id, expectedRevision: 1 }),
  ).rejects.toMatchObject({ code: "CONTENT_REVISION_CONFLICT" });

  const reverted = await useCases.revertDraft({
    actor: editor,
    entryId: created.id,
    expectedRevision: 2,
  });
  expect(reverted.draft).toMatchObject({
    blocks: present(published.published).blocks,
    fields: present(published.published).fields,
    revision: 3,
    slug: "a",
    title: "A",
    updatedBy: editor,
  });
  expect(reverted.published).toMatchObject({ id: present(published.published).id, revision: 3 });
  expect(await store.publishedContentVersion()).toBe(version);
  expect(
    (await useCases.list({ actor: admin, limit: 10, modelKey: "posts" })).items[0],
  ).toMatchObject({ status: "published" });
  const usage = await store.loadMediaUsage({ limit: 50, mediaId: mediaId("media-2") });
  expect(usage).toEqual([]);
});

test("duplicates collection entries as unpublished copies with new block keys", async () => {
  const { post, store, useCases } = await lifecycleFixture();
  const created = await useCases.create({
    actor: editor,
    modelKey: "posts",
    ...post("Launch", "launch"),
  });
  await useCases.publish({ actor: admin, entryId: created.id, expectedRevision: 1 });
  const source = present(await useCases.load({ actor: admin, entryId: created.id }));
  const receivedCreateInputs: CreateContentEntryInput[] = [];
  const create = store.create.bind(store);
  store.create = async (input) => {
    receivedCreateInputs.push(input);
    return create(input);
  };
  await expect(
    useCases.duplicate({ actor: editor, entryId: created.id, expectedRevision: 2 }),
  ).rejects.toMatchObject({ code: "CONTENT_REVISION_CONFLICT" });
  const copy = await useCases.duplicate({
    actor: editor,
    entryId: created.id,
    expectedRevision: 1,
  });
  expect(copy.id).not.toBe(created.id);
  expect(copy).not.toHaveProperty("published");
  expect(copy.draft).toMatchObject({
    fields: source.draft.fields,
    revision: 1,
    title: "Launch (copy)",
    updatedBy: editor,
  });
  expect(copy.draft).not.toHaveProperty("slug");
  expect(copy.draft.blocks).toHaveLength(1);
  expect(copy.draft.blocks[0]).toMatchObject({
    data: { image: "media-1" },
    position: 1000,
    schemaVersion: 1,
    type: "asset",
  });
  expect(present(copy.draft.blocks[0]).key).not.toBe("hero");
  expect(receivedCreateInputs[0]).toMatchObject({
    duplicateOf: { entryId: created.id, expectedRevision: 1 },
    mediaReferences: [
      { fieldPath: "cover", mediaId: "media-1", sourceKey: "$fields" },
      { fieldPath: "image", mediaId: "media-1", sourceKey: present(copy.draft.blocks[0]).key },
    ],
  });
  expect(await useCases.load({ actor: admin, entryId: created.id })).toEqual(source);

  const raced = store.create;
  store.create = async (input) => {
    await store.saveCompleteDraft({
      entryId: created.id,
      mutation: {
        ...post("Raced", "launch"),
        expectedRevision: 1,
        mediaReferences: [],
        updatedAt: unixMilliseconds(11),
        updatedBy: editor,
      },
    });
    return raced(input);
  };
  const before = (await useCases.list({ actor: admin, limit: 10, modelKey: "posts" })).totals.all;
  await expect(useCases.duplicate({ actor: editor, entryId: created.id })).rejects.toMatchObject({
    code: "CONTENT_REVISION_CONFLICT",
  });
  expect((await useCases.list({ actor: admin, limit: 10, modelKey: "posts" })).totals.all).toBe(
    before,
  );
  store.create = create;

  const page = await useCases.create({
    actor: editor,
    blocks: [],
    fields: {},
    modelKey: "home",
    title: "Home",
  });
  await expect(useCases.duplicate({ actor: admin, entryId: page.id })).rejects.toMatchObject({
    code: "CONTENT_PAGE_SINGLETON",
  });
  await expect(
    useCases.duplicate({ actor: { id: actorId("viewer"), role: "viewer" }, entryId: created.id }),
  ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
});

test("shortens duplicate titles to the title limit at a whole character", () => {
  expect(duplicateTitle("Post")).toBe("Post (copy)");
  const long = duplicateTitle("x".repeat(200));
  expect(long).toHaveLength(200);
  expect(long.endsWith(" (copy)")).toBe(true);
  const surrogate = duplicateTitle(`${"x".repeat(192)}😀${"y".repeat(10)}`);
  expect(surrogate).toBe(`${"x".repeat(192)} (copy)`);
});

test("lists entries with derived status, totals, search, sort, and list values", async () => {
  const config = await defineConfig({
    content: [
      definePage({ key: "home", path: "/", version: 1 }),
      defineCollection({
        fields: {
          author: field.text(),
          body: field.richText(),
          category: field.select({ options: ["design", "news"] }),
          rank: field.number(),
        },
        key: "posts",
        listFields: ["category", "rank", "author"],
        route: "/blog/:slug",
        version: 1,
      }),
    ],
  });
  const store = new InMemoryContentStore();
  store.setActorDisplayNames({ editor: "editor@example.test" });
  const clock = new DeterministicClock(unixMilliseconds(100));
  const useCases = new ContentUseCases({
    clock,
    config: config.runtime,
    content: store,
    idGenerator: new DeterministicIdGenerator("list"),
    media: { loadMedia: async () => null, loadMediaMany: async () => [] },
  });
  const create = (title: string, slug: string, fields = {}) =>
    useCases.create({ actor: editor, blocks: [], fields, modelKey: "posts", slug, title });
  const draftOnly = await create("Zebra draft", "zebra", { author: "Ann", category: "news" });
  clock.advanceBy(1);
  const published = await create("apple launch", "apple-launch", { rank: 2 });
  clock.advanceBy(1);
  const changed = await create("Banana Launch", "banana", { category: "design" });
  clock.advanceBy(1);
  for (const entry of [published, changed]) {
    await useCases.publish({ actor: admin, entryId: entry.id, expectedRevision: 1 });
    clock.advanceBy(1);
  }
  await useCases.save({
    actor: editor,
    blocks: [],
    entryId: changed.id,
    expectedRevision: 1,
    fields: { category: "design" },
    slug: "banana",
    title: "Banana Launch",
  });

  const viewer: Actor = { id: actorId("viewer"), role: "viewer" };
  const all = await useCases.list({ actor: viewer, limit: 10, modelKey: "posts" });
  expect(all.totals).toEqual({ all: 3, changed: 1, draft: 1, published: 1 });
  expect(all.items.map((item) => [item.title, item.status])).toEqual([
    ["Banana Launch", "changed"],
    ["apple launch", "published"],
    ["Zebra draft", "draft"],
  ]);
  const [changedSummary, publishedSummary, draftSummary] = all.items;
  expect(draftSummary).toMatchObject({
    listValues: { author: "Ann", category: "news" },
    slug: "zebra",
    updatedBy: { displayName: "editor@example.test", id: "editor" },
  });
  expect(draftSummary).not.toHaveProperty("publishedAt");
  expect(draftSummary).not.toHaveProperty("publishedSnapshotId");
  expect(present(publishedSummary).listValues).toEqual({ rank: 2 });
  expect(present(publishedSummary).publishedAt).toBeTypeOf("number");
  expect(present(changedSummary).publishedSnapshotId).toBeDefined();
  expect(present(draftSummary).id).toBe(draftOnly.id);

  const searched = await useCases.list({
    actor: viewer,
    limit: 10,
    modelKey: "posts",
    q: "  LAUNCH ",
    sort: "title",
  });
  expect(searched.items.map((item) => item.title)).toEqual(["apple launch", "Banana Launch"]);
  expect(searched.totals).toEqual({ all: 2, changed: 1, draft: 0, published: 1 });
  const filtered = await useCases.list({
    actor: viewer,
    limit: 10,
    modelKey: "posts",
    q: "launch",
    status: "changed",
  });
  expect(filtered.items.map((item) => item.id)).toEqual([changed.id]);
  expect(filtered.totals).toEqual(searched.totals);
  expect(
    (await useCases.list({ actor: viewer, limit: 10, modelKey: "posts", q: "zebr" })).items,
  ).toHaveLength(1);

  const byPublication = await useCases.list({
    actor: viewer,
    limit: 10,
    modelKey: "posts",
    sort: "-publishedAt",
  });
  expect(byPublication.items.map((item) => item.id)).toEqual([
    changed.id,
    published.id,
    draftOnly.id,
  ]);
  const first = await useCases.list({ actor: viewer, limit: 1, modelKey: "posts", sort: "title" });
  const second = await useCases.list({
    actor: viewer,
    after: present(first.nextCursor),
    limit: 2,
    modelKey: "posts",
    sort: "title",
  });
  expect([...first.items, ...second.items].map((item) => item.title)).toEqual([
    "apple launch",
    "Banana Launch",
    "Zebra draft",
  ]);
  await expect(
    useCases.list({ actor: viewer, after: present(first.nextCursor), limit: 1, modelKey: "posts" }),
  ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });

  const results = await Promise.all(
    [viewer, editor, admin].map((actor) =>
      useCases.list({ actor, limit: 10, modelKey: "posts", q: "launch" }),
    ),
  );
  expect(results[1]).toEqual(results[0]);
  expect(results[2]).toEqual(results[0]);
  expect((await useCases.list({ actor: viewer, limit: 10, modelKey: "home" })).items).toHaveLength(
    0,
  );
});

test("validates list queries before reads and describes editors with fallbacks", async () => {
  const config = await defineConfig({
    content: [defineCollection({ key: "posts", route: "/blog/:slug", version: 1 })],
  });
  const store = new InMemoryContentStore();
  store.setActorDisplayNames({ editor: "  Editor Name  " });
  let listReads = 0;
  const list = store.list.bind(store);
  store.list = async (input) => {
    listReads += 1;
    return list(input);
  };
  const useCases = new ContentUseCases({
    clock: new DeterministicClock(unixMilliseconds(1)),
    config: config.runtime,
    content: store,
    idGenerator: new DeterministicIdGenerator("describe"),
    media: { loadMedia: async () => null, loadMediaMany: async () => [] },
  });
  for (const query of [
    { modelKey: "missing" },
    { modelKey: "posts", sort: "author" },
    { modelKey: "posts", status: "archived" },
    { modelKey: "posts", q: "x".repeat(201) },
  ]) {
    await expect(useCases.list({ actor: admin, limit: 10, ...query })).rejects.toMatchObject({
      code: "CONTENT_INVALID_STATE",
    });
  }
  expect(listReads).toBe(0);
  let received;
  store.list = async (input) => {
    received = input;
    return list(input);
  };
  await useCases.list({ actor: admin, limit: 5, modelKey: "posts", q: "   " });
  expect(received).toEqual({
    limit: 5,
    listFields: [],
    listQueryLimits: { maxSearchLength: 200, maxLikePatternBytes: null },
    modelKey: "posts",
    sort: "-updatedAt",
  });

  const describe = (id: string) => useCases.describeActor({ actor: admin, actorId: actorId(id) });
  await expect(describe("editor")).resolves.toEqual({ displayName: "Editor Name", id: "editor" });
  await expect(describe("system:content-sync")).resolves.toEqual({
    displayName: "System",
    id: "system:content-sync",
  });
  await expect(describe("gone")).resolves.toEqual({ displayName: "Unknown user", id: "gone" });
});

test("content use cases carry the SEO group through save, publish, revert and duplicate", async () => {
  const { store, useCases } = await seoFixture();
  const viewer: Actor = { id: actorId("viewer"), role: "viewer" };
  const created = await useCases.create({
    actor: editor,
    modelKey: "posts",
    ...seoPost("A", "a", {
      canonical: " https://example.com/a ",
      image: "media-1",
      noindex: false,
      title: "  Hello  ",
    }),
  });
  expect(created.draft.seo).toEqual({
    canonical: "https://example.com/a",
    image: "media-1",
    title: "Hello",
  });
  expect(store.mediaReferences(created.draft.id)).toEqual([
    { fieldPath: "image", mediaId: "media-1", sourceKey: "$seo" },
  ]);
  const { entry: published } = await useCases.publish({
    actor: admin,
    entryId: created.id,
    expectedRevision: 1,
  });
  expect(present(published.published).seo).toEqual(created.draft.seo);
  expect(store.mediaReferences(present(published.published).id)).toEqual([
    { fieldPath: "image", mediaId: "media-1", sourceKey: "$seo" },
  ]);
  const publicEntry = present(await store.loadPublic("/blog/a"));
  expect(present(publicEntry.entry.published).seo).toEqual(created.draft.seo);
  expect(publicEntry.media.map((media) => media.id)).toEqual(["media-1"]);
  expect(await store.loadPublicMedia(mediaId("media-1"))).not.toBeNull();
  expect(
    present((await store.loadMediaUsage({ limit: 50, mediaId: mediaId("media-1") }))[0]).locations,
  ).toEqual([{ field: "image", source: "seo", states: ["draft", "published"] }]);

  const cleared = await useCases.save({
    actor: editor,
    entryId: created.id,
    expectedRevision: 1,
    ...seoPost("A", "a"),
  });
  expect(cleared.draft).not.toHaveProperty("seo");
  expect(store.mediaReferences(cleared.draft.id)).toEqual([]);

  await expect(
    useCases.revertDraft({ actor: viewer, entryId: created.id, expectedRevision: 2 }),
  ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  const reverted = await useCases.revertDraft({
    actor: editor,
    entryId: created.id,
    expectedRevision: 2,
  });
  expect(reverted.draft.seo).toEqual(created.draft.seo);
  expect(store.mediaReferences(reverted.draft.id)).toEqual([
    { fieldPath: "image", mediaId: "media-1", sourceKey: "$seo" },
  ]);

  const copy = await useCases.duplicate({ actor: editor, entryId: created.id });
  expect(copy.draft.seo).toEqual(created.draft.seo);
  expect(store.mediaReferences(copy.draft.id)).toEqual([
    { fieldPath: "image", mediaId: "media-1", sourceKey: "$seo" },
  ]);
  await expect(
    useCases.save({
      actor: viewer,
      entryId: created.id,
      expectedRevision: 3,
      ...seoPost("A", "a", { title: "x" }),
    }),
  ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
});

test("content use cases refuse SEO for models without it and unavailable SEO images", async () => {
  const { store, useCases } = await seoFixture();
  let writes = 0;
  const create = store.create.bind(store);
  store.create = async (input) => {
    writes++;
    return create(input);
  };
  await expect(
    useCases.create({ actor: editor, modelKey: "notes", ...seoPost("N", "n", { title: "x" }) }),
  ).rejects.toMatchObject({
    issues: [{ code: "seo_not_allowed", path: ["seo"] }],
  });
  await expect(
    useCases.create({
      actor: editor,
      modelKey: "posts",
      ...seoPost("P", "p", { canonical: "/relative" }),
    }),
  ).rejects.toMatchObject({
    issues: [{ code: "invalid_canonical_url", path: ["seo", "canonical"] }],
  });
  await expect(
    useCases.create({
      actor: editor,
      modelKey: "posts",
      ...seoPost("P", "p", { image: "media-missing" }),
    }),
  ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
  expect(writes).toBe(0);
  const note = await useCases.create({
    actor: editor,
    modelKey: "notes",
    ...seoPost("N", "n", null),
  });
  expect(note.draft).not.toHaveProperty("seo");
});

test("the publication fingerprint covers the SEO group", async () => {
  const fingerprints: string[] = [];
  for (const seo of [undefined, { title: "Hello" }]) {
    const { store, useCases } = await seoFixture("fingerprint");
    const publish = store.publish.bind(store);
    store.publish = async (input) => {
      fingerprints.push(present(input.idempotency).fingerprint);
      return publish(input);
    };
    const created = await useCases.create({
      actor: editor,
      modelKey: "posts",
      ...seoPost("A", "a", seo),
    });
    await useCases.publish({
      actor: admin,
      entryId: created.id,
      expectedRevision: 1,
      idempotencyKey: "publish-1",
    });
  }
  expect(fingerprints).toHaveLength(2);
  expect(fingerprints[0]).not.toBe(fingerprints[1]);
});

test("content use cases carry block envelopes through save, publish, revert and duplicate", async () => {
  const { store, useCases } = await envelopeFixture();
  const created = await useCases.create({
    actor: editor,
    modelKey: "posts",
    ...envelopePost([
      panel("b1", 1000, {
        anchor: "pricing",
        className: " wide  wide ",
        settings: { boxed: true },
      }),
      panel("b2", 2000, { hidden: true }, { image: "media-2" }),
      panel("b3", 3000, {}, { heading: "Shown", image: "media-1" }),
    ]),
  });
  const [first, hidden, plain] = created.draft.blocks;
  expect(first).toMatchObject({
    anchor: "pricing",
    className: "wide",
    hidden: false,
    settings: { align: "left", boxed: true },
  });
  // Omitted envelope values take their defaults.
  expect(plain).toMatchObject({ hidden: false, settings: { align: "left", boxed: false } });
  expect(plain).not.toHaveProperty("anchor");
  expect(hidden).toMatchObject({ data: { image: "media-2" }, hidden: true });
  // Hidden-block media stays referenced.
  expect(store.mediaReferences(created.draft.id)).toEqual([
    { fieldPath: "image", mediaId: "media-2", sourceKey: "b2" },
    { fieldPath: "image", mediaId: "media-1", sourceKey: "b3" },
  ]);

  // The hidden block lacks its required heading, yet publication succeeds.
  const { entry: published } = await useCases.publish({
    actor: admin,
    entryId: created.id,
    expectedRevision: 1,
  });
  expect(present(published.published).blocks).toEqual(created.draft.blocks);
  const publicEntry = present(await store.loadPublic("/blog/a"));
  expect(present(publicEntry.entry.published).blocks.map((block) => block.key)).toEqual([
    "b1",
    "b3",
  ]);
  expect(publicEntry.media.map((media) => media.id)).toEqual(["media-1"]);
  expect(await store.loadPublicMedia(mediaId("media-2"))).toBeNull();
  expect(await store.loadPublicMedia(mediaId("media-1"))).not.toBeNull();

  const unhidden = await useCases.save({
    actor: editor,
    entryId: created.id,
    expectedRevision: 1,
    ...envelopePost([
      panel("b1", 1000, { settings: { align: "center" } }),
      panel("b2", 2000, {}, { image: "media-2" }),
    ]),
  });
  expect(unhidden.draft.blocks[0]).not.toHaveProperty("anchor");
  await expect(
    useCases.publish({ actor: admin, entryId: created.id, expectedRevision: 2 }),
  ).rejects.toMatchObject({
    issues: [{ code: "missing_required_field", path: ["blocks", 1, "data", "heading"] }],
  });
  expect(present(present(await store.loadPublic("/blog/a")).entry.published).id).toBe(
    present(published.published).id,
  );

  const reverted = await useCases.revertDraft({
    actor: editor,
    entryId: created.id,
    expectedRevision: 2,
  });
  expect(reverted.draft.blocks).toEqual(present(published.published).blocks);

  const copy = await useCases.duplicate({ actor: editor, entryId: created.id });
  expect(copy.draft.blocks.map(({ key: _key, ...rest }) => rest)).toEqual(
    reverted.draft.blocks.map(({ key: _key, ...rest }) => rest),
  );
  expect(copy.draft.blocks.map((block) => block.key)).not.toContain("b1");
});

test("content use cases refuse invalid block envelopes before writing", async () => {
  const { store, useCases } = await envelopeFixture();
  let writes = 0;
  const create = store.create.bind(store);
  store.create = async (input) => {
    writes++;
    return create(input);
  };
  const refused = async (blocks: readonly ContentBlockInput[], issue: unknown) =>
    expect(
      useCases.create({ actor: editor, modelKey: "posts", ...envelopePost(blocks) }),
    ).rejects.toMatchObject({ issues: [issue] });
  await refused([panel("b1", 1000, { anchor: "faq" }), panel("b2", 2000, { anchor: "faq" })], {
    code: "duplicate_block_anchor",
    path: ["blocks", 1, "anchor"],
  });
  await refused([panel("b1", 1000, { anchor: "FAQ" })], {
    code: "invalid_block_anchor",
    path: ["blocks", 0, "anchor"],
  });
  await refused([panel("b1", 1000, { settings: { width: 2 } })], {
    code: "unknown_field",
    path: ["blocks", 0, "settings", "width"],
  });
  await expect(
    useCases.create({
      actor: editor,
      modelKey: "posts",
      ...envelopePost([panel("b1", 1000, { hidden: true }, { image: "media-missing" })]),
    }),
  ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
  expect(writes).toBe(0);
});

test("the publication fingerprint covers the block envelope", async () => {
  const fingerprints: string[] = [];
  for (const hidden of [false, true]) {
    const { store, useCases } = await envelopeFixture("envelope-fingerprint");
    const publish = store.publish.bind(store);
    store.publish = async (input) => {
      fingerprints.push(present(input.idempotency).fingerprint);
      return publish(input);
    };
    const created = await useCases.create({
      actor: editor,
      modelKey: "posts",
      ...envelopePost([panel("b1", 1000, { hidden })]),
    });
    await useCases.publish({
      actor: admin,
      entryId: created.id,
      expectedRevision: 1,
      idempotencyKey: "publish-1",
    });
  }
  expect(fingerprints).toHaveLength(2);
  expect(fingerprints[0]).not.toBe(fingerprints[1]);
});

test("the in-memory store writes a supplied conditional-field projection", async () => {
  const config = await defineConfig({
    blocks: [
      defineBlock({
        type: "cta",
        version: 1,
        fields: { hasUrl: field.boolean(), url: field.url() },
        visibility: { url: { field: "hasUrl", values: [true] } },
      }),
    ],
    content: [
      defineCollection({
        key: "posts",
        version: 1,
        route: "/blog/:slug",
        blocks: ["cta"],
        fields: {
          kind: field.select({ options: ["a", "b"], required: true }),
          extra: field.text({ required: true }),
        },
        visibility: { extra: { field: "kind", values: ["b"] } },
      }),
    ],
  });
  const store = new InMemoryContentStore();
  const cases = new ContentUseCases({
    config: config.runtime,
    content: store,
    media: { loadMedia: async () => null, loadMediaMany: async () => [] },
    clock: new DeterministicClock(unixMilliseconds(1)),
    idGenerator: new DeterministicIdGenerator("conditional"),
  });
  const created = await cases.create({
    actor: admin,
    modelKey: "posts",
    title: "Post",
    slug: "post",
    fields: { kind: "a", extra: "kept" },
    blocks: [
      {
        key: blockKey("cta"),
        type: "cta",
        schemaVersion: 1,
        position: 1000,
        data: { hasUrl: false, url: "https://example.com" },
      },
    ],
  });
  await cases.publish({ actor: admin, entryId: created.id, expectedRevision: 1 });
  const loaded = present(await store.load({ entryId: created.id }));
  expect(present(loaded.published).fields).toEqual({ kind: "a" });
  expect(present(present(loaded.published).blocks[0]).data).toEqual({ hasUrl: false });
  expect(loaded.draft.fields).toEqual({ kind: "a", extra: "kept" });
  expect(present(loaded.draft.blocks[0]).data).toEqual({
    hasUrl: false,
    url: "https://example.com",
  });
  expect(present(present(await store.loadPublic("/blog/post")).entry.published).fields).toEqual({
    kind: "a",
  });
});
