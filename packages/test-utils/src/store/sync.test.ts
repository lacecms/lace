import type { NormalizedContentModel, CollectionListOptions } from "@lacecms/config";
import type { PreparedConfigurationSynchronization } from "@lacecms/application";
import { present } from "../test-support/fixtures.js";
import { expect, test } from "vitest";
import { DeterministicClock, DeterministicIdGenerator, InMemoryContentStore } from "../index.js";
import {
  contentEntryId,
  contentModelKey,
  contentSnapshotId,
  mediaId,
  unixMilliseconds,
} from "@lacecms/domain";
import {
  applyPreparedConfigurationSynchronization,
  prepareConfigurationSynchronization,
} from "@lacecms/application";

import { defineCollection, defineConfig, definePage } from "@lacecms/config";
import { field } from "@lacecms/content";
import { admin, editor, entry, seoConfig, seoFixture, seoPost } from "../test-support/fixtures.js";

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
      key: contentModelKey("stale"),
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
  ).rejects.toMatchObject({ code: "CONFIGURATION_SYNC_STALE" });
});

test("applies explicit in-memory renames and safe removals without inferring replacements", async () => {
  const store = new InMemoryContentStore();
  const normalized = await defineConfig({
    content: [defineCollection({ key: "posts", route: "/blog/:slug", version: 1, fields: {} })],
  });
  const posts = {
    ...present(normalized.runtime.content[0]),
    projectionHash: "projection-posts",
    structureHash: "structure-posts",
  };
  store.setStoredModelStates([
    {
      draftSnapshotCount: 0,
      entryCount: 0,
      key: contentModelKey("posts"),
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

test("synchronization enables, refuses, prunes and remaps SEO", async () => {
  const { store, sync, useCases } = await seoFixture();
  const first = await useCases.create({
    actor: editor,
    modelKey: "posts",
    ...seoPost("A", "a", { image: "media-1", title: "A" }),
  });
  await useCases.publish({ actor: admin, entryId: first.id, expectedRevision: 1 });
  await useCases.create({
    actor: editor,
    modelKey: "posts",
    ...seoPost("B", "b", { description: "B" }),
  });
  await useCases.create({ actor: editor, modelKey: "notes", ...seoPost("N", "n") });

  // Enabling SEO on a populated model is compatible.
  const enabled = await sync(
    (await seoConfig({ notes: { seo: true, version: 2 } })).runtime.content,
  );
  expect(enabled.plan.diagnostics).toEqual([]);
  const enabledOperation = present(
    enabled.plan.operations.find((operation) => operation.model.key === "notes"),
  );
  expect("evolution" in enabledOperation).toBe(true);
  if (!("evolution" in enabledOperation)) throw new Error("Expected evolution operation");
  expect(present(enabledOperation.evolution).changes).toMatchObject([
    { class: "compatible", kind: "seo-enabled", target: "seo" },
  ]);

  // A mapping-only change is projection-only and advances public state.
  const version = await store.publishedContentVersion();
  const remapped = await sync(
    (await seoConfig({ notes: { seo: true, version: 2 }, posts: { seo: true } })).runtime.content,
  );
  expect(remapped.plan.operations).toMatchObject([
    { action: "label-update", model: { key: "posts" } },
  ]);
  expect(await store.publishedContentVersion()).toBe(version + 1);

  // Disabling SEO with stored values needs the hint.
  const refused = await sync(
    (await seoConfig({ notes: { seo: true, version: 2 }, posts: { seo: false, version: 2 } }))
      .runtime.content,
  );
  expect(refused.plan.isValid).toBe(false);
  expect(refused.plan.diagnostics).toMatchObject([
    { affectedCount: 3, code: "SEO_REMOVAL_HAS_DATA", modelKey: "posts" },
  ]);
  expect(present(refused.plan.diagnostics[0]).message).toMatch(/draft=2, published=1/u);
  expect(present(await useCases.load({ actor: admin, entryId: first.id })).draft.seo).toEqual({
    image: "media-1",
    title: "A",
  });

  // The hint prunes every SEO group and SEO media reference of the model.
  const before = await store.publishedContentVersion();
  const pruned = await sync(
    (
      await seoConfig({
        notes: { seo: true, version: 2 },
        posts: { removedSeo: true, seo: false, version: 2 },
      })
    ).runtime.content,
  );
  expect(pruned.plan.isValid).toBe(true);
  const after = present(await useCases.load({ actor: admin, entryId: first.id }));
  expect(after.draft).not.toHaveProperty("seo");
  expect(after.published).not.toHaveProperty("seo");
  expect(after.draft.revision).toBe(1);
  expect(store.mediaReferences(after.draft.id)).toEqual([]);
  expect(store.mediaReferences(present(after.published).id)).toEqual([]);
  expect(await store.loadMediaUsage({ limit: 50, mediaId: mediaId("media-1") })).toEqual([]);
  expect(await store.publishedContentVersion()).toBe(before + 1);

  // Disabling without data needs no hint, and a leftover hint is inert.
  const disabled = await sync(
    (
      await seoConfig({
        notes: { version: 3 },
        posts: { removedSeo: true, seo: false, version: 2 },
      })
    ).runtime.content,
  );
  expect(disabled.plan).toMatchObject({ diagnostics: [], isValid: true });
});

test("memory nested synchronization preserves audits and rebuilds media usage", async () => {
  const store = new InMemoryContentStore();
  const configuration = (version: number) =>
    defineConfig({
      blocks: [],
      content: [
        defineCollection({
          key: "posts",
          route: "/blog/:slug",
          version,
          blocks: [],
          fields: {
            profile: field.group({
              fields:
                version === 1
                  ? { image: field.media() }
                  : {
                      photo: field.media({ renamedFrom: "image" }),
                      caption: field.text({ defaultValue: "Caption" }),
                    },
            }),
          },
        }),
      ],
    });
  const sync = async (config: Awaited<ReturnType<typeof configuration>>) =>
    applyPreparedConfigurationSynchronization({
      clock: new DeterministicClock(unixMilliseconds(10)),
      ids: new DeterministicIdGenerator("nested"),
      models: config.runtime.content,
      prepared: await prepareConfigurationSynchronization({
        models: config.runtime.content,
        state: store,
      }),
      target: store,
    });
  await sync(await configuration(1));
  store.registerMedia({
    createdAt: unixMilliseconds(1),
    createdBy: editor.id,
    filename: "image.png",
    id: mediaId("m"),
    mimeType: "image/png",
    size: 1,
    status: "active",
    storageKey: "m",
    tags: [],
    updatedAt: unixMilliseconds(1),
  });
  const initial = entry({
    id: "nested",
    model: { key: contentModelKey("posts"), kind: "collection", route: "/blog/:slug" },
    slug: "nested",
  });
  await store.create({
    entry: {
      ...initial,
      draft: { ...initial.draft, blocks: [], fields: { profile: { image: "m" } } },
    },
    mediaReferences: [{ sourceKey: "$fields", fieldPath: "/profile/image", mediaId: mediaId("m") }],
  });
  await store.publish({
    entryId: contentEntryId("nested"),
    expectedRevision: 1,
    publishedAt: unixMilliseconds(2),
    publishedBy: admin,
    publishedSnapshotId: contentSnapshotId("nested-published"),
  });
  const before = present(await store.load({ entryId: contentEntryId("nested") }));
  const next = await configuration(2);
  expect((await sync(next)).status).toBe("applied");
  const after = present(await store.load({ entryId: contentEntryId("nested") }));
  for (const state of ["draft", "published"] as const) {
    expect(present(after[state]).fields).toEqual({ profile: { photo: "m", caption: "Caption" } });
    expect(present(after[state]).revision).toBe(present(before[state]).revision);
    expect(present(after[state]).updatedAt).toBe(present(before[state]).updatedAt);
    expect(present(after[state]).updatedBy).toEqual(present(before[state]).updatedBy);
  }
  expect(
    present((await store.loadMediaUsage({ mediaId: mediaId("m"), limit: 10 }))[0]).locations,
  ).toContainEqual({ source: "field", field: "/profile/photo", states: ["draft", "published"] });
  expect((await sync(next)).status).toBe("noop");
});

test("fake sync retains populated singleton content when guidance changes", async () => {
  const store = new InMemoryContentStore();
  const make = async (placeholder: string | undefined) =>
    (
      await defineConfig({
        content: [
          definePage({
            key: "home",
            path: "/",
            version: 1,
            fields: {
              nested: field.group({
                defaultValue: { title: "Stored" },
                fields: {
                  title: field.text(placeholder === undefined ? {} : { placeholder }),
                },
              }),
            },
          }),
        ],
      })
    ).runtime.content;
  const clock = new DeterministicClock(unixMilliseconds(10));
  const ids = new DeterministicIdGenerator("guidance");
  let previous;
  for (const placeholder of [undefined, "Title", "New title", undefined]) {
    const models = await make(placeholder);
    const prepared = await prepareConfigurationSynchronization({ models, state: store });
    await applyPreparedConfigurationSynchronization({
      clock,
      ids,
      models,
      prepared,
      target: store,
    });
    const item = (
      await store.list({
        limit: 1,
        listFields: [],
        modelKey: contentModelKey("home"),
        sort: "-updatedAt",
      })
    ).items[0];
    const loaded = await store.load({ entryId: present(item).id });
    if (previous) expect(loaded).toEqual(previous);
    previous = loaded;
  }
});

test("memory query-only sync records trusted public identity and remains idempotent without builds", async () => {
  const store = new InMemoryContentStore();
  const clock = new DeterministicClock(unixMilliseconds(10));
  const ids = new DeterministicIdGenerator("query-sync");
  const make = async (listOptions?: CollectionListOptions) =>
    (
      await defineConfig({
        content: [
          defineCollection({
            key: "posts",
            route: "/:slug",
            version: 1,
            fields: { summary: field.text() },
            ...(listOptions === undefined ? {} : { listOptions }),
          }),
        ],
      })
    ).runtime.content;
  const sync = async (models: readonly NormalizedContentModel[]) =>
    applyPreparedConfigurationSynchronization({
      clock,
      ids,
      models,
      target: store,
      prepared: await prepareConfigurationSynchronization({ models, state: store }),
    });
  await sync(await make());
  const version = await store.publishedContentVersion();
  const builds = [...store.configurationSyncBuildRequests];
  for (const listOptions of [
    { searchableFields: ["summary"] },
    { sortableFields: ["summary"] },
    undefined,
  ]) {
    const models = await make(listOptions);
    expect((await sync(models)).status).toBe("applied");
    expect(store.storedModelStates()[0]).toMatchObject({
      projectionHash: present(models[0]).projectionHash,
      publicProjectionHash: present(models[0]).publicProjectionHash,
      publicProjectionSourceHash: present(models[0]).projectionHash,
    });
    expect((await sync(models)).status).toBe("noop");
    expect(await store.publishedContentVersion()).toBe(version);
    expect(store.configurationSyncBuildRequests).toEqual(builds);
  }
});

test.each(["publicProjectionHash", "publicProjectionSourceHash"] as const)(
  "memory sync guards a concurrent %s change even when the derived plan is unchanged",
  async (key) => {
    const store = new InMemoryContentStore();
    const models = (
      await defineConfig({
        content: [
          defineCollection({
            key: "posts",
            route: "/:slug",
            version: 1,
          }),
        ],
      })
    ).runtime.content;
    const clock = new DeterministicClock(unixMilliseconds(10));
    const ids = new DeterministicIdGenerator("public-baseline");
    const apply = (prepared: PreparedConfigurationSynchronization) =>
      applyPreparedConfigurationSynchronization({
        clock,
        ids,
        models,
        prepared,
        target: store,
      });
    await apply(await prepareConfigurationSynchronization({ models, state: store }));
    const {
      publicProjectionHash: _public,
      publicProjectionSourceHash: _source,
      ...legacy
    } = present(store.storedModelStates()[0]);
    store.setStoredModelStates([legacy]);
    const prepared = await prepareConfigurationSynchronization({ models, state: store });
    expect(prepared.plan.operations).toMatchObject([{ action: "record-baseline" }]);
    store.setStoredModelStates([{ ...legacy, [key]: "untrusted-concurrent-value" }]);
    const concurrent = await prepareConfigurationSynchronization({ models, state: store });
    expect(concurrent.plan).toEqual(prepared.plan);
    const version = await store.publishedContentVersion();
    await expect(apply(prepared)).rejects.toMatchObject({ code: "CONFIGURATION_SYNC_STALE" });
    expect(await store.publishedContentVersion()).toBe(version);
    expect(present(store.storedModelStates()[0])[key]).toBe("untrusted-concurrent-value");
  },
);
