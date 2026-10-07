import { expect, test } from "vitest";
import {
  DeterministicClock,
  DeterministicIdGenerator,
  DeterministicTokenHasher,
  InMemoryCache,
  InMemoryContentStore,
  InMemoryDispatcherLeasePort,
  InMemoryObjectStorage,
  InMemorySiteBuildTrigger,
  assertAtomicCheckpoints,
  assertQueryPlanUsesIndex,
  packageName,
} from "../dist/index.js";
import {
  actorId,
  blockKey,
  contentEntryId,
  contentModelKey,
  contentSnapshotId,
  createContentEntry,
  mediaId,
  unixMilliseconds,
} from "@lacecms/domain";
import {
  applyPreparedConfigurationSynchronization,
  defaultDispatcherRetryPolicy,
  dispatcherRetryDelay,
  dispatcherEventId,
  opaqueTokenSecret,
  prepareConfigurationSynchronization,
  publicationIdempotencyKey,
  publicationRequestFingerprint,
} from "@lacecms/application";
import {
  collectMediaBytes,
  ContentUseCases,
  detectMediaMimeType,
  MAX_IMAGE_DIMENSION,
  MAX_IMAGE_PIXELS,
  MAX_MEDIA_BYTES,
  MediaUseCases,
  sanitizeMediaFilename,
} from "@lacecms/application";
import { defineCollection, defineConfig, definePage } from "@lacecms/config";
import { defineBlock, field } from "@lacecms/content";
test("exports its package identity", () => expect(packageName).toBe("@lacecms/test-utils"));

test("provides reusable atomic-checkpoint and query-plan contract helpers", async () => {
  const visited = [];
  await assertAtomicCheckpoints({
    checkpoints: ["first", "second"],
    run: async (checkpoint) => visited.push(checkpoint),
  });
  expect(visited).toEqual(["first", "second"]);
  expect(() =>
    assertQueryPlanUsesIndex([{ detail: "USING INDEX expected_idx" }], "expected_idx"),
  ).not.toThrow();
  expect(() => assertQueryPlanUsesIndex([{ detail: "SCAN table" }], "expected_idx")).toThrow();
});

const admin = { id: actorId("admin"), role: "admin" };
const editor = { id: actorId("editor"), role: "editor" };

function stream(text) {
  const bytes = new TextEncoder().encode(text);
  return {
    async *[Symbol.asyncIterator]() {
      yield bytes;
    },
  };
}

async function read(streamValue) {
  const chunks = [];
  for await (const chunk of streamValue) chunks.push(...chunk);
  return new TextDecoder().decode(new Uint8Array(chunks));
}

function binaryStream(bytes) {
  return {
    async *[Symbol.asyncIterator]() {
      yield bytes;
    },
  };
}

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test("validates portable media byte policy and sanitizes display names", async () => {
  expect(detectMediaMimeType(png)).toBe("image/png");
  expect(detectMediaMimeType(new Uint8Array([0xff, 0xd8, 0xff]))).toBe("image/jpeg");
  expect(() => detectMediaMimeType(new Uint8Array())).toThrow(/must not be empty/u);
  expect(() => detectMediaMimeType(new TextEncoder().encode("<svg/>"))).toThrow(
    /not an allowed image format/u,
  );
  expect(sanitizeMediaFilename(" ../../\u0000 invoice\n.png ")).toBe(".. .. invoice .png");
  await expect(
    collectMediaBytes(binaryStream(new Uint8Array(MAX_MEDIA_BYTES + 1))),
  ).rejects.toThrow(/10 MiB/u);
});

test("orchestrates verified media creation and keeps storage keys private", async () => {
  const store = new InMemoryContentStore();
  const storage = new InMemoryObjectStorage();
  const logs = [];
  const media = new MediaUseCases({
    clock: new DeterministicClock(unixMilliseconds(5)),
    idGenerator: new DeterministicIdGenerator("media"),
    imageInspector: {
      async inspect(bytes, mimeType) {
        expect(bytes).toEqual(png);
        expect(mimeType).toBe("image/png");
        return { height: 4, width: 3 };
      },
    },
    logger: { error: (event) => logs.push(event) },
    media: store,
    storage,
  });

  const created = await media.create({
    actor: editor,
    body: binaryStream(png),
    filename: "../cover\r\n.png",
  });
  expect(created).toMatchObject({
    filename: ".. cover .png",
    height: 4,
    id: "media-1",
    mimeType: "image/png",
    status: "active",
    width: 3,
  });
  expect(created).not.toHaveProperty("storageKey");
  expect(await storage.get("media/media-1")).not.toBeNull();
  expect(logs).toEqual([]);

  const viewer = { id: actorId("viewer"), role: "viewer" };
  await expect(
    media.create({ actor: viewer, body: binaryStream(png), filename: "denied.png" }),
  ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  await expect(media.get({ actor: viewer, mediaId: created.id })).resolves.toMatchObject({
    id: created.id,
  });
  await expect(media.list({ actor: viewer, limit: 10 })).resolves.toMatchObject({
    items: [{ id: created.id }],
  });
  await expect(
    media.requestDeletion({ actor: editor, mediaId: created.id }),
  ).resolves.toMatchObject({
    id: created.id,
    status: "deleting",
  });
  expect(await storage.get("media/media-1")).not.toBeNull();
  await expect(media.requestDeletion({ actor: viewer, mediaId: created.id })).rejects.toMatchObject(
    { code: "AUTHORIZATION_DENIED" },
  );
});

test("cleans up a stored object and logs only its opaque key when metadata creation fails", async () => {
  const store = new InMemoryContentStore();
  store.createMedia = async () => {
    throw new Error("database unavailable");
  };
  const storage = new InMemoryObjectStorage();
  const logs = [];
  const media = new MediaUseCases({
    clock: new DeterministicClock(unixMilliseconds(5)),
    idGenerator: new DeterministicIdGenerator("media"),
    imageInspector: {
      async inspect() {
        return { height: 1, width: 1 };
      },
    },
    logger: { error: (event) => logs.push(event) },
    media: store,
    storage,
  });

  await expect(
    media.create({ actor: editor, body: binaryStream(png), filename: "secret.png" }),
  ).rejects.toThrow("database unavailable");
  expect(await storage.get("media/media-1")).toBeNull();
  expect(logs).toEqual([{ code: "MEDIA_METADATA_CREATE_FAILED", storageKey: "media/media-1" }]);
});

test("reads eligible media binaries without exposing storage locations", async () => {
  const store = new InMemoryContentStore();
  const storage = new InMemoryObjectStorage();
  const id = mediaId("published-media");
  store.registerMedia({
    createdAt: unixMilliseconds(1),
    createdBy: editor.id,
    filename: "cover.png",
    height: 1,
    id,
    mimeType: "image/png",
    size: 3,
    status: "active",
    storageKey: "media/private-published-media",
    updatedAt: unixMilliseconds(1),
    width: 1,
  });
  await storage.put({
    body: binaryStream(new Uint8Array([1, 2, 3])),
    contentType: "image/png",
    key: "media/private-published-media",
  });
  let publiclyEligible = false;
  const media = new MediaUseCases({
    clock: new DeterministicClock(unixMilliseconds(1)),
    idGenerator: new DeterministicIdGenerator("media"),
    imageInspector: {
      async inspect() {
        return { height: 1, width: 1 };
      },
    },
    logger: { error() {} },
    media: store,
    publicMedia: {
      async loadPublicMedia(mediaId_) {
        return publiclyEligible ? store.loadMedia(mediaId_) : null;
      },
    },
    storage,
  });
  const viewer = { id: actorId("viewer"), role: "viewer" };
  const preview = await media.preview({ actor: viewer, mediaId: id });
  expect(preview).toMatchObject({ filename: "cover.png", mimeType: "image/png" });
  expect(preview).not.toHaveProperty("storageKey");
  expect(await read(preview.body)).toBe("\u0001\u0002\u0003");
  await expect(media.readPublic({ mediaId: id })).resolves.toBeNull();
  publiclyEligible = true;
  const publicBinary = await media.readPublic({ mediaId: id });
  expect(await read(publicBinary.body)).toBe("\u0001\u0002\u0003");
  await storage.delete("media/private-published-media");
  await expect(media.preview({ actor: viewer, mediaId: id })).rejects.toThrow(
    "Stored media object is unavailable.",
  );
});

test("enforces image dimensions and authorized deletion lifecycle operations", async () => {
  const store = new InMemoryContentStore();
  let dimensions = { height: 1, width: MAX_IMAGE_DIMENSION + 1 };
  const media = new MediaUseCases({
    clock: new DeterministicClock(unixMilliseconds(9)),
    idGenerator: new DeterministicIdGenerator("media"),
    imageInspector: {
      async inspect() {
        return dimensions;
      },
    },
    logger: { error() {} },
    media: store,
    storage: new InMemoryObjectStorage(),
  });
  await expect(
    media.create({ actor: editor, body: binaryStream(png), filename: "large.png" }),
  ).rejects.toThrow(/dimensions/u);
  dimensions = { height: 10_001, width: 10_000 };
  await expect(
    media.create({ actor: editor, body: binaryStream(png), filename: "many-pixels.png" }),
  ).rejects.toThrow(/dimensions/u);
  dimensions = { height: 10_000, width: 10_000 };
  await expect(
    media.create({ actor: editor, body: binaryStream(png), filename: "boundary.png" }),
  ).resolves.toMatchObject({ height: 10_000, width: 10_000 });

  store.registerMedia({
    createdAt: unixMilliseconds(1),
    createdBy: editor.id,
    filename: "retry.png",
    height: 1,
    id: mediaId("retry-media"),
    mimeType: "image/png",
    size: 1,
    status: "delete_failed",
    storageKey: "media/retry-media",
    updatedAt: unixMilliseconds(1),
    width: 1,
  });
  await expect(
    media.retryDeletion({ actor: editor, mediaId: mediaId("retry-media") }),
  ).resolves.toMatchObject({ id: "retry-media", status: "deleting" });
  expect(MAX_IMAGE_DIMENSION * MAX_IMAGE_DIMENSION).toBeGreaterThan(MAX_IMAGE_PIXELS);
});

test("rejects truncated and polyglot image containers before object storage", async () => {
  for (const bytes of [png, new Uint8Array([...png, 0x3c, 0x73, 0x76, 0x67, 0x3e])]) {
    const writes = [];
    const media = new MediaUseCases({
      clock: new DeterministicClock(unixMilliseconds(5)),
      idGenerator: new DeterministicIdGenerator("media"),
      imageInspector: {
        async inspect() {
          throw new Error("container is malformed or contains trailing data");
        },
      },
      logger: { error() {} },
      media: new InMemoryContentStore(),
      storage: {
        async delete() {},
        async put(input) {
          writes.push(input.key);
          return { contentType: input.contentType, key: input.key, size: bytes.byteLength };
        },
      },
    });
    await expect(
      media.create({ actor: editor, body: binaryStream(bytes), filename: "spoofed.png" }),
    ).rejects.toThrow(/container/u);
    expect(writes).toEqual([]);
  }
});

test("records cleanup failure without leaking a metadata-write error", async () => {
  const store = new InMemoryContentStore();
  store.createMedia = async () => {
    throw new Error("untrusted database detail");
  };
  const logs = [];
  const media = new MediaUseCases({
    clock: new DeterministicClock(unixMilliseconds(5)),
    idGenerator: new DeterministicIdGenerator("media"),
    imageInspector: {
      async inspect() {
        return { height: 1, width: 1 };
      },
    },
    logger: { error: (event) => logs.push(event) },
    media: store,
    storage: {
      async delete() {
        throw new Error("storage credentials must not be logged");
      },
      async put(input) {
        return { contentType: input.contentType, key: input.key, size: png.byteLength };
      },
    },
  });

  await expect(
    media.create({ actor: editor, body: binaryStream(png), filename: "private.png" }),
  ).rejects.toThrow("untrusted database detail");
  expect(logs).toEqual([
    { code: "MEDIA_METADATA_CREATE_FAILED", storageKey: "media/media-1" },
    { code: "MEDIA_OBJECT_CLEANUP_FAILED", storageKey: "media/media-1" },
  ]);
});

function entry({ id, model, slug, title = "Original" }) {
  return createContentEntry({
    id: contentEntryId(id),
    model,
    draft: {
      blocks: [
        {
          data: { body: title },
          key: blockKey(`${id}-block`),
          position: 1000,
          schemaVersion: 1,
          type: "richText",
        },
      ],
      createdAt: unixMilliseconds(1),
      entryId: contentEntryId(id),
      fields: { body: title },
      id: contentSnapshotId(`${id}-draft`),
      revision: 1,
      ...(slug === undefined ? {} : { slug }),
      state: "draft",
      title,
      updatedAt: unixMilliseconds(1),
      updatedBy: editor,
    },
  });
}

function savedMutation(revision, title, slug) {
  return {
    blocks: [
      {
        data: { body: title },
        key: blockKey(`${title}-block`),
        position: 1000,
        schemaVersion: 1,
        type: "richText",
      },
    ],
    expectedRevision: revision,
    fields: { body: title },
    slug,
    title,
    updatedAt: unixMilliseconds(revision + 1),
    updatedBy: editor,
  };
}

test("in-memory persistence refuses a new reference after media deletion commits", async () => {
  const store = new InMemoryContentStore();
  const id = mediaId("deleting-media");
  store.registerMedia({
    createdAt: unixMilliseconds(1),
    createdBy: editor.id,
    filename: "image.png",
    id,
    mimeType: "image/png",
    size: 1,
    status: "active",
    storageKey: "media/deleting-media",
    updatedAt: unixMilliseconds(1),
  });
  await store.markForDeletion({
    mediaId: id,
    requestedAt: unixMilliseconds(2),
    requestedBy: editor,
  });
  await expect(
    store.create({
      entry: entry({
        id: "deleting-reference",
        model: { key: contentModelKey("posts"), kind: "collection", route: "/blog/:slug" },
        slug: "deleting-reference",
      }),
      mediaReferences: [{ fieldPath: "image", mediaId: id, sourceKey: "$fields" }],
    }),
  ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
});

test("provides deterministic infrastructure fakes with detached values", async () => {
  const clock = new DeterministicClock(unixMilliseconds(10));
  expect(clock.advanceBy(5)).toBe(15);
  const ids = new DeterministicIdGenerator("test");
  expect([ids.next(), ids.next()]).toEqual(["test-1", "test-2"]);

  const storage = new InMemoryObjectStorage();
  await storage.put({ body: stream("hello"), contentType: "text/plain", key: "media/a" });
  expect(await read(await storage.get("media/a"))).toBe("hello");
  expect(await storage.createReadUrl("media/a")).toBe("memory-object://media%2Fa");
  await storage.delete("media/a");
  expect(await storage.get("media/a")).toBeNull();

  const cache = new InMemoryCache();
  expect(await cache.get("missing")).toBeNull();
  await cache.set("data", { nested: { value: 1 } });
  const cached = await cache.get("data");
  cached.nested.value = 2;
  expect((await cache.get("data")).nested.value).toBe(1);

  const tokens = new DeterministicTokenHasher();
  const verifier = await tokens.hash(opaqueTokenSecret("build-secret"));
  expect(verifier).not.toContain("build-secret");
  await expect(tokens.verify(opaqueTokenSecret("build-secret"), verifier)).resolves.toBe(true);
  await expect(tokens.verify(opaqueTokenSecret("wrong"), verifier)).resolves.toBe(false);

  const trigger = new InMemorySiteBuildTrigger({ status: "failed", reason: "trigger_unavailable" });
  expect(await trigger.trigger({ buildId: "build-1", targetVersion: 2 })).toEqual({
    status: "failed",
    reason: "trigger_unavailable",
  });
  expect(trigger.requests).toHaveLength(1);
  await expect(
    new InMemorySiteBuildTrigger().trigger({ buildId: "build-2", targetVersion: 2 }),
  ).resolves.toEqual({ status: "succeeded" });
  await expect(
    new InMemorySiteBuildTrigger({ status: "accepted", providerBuildId: "provider-1" }).trigger({
      buildId: "build-3",
      targetVersion: 2,
    }),
  ).resolves.toEqual({ status: "accepted", providerBuildId: "provider-1" });
});

test("leases one dispatcher event exclusively until it is completed", async () => {
  const leases = new InMemoryDispatcherLeasePort();
  leases.enqueue({
    attempts: 0,
    availableAt: unixMilliseconds(10),
    id: dispatcherEventId("event-1"),
    payload: { target: "site" },
    type: "build",
  });
  const first = await leases.claim({ eventTypes: ["build"], limit: 1, now: unixMilliseconds(10) });
  expect(first).toHaveLength(1);
  await expect(
    leases.claim({ eventTypes: ["build"], limit: 1, now: unixMilliseconds(11) }),
  ).resolves.toEqual([]);
  await leases.complete({
    completedAt: unixMilliseconds(15),
    leaseId: first[0].id,
    outcome: "succeeded",
  });
  await expect(
    leases.claim({ eventTypes: ["build"], limit: 1, now: unixMilliseconds(16) }),
  ).resolves.toEqual([]);
});

test("recovers expired leases and calculates bounded full-jitter retries", async () => {
  const leases = new InMemoryDispatcherLeasePort();
  leases.enqueue({
    attempts: 0,
    availableAt: unixMilliseconds(1),
    id: dispatcherEventId("event-retry"),
    payload: {},
    type: "media.delete.requested",
  });
  const first = await leases.claim({
    eventTypes: ["media.delete.requested"],
    limit: 1,
    now: unixMilliseconds(1),
  });
  const recovered = await leases.claim({
    eventTypes: ["media.delete.requested"],
    limit: 1,
    now: unixMilliseconds(60_001),
  });
  expect(recovered).toHaveLength(1);
  await expect(
    leases.complete({
      completedAt: unixMilliseconds(60_001),
      leaseId: first[0].id,
      outcome: "succeeded",
    }),
  ).rejects.toThrow("expired");
  expect(dispatcherRetryDelay(defaultDispatcherRetryPolicy, 1, 0)).toBe(0);
  expect(dispatcherRetryDelay(defaultDispatcherRetryPolicy, 1, 0.999)).toBeLessThanOrEqual(1_000);
  expect(dispatcherRetryDelay(defaultDispatcherRetryPolicy, 99, 0.999)).toBeLessThanOrEqual(
    defaultDispatcherRetryPolicy.maxDelayMs,
  );
});

test("provides detached stored model state and lists entry summaries through opaque cursors", async () => {
  const store = new InMemoryContentStore();
  const firstModel = {
    draftSnapshotCount: 0,
    entryCount: 0,
    key: "posts",
    kind: "collection",
    projectionHash: "projection-a",
    publishedSnapshotCount: 0,
    structureHash: "structure-a",
    version: 1,
  };
  store.setStoredModelStates([firstModel]);
  firstModel.projectionHash = "caller-mutated";
  const initialStates = store.storedModelStates();
  expect(initialStates).toMatchObject([{ key: "posts", projectionHash: "projection-a" }]);

  const model = { key: contentModelKey("posts"), kind: "collection", route: "/blog/:slug" };
  await store.create({ entry: entry({ id: "entry-a", model }) });
  await store.create({ entry: entry({ id: "entry-b", model }) });
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
      after: firstPage.nextCursor,
      limit: 1,
      listFields: [],
      modelKey: model.key,
      sort: "updatedAt",
    }),
  ).resolves.toMatchObject({ items: [{ id: "entry-b" }] });
});

test("applies prepared configuration sync plans atomically and treats repeats as no-ops", async () => {
  const store = new InMemoryContentStore();
  const config = await defineConfig({
    content: [
      definePage({
        fields: {
          greeting: field.text({ defaultValue: "Hello" }),
          required: field.text({ required: true }),
        },
        key: "home",
        path: "/",
        version: 1,
      }),
      defineCollection({ key: "posts", route: "/blog/:slug", version: 1 }),
    ],
  });
  const clock = new DeterministicClock(unixMilliseconds(10));
  const ids = new DeterministicIdGenerator("sync");
  const prepared = await prepareConfigurationSynchronization({
    models: config.content,
    state: store,
  });
  await expect(
    applyPreparedConfigurationSynchronization({
      clock,
      ids,
      models: config.content,
      prepared,
      target: store,
    }),
  ).resolves.toMatchObject({ status: "applied", targetVersion: 1 });
  expect(store.storedModelStates()).toMatchObject([
    { entryCount: 1, key: "home" },
    { entryCount: 0, key: "posts" },
  ]);
  expect(
    (
      await store.list({
        limit: 1,
        listFields: [],
        modelKey: contentModelKey("home"),
        sort: "-updatedAt",
      })
    ).items[0],
  ).toMatchObject({
    title: "home",
  });
  expect(store.configurationSyncBuildRequests).toEqual([1]);

  const repeated = await prepareConfigurationSynchronization({
    models: config.content,
    state: store,
  });
  await expect(
    applyPreparedConfigurationSynchronization({
      clock,
      ids,
      models: config.content,
      prepared: repeated,
      target: store,
    }),
  ).resolves.toMatchObject({ status: "noop" });
  expect(store.configurationSyncBuildRequests).toEqual([1]);

  const stale = await prepareConfigurationSynchronization({ models: config.content, state: store });
  store.setStoredModelStates([
    ...store.storedModelStates(),
    {
      draftSnapshotCount: 0,
      entryCount: 0,
      key: "stale",
      kind: "collection",
      projectionHash: "projection-stale",
      publishedSnapshotCount: 0,
      structureHash: "structure-stale",
      version: 1,
    },
  ]);
  await expect(
    applyPreparedConfigurationSynchronization({
      clock,
      ids,
      models: config.content,
      prepared: stale,
      target: store,
    }),
  ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
});

test("applies explicit in-memory renames and safe removals without inferring replacements", async () => {
  const store = new InMemoryContentStore();
  const posts = {
    fields: {},
    key: "posts",
    kind: "collection",
    projectionHash: "projection-posts",
    route: "/blog/:slug",
    structureHash: "structure-posts",
    version: 1,
  };
  store.setStoredModelStates([
    {
      draftSnapshotCount: 0,
      entryCount: 0,
      key: "posts",
      kind: "collection",
      projectionHash: "projection-posts",
      publishedSnapshotCount: 0,
      structureHash: "structure-posts",
      version: 1,
    },
  ]);
  const articles = { ...posts, key: "articles", renamedFrom: "posts" };
  const clock = new DeterministicClock(unixMilliseconds(10));
  const ids = new DeterministicIdGenerator("rename");
  const rename = await prepareConfigurationSynchronization({ models: [articles], state: store });
  await applyPreparedConfigurationSynchronization({
    clock,
    ids,
    models: [articles],
    prepared: rename,
    target: store,
  });
  expect(store.storedModelStates()).toMatchObject([{ key: "articles" }]);

  const removal = await prepareConfigurationSynchronization({ models: [], state: store });
  await applyPreparedConfigurationSynchronization({
    clock,
    ids,
    models: [],
    prepared: removal,
    target: store,
  });
  expect(store.storedModelStates()).toEqual([]);
});

test("enforces singleton, revision, route, and immutable-publication boundaries atomically", async () => {
  const store = new InMemoryContentStore();
  const posts = { key: contentModelKey("posts"), kind: "collection", route: "/blog/:slug" };
  const page = { key: contentModelKey("home"), kind: "page", path: "/" };
  await store.create({ entry: entry({ id: "page-a", model: page }) });
  await expect(store.create({ entry: entry({ id: "page-b", model: page }) })).rejects.toMatchObject(
    { code: "CONTENT_MODEL_CARDINALITY_CONFLICT" },
  );

  await store.create({ entry: entry({ id: "post-a", model: posts }) });
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
  expect((await store.exportBuildContent()).entries[0].entry.published.title).toBe("Published");

  await store.create({ entry: entry({ id: "post-b", model: posts }) });
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
  expect((await store.exportBuildContent()).entries).toHaveLength(1);
});

test("marks only unreferenced active media for independent deletion", async () => {
  const store = new InMemoryContentStore();
  store.registerMedia({
    createdAt: unixMilliseconds(1),
    createdBy: admin.id,
    filename: "unused.png",
    id: mediaId("unused-media"),
    mimeType: "image/png",
    size: 1,
    status: "active",
    storageKey: "media/unused",
    updatedAt: unixMilliseconds(1),
  });
  await expect(
    store.markForDeletion({
      mediaId: mediaId("unused-media"),
      requestedAt: unixMilliseconds(2),
      requestedBy: admin,
    }),
  ).resolves.toMatchObject({
    media: { status: "deleting", updatedAt: 2 },
    status: "deleting",
  });
  expect(store.mediaDeletionRequests).toEqual(["unused-media"]);
});

test("rebuilds complete-draft media projections instead of retaining stale references", async () => {
  const config = await defineConfig({
    blocks: [],
    content: [
      definePage({
        blocks: [],
        fields: { image: field.media() },
        key: "home",
        path: "/",
        version: 1,
      }),
    ],
  });
  const store = new InMemoryContentStore();
  store.registerMedia({
    createdAt: unixMilliseconds(1),
    createdBy: editor.id,
    filename: "attached.png",
    id: mediaId("attached-media"),
    mimeType: "image/png",
    size: 1,
    status: "active",
    storageKey: "media/attached-media",
    updatedAt: unixMilliseconds(1),
  });
  const useCases = new ContentUseCases({
    clock: new DeterministicClock(unixMilliseconds(2)),
    config: config.runtime,
    content: store,
    idGenerator: new DeterministicIdGenerator("content"),
    media: store,
  });
  const created = await useCases.create({
    actor: editor,
    blocks: [],
    fields: { image: "attached-media" },
    modelKey: "home",
    title: "Home",
  });
  expect(store.mediaReferences(created.draft.id)).toEqual([
    { fieldPath: "image", mediaId: "attached-media", sourceKey: "$fields" },
  ]);
  const saved = await useCases.save({
    actor: editor,
    blocks: [],
    entryId: created.id,
    expectedRevision: 1,
    fields: {},
    title: "Home",
  });
  expect(store.mediaReferences(saved.draft.id)).toEqual([]);
  await expect(
    store.markForDeletion({
      mediaId: mediaId("attached-media"),
      requestedAt: unixMilliseconds(3),
      requestedBy: editor,
    }),
  ).resolves.toMatchObject({ status: "deleting" });
});

test("replays matching idempotent publications without changing public content", async () => {
  const store = new InMemoryContentStore();
  const model = { key: contentModelKey("posts"), kind: "collection", route: "/blog/:slug" };
  await store.create({ entry: entry({ id: "post-idempotent", model, slug: "first" }) });
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
  const version = (await store.exportBuildContent()).version;
  const replay = await store.publish(input);

  expect(first.outcome).toBe("published");
  expect(replay).toMatchObject({ outcome: "replayed", status: "published" });
  expect(replay.entry).not.toBe(first.entry);
  expect((await store.exportBuildContent()).version).toBe(version);
  await expect(
    store.publish({
      ...input,
      idempotency: {
        ...input.idempotency,
        fingerprint: publicationRequestFingerprint("sha256:other"),
      },
    }),
  ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
  expect((await store.exportBuildContent()).version).toBe(version);
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
  const receivedCreateInputs = [];
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
        return (await Promise.all(ids.map((id) => this.loadMedia(id)))).filter(Boolean);
      },
      async loadMedia(id) {
        return id === "media-1"
          ? {
              createdAt: unixMilliseconds(1),
              createdBy: admin.id,
              filename: "cover.png",
              id,
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
                id,
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
  expect(receivedCreateInputs[0].mediaReferences).toEqual([
    { fieldPath: "image", mediaId: "media-1", sourceKey: "hero" },
  ]);
  const viewer = { id: actorId("viewer"), role: "viewer" };
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
      blocks: [{ ...draft.blocks[0], data: { image: "missing" } }],
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
      blocks: [...draft.blocks, { ...draft.blocks[0], key: blockKey("second"), position: 1000 }],
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
      blocks: [{ ...draft.blocks[0], data: { image: "inactive" } }],
    }),
  ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
  expect((await useCases.loadDraft({ actor: admin, entryId: created.id })).revision).toBe(1);

  const incomplete = await useCases.create({
    actor: editor,
    modelKey: "posts",
    ...draft,
    blocks: [{ ...draft.blocks[0], data: {} }],
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
  expect((await useCases.loadPublished({ actor: admin, entryId: created.id })).title).toBe("Home");
  await expect(useCases.delete({ actor: editor, entryId: created.id })).rejects.toMatchObject({
    code: "AUTHORIZATION_DENIED",
  });

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
      async loadMediaMany(ids) {
        return (await Promise.all(ids.map((id) => this.loadMedia(id)))).filter(Boolean);
      },
      async loadMedia() {
        return {
          createdAt: unixMilliseconds(1),
          createdBy: admin.id,
          filename: "cover.png",
          id: "media-1",
          mimeType: "image/png",
          size: 1,
          status: "active",
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
  expect((await rejected.loadPublished({ actor: admin, entryId: entry.id })).title).toBe("First");

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
  expect((await unavailable.loadPublished({ actor: admin, entryId: entry.id })).title).toBe(
    "Second",
  );
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
    media: { loadMedia: async () => null },
  });
  const create = (title, slug, fields = {}) =>
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

  const viewer = { id: actorId("viewer"), role: "viewer" };
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
  expect(publishedSummary.listValues).toEqual({ rank: 2 });
  expect(publishedSummary.publishedAt).toBeTypeOf("number");
  expect(changedSummary.publishedSnapshotId).toBeDefined();
  expect(draftSummary.id).toBe(draftOnly.id);

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
    after: first.nextCursor,
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
    useCases.list({ actor: viewer, after: first.nextCursor, limit: 1, modelKey: "posts" }),
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
    media: { loadMedia: async () => null },
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
  expect(received).toEqual({ limit: 5, listFields: [], modelKey: "posts", sort: "-updatedAt" });

  const describe = (id) => useCases.describeActor({ actor: admin, actorId: actorId(id) });
  await expect(describe("editor")).resolves.toEqual({ displayName: "Editor Name", id: "editor" });
  await expect(describe("system:content-sync")).resolves.toEqual({
    displayName: "System",
    id: "system:content-sync",
  });
  await expect(describe("gone")).resolves.toEqual({ displayName: "Unknown user", id: "gone" });
});

const postsRoute = { key: contentModelKey("posts"), kind: "collection", route: "/blog/:slug" };

function mediaUsageEntry(id, { blocks = [], fields = {}, updatedAt }) {
  const entryId = contentEntryId(id);
  return createContentEntry({
    id: entryId,
    model: postsRoute,
    draft: {
      blocks,
      createdAt: unixMilliseconds(updatedAt),
      entryId,
      fields,
      id: contentSnapshotId(`${id}-draft`),
      revision: 1,
      slug: id,
      state: "draft",
      title: `Title ${id}`,
      updatedAt: unixMilliseconds(updatedAt),
      updatedBy: editor,
    },
  });
}

function imageBlock(key, type, position, image) {
  return { data: { image }, key: blockKey(key), position, schemaVersion: 1, type };
}

function seedMediaCatalog(store) {
  store.setActorDisplayNames({ editor: "Ada" });
  for (const [id, filename, mimeType, size, createdAt, createdBy] of [
    ["m-a", "Cover.png", "image/png", 30, 10, "editor"],
    ["m-b", "cover-2.jpg", "image/jpeg", 10, 11, "gone"],
    ["m-c", "100% _off_ 'deal'.webp", "image/webp", 20, 12, "system:content-sync"],
    ["m-d", "banner.png", "image/png", 20, 12, "editor"],
    ["m-e", "cover.png", "image/png", 30, 10, "editor"],
  ]) {
    store.registerMedia({
      createdAt: unixMilliseconds(createdAt),
      createdBy: actorId(createdBy),
      filename,
      height: 2,
      id: mediaId(id),
      mimeType,
      size,
      status: "active",
      storageKey: `media/${id}`,
      updatedAt: unixMilliseconds(createdAt),
      width: 3,
    });
  }
}

test("mirrors Node media search, type filter, sorts, and query-bound cursors in memory", async () => {
  const store = new InMemoryContentStore();
  seedMediaCatalog(store);
  const ids = async (input) =>
    (await store.listMedia({ limit: 100, sort: "-createdAt", ...input })).items.map(
      (item) => item.media.id,
    );
  const all = await store.listMedia({ limit: 100, sort: "-createdAt" });
  expect(all.items.find((item) => item.media.id === "m-a")).toMatchObject({
    createdBy: { displayName: "Ada", id: "editor" },
    usageCount: 0,
  });
  expect(all.items.find((item) => item.media.id === "m-b").createdBy.displayName).toBe(
    "Unknown user",
  );
  expect(all.items.find((item) => item.media.id === "m-c").createdBy.displayName).toBe("System");
  expect(await ids({ q: "cover" })).toEqual(["m-b", "m-e", "m-a"]);
  expect(await ids({ q: "COVER", type: "image/png" })).toEqual(["m-e", "m-a"]);
  expect(await ids({ q: "%" })).toEqual(["m-c"]);
  expect(await ids({ q: "o_f" })).toEqual([]);
  const expectedOrders = {
    "-createdAt": ["m-d", "m-c", "m-b", "m-e", "m-a"],
    "-filename": ["m-e", "m-a", "m-b", "m-d", "m-c"],
    "-size": ["m-e", "m-a", "m-d", "m-c", "m-b"],
    createdAt: ["m-a", "m-e", "m-b", "m-c", "m-d"],
    filename: ["m-c", "m-d", "m-b", "m-a", "m-e"],
    size: ["m-b", "m-c", "m-d", "m-a", "m-e"],
  };
  for (const [sort, expected] of Object.entries(expectedOrders)) {
    const paged = [];
    let after;
    do {
      const page = await store.listMedia({ limit: 1, sort, ...(after ? { after } : {}) });
      paged.push(...page.items.map((item) => item.media.id));
      after = page.nextCursor;
    } while (after !== undefined);
    expect(paged).toEqual(expected);
  }
  const first = await store.listMedia({ limit: 1, sort: "filename" });
  for (const mismatch of [{ sort: "-createdAt" }, { sort: "filename", type: "image/png" }]) {
    await expect(
      store.listMedia({ limit: 1, after: first.nextCursor, ...mismatch }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
  }
});

test("derives in-memory media usage and in-use refusals from current snapshots", async () => {
  const store = new InMemoryContentStore();
  seedMediaCatalog(store);
  const media = new MediaUseCases({
    clock: new DeterministicClock(unixMilliseconds(60)),
    idGenerator: new DeterministicIdGenerator("media"),
    imageInspector: { inspect: async () => ({ height: 1, width: 1 }) },
    logger: { error() {} },
    media: store,
    storage: new InMemoryObjectStorage(),
  });
  const entry = mediaUsageEntry("e-one", {
    blocks: [
      imageBlock("hero-1", "hero", 1000, "m-a"),
      imageBlock("gallery-1", "gallery", 2000, "m-a"),
    ],
    fields: { cover: "m-a" },
    updatedAt: 20,
  });
  await store.create({
    entry,
    mediaReferences: [
      { fieldPath: "cover", mediaId: mediaId("m-a"), sourceKey: "$fields" },
      { fieldPath: "image", mediaId: mediaId("m-a"), sourceKey: blockKey("hero-1") },
      { fieldPath: "image", mediaId: mediaId("m-a"), sourceKey: blockKey("gallery-1") },
    ],
  });
  await store.publish({
    entryId: entry.id,
    expectedRevision: 1,
    publishedAt: unixMilliseconds(30),
    publishedBy: editor,
    publishedSnapshotId: contentSnapshotId("e-one-published"),
  });
  await store.saveCompleteDraft({
    entryId: entry.id,
    mutation: {
      blocks: [imageBlock("gallery-1", "carousel", 1000, "m-a")],
      expectedRevision: 1,
      fields: { cover: "m-d" },
      mediaReferences: [
        { fieldPath: "cover", mediaId: mediaId("m-d"), sourceKey: "$fields" },
        { fieldPath: "image", mediaId: mediaId("m-a"), sourceKey: blockKey("gallery-1") },
      ],
      slug: "e-one",
      title: "Title e-one",
      updatedAt: unixMilliseconds(40),
      updatedBy: editor,
    },
  });
  await store.create({
    entry: mediaUsageEntry("e-two", { fields: { cover: "m-a" }, updatedAt: 50 }),
    mediaReferences: [{ fieldPath: "cover", mediaId: mediaId("m-a"), sourceKey: "$fields" }],
  });

  const viewer = { id: actorId("viewer"), role: "viewer" };
  const detail = await media.get({ actor: viewer, mediaId: mediaId("m-a") });
  expect(detail).toMatchObject({ createdBy: { displayName: "Ada" }, usageCount: 2 });
  expect(detail.usage).toEqual([
    {
      entryId: "e-two",
      locations: [{ field: "cover", source: "field", states: ["draft"] }],
      modelKey: "posts",
      slug: "e-two",
      status: "draft",
      title: "Title e-two",
    },
    {
      entryId: "e-one",
      locations: [
        { field: "cover", source: "field", states: ["published"] },
        {
          blockKey: "gallery-1",
          blockType: "carousel",
          field: "image",
          source: "block",
          states: ["draft", "published"],
        },
        {
          blockKey: "hero-1",
          blockType: "hero",
          field: "image",
          source: "block",
          states: ["published"],
        },
      ],
      modelKey: "posts",
      slug: "e-one",
      status: "changed",
      title: "Title e-one",
    },
  ]);
  expect(
    (await store.loadMediaUsage({ limit: 1, mediaId: mediaId("m-a") })).map((e) => e.entryId),
  ).toEqual(["e-two"]);
  await expect(store.loadMediaUsage({ limit: 51, mediaId: mediaId("m-a") })).rejects.toMatchObject({
    code: "CONTENT_INVALID_STATE",
  });

  await expect(
    media.requestDeletion({ actor: editor, mediaId: mediaId("m-d") }),
  ).rejects.toMatchObject({ code: "MEDIA_IN_USE" });
  expect(store.mediaDeletionRequests).toEqual([]);
  // Removing the draft reference and republishing clears usage; deletion is then accepted.
  await store.saveCompleteDraft({
    entryId: entry.id,
    mutation: {
      blocks: [imageBlock("gallery-1", "carousel", 1000, "m-a")],
      expectedRevision: 2,
      fields: {},
      mediaReferences: [
        { fieldPath: "image", mediaId: mediaId("m-a"), sourceKey: blockKey("gallery-1") },
      ],
      slug: "e-one",
      title: "Title e-one",
      updatedAt: unixMilliseconds(55),
      updatedBy: editor,
    },
  });
  expect((await media.get({ actor: viewer, mediaId: mediaId("m-d") })).usageCount).toBe(0);
  await expect(
    media.requestDeletion({ actor: editor, mediaId: mediaId("m-d") }),
  ).resolves.toMatchObject({ status: "deleting", usageCount: 0 });
  await store.publish({
    entryId: entry.id,
    expectedRevision: 3,
    publishedAt: unixMilliseconds(56),
    publishedBy: editor,
    publishedSnapshotId: contentSnapshotId("e-one-published-2"),
  });
  const afterRepublish = await media.get({ actor: viewer, mediaId: mediaId("m-a") });
  expect(afterRepublish.usage.find((usage) => usage.entryId === "e-one").locations).toEqual([
    {
      blockKey: "gallery-1",
      blockType: "carousel",
      field: "image",
      source: "block",
      states: ["draft", "published"],
    },
  ]);
});

test("content rejects 201 reference locations before bulk metadata reads or writes", async () => {
  const config = await defineConfig({
    blocks: [
      defineBlock({
        type: "asset",
        version: 1,
        fields: { first: field.media(), second: field.media() },
      }),
    ],
    content: [
      defineCollection({ key: "posts", version: 1, route: "/blog/:slug", blocks: ["asset"] }),
    ],
  });
  const store = new InMemoryContentStore();
  let reads = 0;
  let writes = 0;
  const create = store.create.bind(store);
  store.create = async (input) => {
    writes++;
    return create(input);
  };
  const useCases = new ContentUseCases({
    clock: new DeterministicClock(unixMilliseconds(1)),
    config: config.runtime,
    content: store,
    idGenerator: new DeterministicIdGenerator("refs"),
    media: {
      loadMedia: async () => null,
      loadMediaMany: async () => {
        reads++;
        return [];
      },
    },
  });
  const blocks = Array.from({ length: 101 }, (_, index) => ({
    key: `block-${index}`,
    type: "asset",
    schemaVersion: 1,
    position: (index + 1) * 1000,
    data: index === 100 ? { first: "same-id" } : { first: "same-id", second: "same-id" },
  }));
  await expect(
    useCases.create({
      actor: editor,
      modelKey: "posts",
      slug: "oversize-refs",
      title: "Too many references",
      fields: {},
      blocks,
    }),
  ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
  expect(reads).toBe(0);
  expect(writes).toBe(0);
  expect(await store.loadPublic("/blog/oversize-refs")).toBeNull();
});
