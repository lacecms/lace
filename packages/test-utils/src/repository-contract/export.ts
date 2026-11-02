import {
  applyPreparedConfigurationSynchronization,
  ContentUseCases,
  NODE_LIST_QUERY_LIMITS,
  prepareConfigurationSynchronization,
  resolveCollectionQuery,
} from "@lacecms/application";

import { readAllBuildContentPages } from "../build-export.js";
import { defineCollection, defineConfig, defineGlobal, definePage } from "@lacecms/config";
import type { CollectionModelInput } from "@lacecms/config";
import { builtInBlocks, defineBlock, field } from "@lacecms/content";
import type { BlockDefinition, JsonObject } from "@lacecms/content";
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
import type { MediaMetadata } from "@lacecms/domain";

import {
  type ContractRepository,
  type ContractSql,
  type RepositoryContractCase,
  editor,
  admin,
  resolveRoute,
  noModels,
  sequence,
  base64Url,
  count,
  seedModels,
  seedMedia,
  entry,
  heroBlock,
  save,
  publish,
  syncPage,
  syncCollection,
  syncGlobal,
  syncResolver,
  applySync,
  registerContract,
} from "./shared.js";
import { unpublishCommand, seedPublishedLifecycle } from "./lifecycle.js";
import { prepareNotes, syncNotes } from "./sync.js";
import { metadataUpdate, mediaMetadataState, pendingBuilds } from "./media.js";
import { globalEntry, seoReference } from "./globals-seo.js";
import { envelopeBlock, blockReference } from "./envelope.js";
export const cases: RepositoryContractCase[] = [];
const contract = registerContract(cases);
function deliveredMediaIds(items: readonly { readonly media: readonly MediaMetadata[] }[]) {
  return [...new Set(items.flatMap((item) => item.media.map((value) => String(value.id))))].sort();
}

/**
 * A site with routed entries in every path position, a global, SEO and block
 * media, media referenced only by a hidden block, and draft-only content.
 */
async function seedExportSite(repository: ContractRepository, sql: ContractSql): Promise<void> {
  await seedModels(sql, "home", "posts", "settings");
  for (const id of ["media-1", "media-2", "media-3", "media-4", "media-5", "media-6"]) {
    await seedMedia(sql, id);
  }
  const home = entry("home", "home", {
    blocks: [
      heroBlock("home-hero", "media-1"),
      envelopeBlock("home-hidden", "media-5", { hidden: true }, 2000),
    ],
    fields: { title: "Home" },
    updatedAt: 1,
  });
  await repository.create({
    entry: home,
    mediaReferences: [
      blockReference("media-1", "home-hero"),
      blockReference("media-5", "home-hidden"),
    ],
  });
  await repository.publish(publish("home", 1, 2, "home-published"));
  const posts: readonly [string, readonly string[]][] = [
    ["post-d", ["media-2"]],
    ["post-a", ["media-2"]],
    ["post-c", ["media-3"]],
    ["post-b", []],
  ];
  for (const [id, media] of posts) {
    const value = entry(id, "posts", {
      blocks: media.map((image) => heroBlock(`${id}-block`, image)),
      fields: { title: id },
      slug: id,
      updatedAt: 3,
    });
    await repository.create({
      entry:
        id === "post-b"
          ? createContentEntry({
              draft: { ...value.draft, seo: { image: mediaId("media-4"), title: "B" } },
              id: value.id,
              model: value.model,
            })
          : value,
      mediaReferences: [
        ...media.map((image) => blockReference(image, `${id}-block`)),
        ...(id === "post-b" ? [seoReference("media-4")] : []),
      ],
    });
    await repository.publish(publish(id, 1, 4, `${id}-published`));
  }
  await repository.create({
    entry: entry("draft-only", "posts", {
      blocks: [heroBlock("draft-only-block", "media-6")],
      slug: "draft-only",
      updatedAt: 5,
    }),
    mediaReferences: [blockReference("media-6", "draft-only-block")],
  });
  await repository.create({
    entry: globalEntry("settings", 6, "media-1"),
    mediaReferences: [
      { fieldPath: "image", mediaId: mediaId("media-1"), sourceKey: "$fields" },
      { fieldPath: "image", mediaId: mediaId("media-1"), sourceKey: blockKey("settings-block") },
    ],
  });
  await repository.publish(publish("settings", 1, 7, "settings-published"));
}

contract(
  "pages the build export by path with first-page globals and per-page media",
  async (runtime, expect) => {
    const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
    await seedExportSite(repository, sql);
    const version = await repository.publishedContentVersion();

    const paged = await readAllBuildContentPages(repository, 2);
    expect(paged.pages.map((page) => page.entries.map((item) => item.path))).toEqual([
      ["/", "/blog/post-a"],
      ["/blog/post-b", "/blog/post-c"],
      ["/blog/post-d"],
    ]);
    expect(paged.pages.map((page) => page.version)).toEqual([version, version, version]);
    expect(paged.pages.map((page) => page.nextCursor === undefined)).toEqual([false, false, true]);
    expect(paged.pages[0]!.globals!.map((item) => item.entry.id)).toEqual(["settings"]);
    for (const page of paged.pages.slice(1)) expect(page).not.toHaveProperty("globals");

    // Each page delivers exactly its own media; hidden-only and draft-only media never appear.
    expect(
      paged.pages.map((page) => deliveredMediaIds([...page.entries, ...(page.globals ?? [])])),
    ).toEqual([["media-1", "media-2"], ["media-3", "media-4"], ["media-2"]]);
    expect(paged.entries[0]!.entry.published!.blocks.map((block) => block.key)).toEqual([
      "home-hero",
    ]);
    expect(paged.entries.map((item) => item.entry.id)).not.toContain("draft-only");
    expect(paged.entries[2]!.entry.published!.seo).toEqual({ image: "media-4", title: "B" });

    // Concatenated pages equal one complete page sequence of the same state.
    const complete = await readAllBuildContentPages(repository);
    expect(complete.pages).toHaveLength(1);
    expect(complete.pages[0]).not.toHaveProperty("nextCursor");
    expect(paged.entries).toEqual(complete.entries);
    expect(paged.globals).toEqual(complete.globals);
    expect(deliveredMediaIds([...paged.entries, ...paged.globals])).toEqual([
      "media-1",
      "media-2",
      "media-3",
      "media-4",
    ]);

    // A site without routed entries still delivers its globals on the only page.
    await repository.unpublish(unpublishCommand("home", "home-published", 10));
    for (const id of ["post-a", "post-b", "post-c", "post-d"]) {
      await repository.unpublish(unpublishCommand(id, `${id}-published`, 11));
    }
    const globalsOnly = await repository.exportBuildContentPage({ limit: 1 });
    expect(globalsOnly.entries).toEqual([]);
    expect(globalsOnly.globals!.map((item) => item.entry.id)).toEqual(["settings"]);
    expect(globalsOnly).not.toHaveProperty("nextCursor");
    expect(deliveredMediaIds(globalsOnly.globals!)).toEqual(["media-1"]);

    for (const limit of [0, 101, 1.5]) {
      await expect(repository.exportBuildContentPage({ limit })).rejects.toMatchObject({
        code: "CONTENT_INVALID_STATE",
      });
    }
  },
);

contract("ends build-export pages at the stored byte budget", async (runtime, expect) => {
  const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
  await seedModels(sql, "posts");
  const text = (length: number) => "x".repeat(length);
  // About 1.8 MB each: two fit the 4 MB budget, a third does not.
  const sizes: readonly [string, number][] = [
    ["p1", 1],
    ["p2", 1],
    ["p3", 1],
    ["p4", 5],
    ["p5", 0],
  ];
  for (const [id, extraBlocks] of sizes) {
    const blocks =
      extraBlocks === 0
        ? []
        : Array.from({ length: extraBlocks }, (_, index) =>
            Object.freeze({
              ...heroBlock(`${id}-big-${index}`, "media-1", text(900_000), "hero", 1000 + index),
            }),
          );
    await repository.create({
      entry: entry(id, "posts", {
        blocks: [
          ...blocks,
          // A hidden block never counts against the budget.
          envelopeBlock(`${id}-hidden`, "media-1", { hidden: true }, 9000),
        ],
        fields: { body: id === "p5" ? "small" : text(900_000) },
        slug: id,
        updatedAt: 1,
      }),
      mediaReferences: [],
    });
    await repository.publish(publish(id, 1, 2, `${id}-published`));
  }
  const paged = await readAllBuildContentPages(repository);
  // p4 alone holds about 5.4 MB and is delivered on its own page.
  expect(paged.pages.map((page) => page.entries.map((item) => item.path))).toEqual([
    ["/blog/p1", "/blog/p2"],
    ["/blog/p3"],
    ["/blog/p4"],
    ["/blog/p5"],
  ]);
  expect(paged.entries[3]!.entry.published!.blocks).toHaveLength(5);
  // The entry limit ends a page before the budget does.
  const limited = await readAllBuildContentPages(repository, 1);
  expect(limited.pages.map((page) => page.entries.length)).toEqual([1, 1, 1, 1, 1]);
});

contract(
  "refuses build-export cursors of a changed published state or another list",
  async (runtime, expect) => {
    const models = [syncPage(), syncCollection(), syncGlobal()];
    const notes = syncCollection({
      key: "notes",
      projectionHash: "projection-notes",
      route: "/notes/:slug",
      structureHash: "structure-notes",
    });
    const { repository, sql } = await runtime.open({
      resolveModel: syncResolver([...models, notes]),
    });
    await applySync(repository, models, 1);
    await seedMedia(sql, "media-1");
    for (const id of ["a", "b", "c", "d", "e", "f"]) {
      await repository.create({
        entry: entry(id, "posts", {
          blocks: [heroBlock(`${id}-block`, "media-1")],
          slug: id,
          updatedAt: 2,
        }),
        mediaReferences: [blockReference("media-1", `${id}-block`)],
      });
      if (id !== "f") await repository.publish(publish(id, 1, 3, `${id}-published`));
    }

    const mutations: readonly [string, () => Promise<unknown>][] = [
      ["publish", () => repository.publish(publish("f", 1, 4, "f-published"))],
      ["unpublish", () => repository.unpublish(unpublishCommand("f", "f-published", 5))],
      [
        "delete",
        () =>
          repository.delete({
            deletedAt: unixMilliseconds(6),
            deletedBy: editor,
            entryId: contentEntryId("e"),
            expectedPublishedSnapshotId: contentSnapshotId("e-published"),
            expectedRevision: 1,
          }),
      ],
      ["media metadata", () => repository.updateMediaMetadata(metadataUpdate("media-1", 1, 7))],
      ["sync", () => applySync(repository, [...models, notes], 8)],
    ];
    for (const [name, mutate] of mutations) {
      const first = await repository.exportBuildContentPage({ limit: 1 });
      expect(first.nextCursor, name).toBeDefined();
      await mutate();
      const actual = await repository.publishedContentVersion();
      expect(actual, name).toBe(first.version + 1);
      const failure = await repository
        .exportBuildContentPage({ after: first.nextCursor!, limit: 1 })
        .then(
          () => undefined,
          (error: unknown) => error,
        );
      expect(failure, name).toMatchObject({
        actualVersion: actual,
        code: "BUILD_EXPORT_VERSION_CHANGED",
        expectedVersion: first.version,
      });
    }

    const current = await repository.exportBuildContentPage({ limit: 1 });
    expect(
      (await repository.exportBuildContentPage({ after: current.nextCursor!, limit: 1 })).entries,
    ).toHaveLength(1);
    const collectionCursor = (
      await repository.listPublic({ limit: 1, modelKey: contentModelKey("posts") })
    ).nextCursor!;
    for (const after of [collectionCursor, "not-a-cursor", base64Url({ kind: "build-export" })]) {
      await expect(
        repository.exportBuildContentPage({ after: after as never, limit: 1 }),
      ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE", name: "BuildExportCursorError" });
    }
  },
);

contract(
  "LIST1 presentation-only sync preserves populated snapshots and stale guards",
  async (runtime, expect) => {
    const make = async (placeholder?: string) =>
      (
        await defineConfig({
          content: [
            defineCollection({
              key: "posts",
              route: "/posts/:slug",
              version: 1,
              fields: {
                nested: field.group({
                  fields: {
                    title: field.select({
                      options: ["a"],
                      ...(placeholder === undefined
                        ? {}
                        : {
                            presentation: {
                              control: "cards",
                              choices: [{ value: "a", label: placeholder }],
                            },
                          }),
                    }),
                  },
                }),
              },
            }),
          ],
        })
      ).runtime.content;
    const original = await make();
    const { repository, sql } = await runtime.open({
      resolveModel: syncResolver(original),
      nextId: sequence("guidance"),
    });
    await applySync(repository, original, 10);
    const created = entry("guidance-entry", "posts", {
      updatedAt: 15,
      slug: "guidance",
      fields: { nested: { title: "a" } },
    });
    await repository.create({ entry: created, mediaReferences: [] });
    await repository.publish(publish("guidance-entry", 1, 20));
    const before = await repository.load({ entryId: created.id });
    for (const [index, placeholder] of ["Title", "New title", undefined].entries()) {
      const models = await make(placeholder);
      expect(models[0]!.structureHash).toBe(original[0]!.structureHash);
      const plan = await prepareConfigurationSynchronization({ models, state: repository });
      expect(plan.plan.operations).toMatchObject([{ action: "label-update" }]);
      await applySync(repository, models, 30 + index, plan);
      expect(await repository.load({ entryId: created.id })).toEqual(before);
    }
    const models = await make("Stale");
    const plan = await prepareConfigurationSynchronization({ models, state: repository });
    await sql.run(
      "update content_models set projection_hash = ? where key = ?",
      "concurrent",
      "posts",
    );
    await expect(applySync(repository, models, 40, plan)).rejects.toMatchObject({
      code: "CONTENT_INVALID_STATE",
    });
    expect(await repository.load({ entryId: created.id })).toEqual(before);
  },
);
contract("LIST1 Gallery v3 migrates draft, published and hidden lists", async (runtime, expect) => {
  const gallery = builtInBlocks.gallery;
  const old = defineBlock({
    type: "gallery",
    version: 3,
    fields: gallery.fields,
    settings: { lightbox: gallery.settings!.lightbox! },
    migrations: { 2: (b) => b, 3: (b) => b },
  });
  const make = (block: BlockDefinition, version: number) =>
    defineConfig({
      blocks: [block],
      content: [
        defineCollection({ key: "posts", route: "/blog/:slug", version, blocks: ["gallery"] }),
      ],
    });
  const before = await make(old, 1),
    after = await make(gallery, 2);
  const { repository, sql } = await runtime.open({
    resolveModel: syncResolver(before.runtime.content),
  });
  await syncNotes(repository, before, 10);
  await seedMedia(sql, "m-1");
  const data = {
    images: [
      { media: "m-1", alt: "One", link: "/one" },
      { media: "m-1", caption: "Two" },
    ],
    title: "Studio",
  };
  const blocks = [false, true].map((hidden, index) => ({
    key: blockKey(`gallery-${index}`),
    type: "gallery",
    schemaVersion: 3,
    position: 1000 + index * 1000,
    hidden,
    anchor: `photos-${index}`,
    className: "wide",
    data,
    settings: { lightbox: true },
  }));
  await repository.create({
    entry: entry("gallery-entry", "posts", {
      blocks,
      slug: "gallery",
      title: "Gallery",
      updatedAt: 20,
    }),
    mediaReferences: blocks.flatMap((b) =>
      [0, 1].map((index) => ({
        sourceKey: b.key,
        fieldPath: `/images/${index}/media`,
        mediaId: mediaId("m-1"),
      })),
    ),
  });
  await repository.publish(publish("gallery-entry", 1, 21, "gallery-published"));
  const stored = (await repository.load({ entryId: contentEntryId("gallery-entry") }))!;
  const state = await sql.all("select * from published_state");
  const prepared = await prepareNotes(repository, after);
  expect(prepared.plan.isValid, JSON.stringify(prepared.plan)).toBe(true);
  await syncNotes(repository, after, 30, prepared);
  const migrated = (await repository.load({ entryId: stored.id }))!;
  // Synchronization stores validated results: drafts materialize every item
  // default, publications keep only the defaults their projection shows.
  const videoDefaults = { aspectRatio: "16:9", playback: "player" };
  for (const [snapshot, extra] of [
    [migrated.draft, videoDefaults],
    [migrated.published!, {}],
  ] as const) {
    expect(snapshot.blocks).toEqual(
      blocks.map((b) => ({
        ...b,
        data: {
          ...data,
          images: data.images.map((item) => ({ kind: "image", ...extra, ...item })),
        },
        schemaVersion: gallery.version,
        settings: { lightbox: true, layoutMode: "grid", layoutWrap: true, layoutPreset: "auto" },
      })),
    );
  }
  const useCases = new ContentUseCases({
    clock: { now: () => unixMilliseconds(35) },
    config: after.runtime,
    content: repository,
    media: repository,
    idGenerator: { next: sequence("layout-validation") },
  });
  for (const [key, value] of [
    ["layoutMode", "invalid"],
    ["layoutWrap", "yes"],
    ["layoutPreset", "invalid"],
  ] as const) {
    await expect(
      useCases.save({
        actor: editor,
        entryId: migrated.id,
        expectedRevision: migrated.draft.revision,
        title: "Gallery",
        slug: "gallery",
        fields: {},
        blocks: migrated.draft.blocks.map((block, index) =>
          index === 0
            ? { ...block, settings: { ...block.settings, layoutMode: "flex-row", [key]: value } }
            : block,
        ),
      }),
    ).rejects.toMatchObject({ issues: [{ path: ["blocks", 0, "settings", key] }] });
    expect(await repository.load({ entryId: migrated.id })).toEqual(migrated);
  }
  expect(migrated.draft.revision).toBe(stored.draft.revision + 1);
  expect(await sql.all("select * from published_state")).not.toEqual(state);
  const stable = await repository.load({ entryId: stored.id });
  await syncNotes(repository, after, 40);
  expect(await repository.load({ entryId: stored.id })).toEqual(stable);
});

contract(
  "SM5D Gallery v4 items migrate as images and mixed galleries publish their projection",
  async (runtime, expect) => {
    const gallery = builtInBlocks.gallery;
    const { kind, videoUrl, videoTitle, playback, aspectRatio, ...v4Fields } =
      gallery.fields.images.item.fields;
    void [kind, videoUrl, videoTitle, playback, aspectRatio];
    const old = defineBlock({
      type: "gallery",
      version: 4,
      fields: {
        ...gallery.fields,
        images: field.list({
          defaultValue: [],
          item: field.group({ fields: v4Fields }),
          itemLabel: "caption",
          maxItems: 50,
          minItems: 1,
        }),
      },
      settings: gallery.settings!,
      migrations: { 2: (b) => b, 3: (b) => b, 4: (b) => b },
    });
    const make = (block: BlockDefinition, version: number) =>
      defineConfig({
        blocks: [block],
        content: [
          defineCollection({ key: "posts", route: "/blog/:slug", version, blocks: ["gallery"] }),
        ],
      });
    const before = await make(old, 1),
      after = await make(gallery, 2);
    const { repository, sql } = await runtime.open({
      resolveModel: syncResolver(before.runtime.content),
    });
    await syncNotes(repository, before, 10);
    await seedMedia(sql, "m-1");
    const data = {
      images: [{ media: "m-1", alt: "Kitchen", caption: "Before", link: "/work/kitchen" }],
    };
    const settings = { lightbox: true, layoutMode: "flex-row", layoutWrap: false };
    const blocks = [false, true].map((hidden, index) => ({
      key: blockKey(`gallery-${index}`),
      type: "gallery",
      schemaVersion: 4,
      position: 1000 + index * 1000,
      hidden,
      data,
      settings,
    }));
    const references = blocks.map((b) => ({
      sourceKey: b.key,
      fieldPath: "/images/0/media",
      mediaId: mediaId("m-1"),
    }));
    await repository.create({
      entry: entry("gallery-v4", "posts", {
        blocks,
        slug: "gallery",
        title: "Gallery",
        updatedAt: 20,
      }),
      mediaReferences: references,
    });
    await repository.publish(publish("gallery-v4", 1, 21, "gallery-v4-published"));
    const stored = (await repository.load({ entryId: contentEntryId("gallery-v4") }))!;
    const prepared = await prepareNotes(repository, after);
    expect(prepared.plan.isValid, JSON.stringify(prepared.plan)).toBe(true);
    await syncNotes(repository, after, 30, prepared);
    const migrated = (await repository.load({ entryId: stored.id }))!;
    // The identity migration keeps stored values; synchronization stores the
    // validated result, so drafts gain every default and publications only
    // the shown `kind`.
    const image = { kind: "image", ...data.images[0] };
    for (const [snapshot, item] of [
      [migrated.draft, { ...image, aspectRatio: "16:9", playback: "player" }],
      [migrated.published!, image],
    ] as const)
      expect(snapshot.blocks).toEqual(
        blocks.map((b) => ({
          ...b,
          data: { images: [item] },
          schemaVersion: 5,
          settings: { ...settings, layoutPreset: "auto" },
        })),
      );
    const mediaRows = () =>
      sql.all(
        "select snapshot_id, source_key, field_path from content_media_references order by snapshot_id, source_key",
      );
    const storedRows = await mediaRows();
    expect(storedRows).toHaveLength(4);

    const useCases = new ContentUseCases({
      clock: { now: () => unixMilliseconds(35) },
      config: after.runtime,
      content: repository,
      media: repository,
      idGenerator: { next: sequence("gallery-video") },
    });
    const video = {
      kind: "video",
      videoUrl: "https://vimeo.com/76979871",
      videoTitle: "Studio tour",
      playback: "ambient",
      aspectRatio: "1:1",
      caption: "Spring",
    };
    const saved = await useCases.save({
      actor: editor,
      entryId: migrated.id,
      expectedRevision: migrated.draft.revision,
      title: "Gallery",
      slug: "gallery",
      fields: {},
      blocks: [
        {
          ...migrated.draft.blocks[0]!,
          data: {
            images: [
              { ...data.images[0], kind: "image", videoUrl: "https://youtu.be/dQw4w9WgXcQ" },
              { ...video, media: "m-1", alt: "Stale" },
            ],
          },
        },
      ],
    });
    expect(saved.draft.blocks[0]!.data).toMatchObject({
      images: [{ videoUrl: "https://youtu.be/dQw4w9WgXcQ" }, { media: "m-1", alt: "Stale" }],
    });
    await useCases.publish({
      actor: admin,
      entryId: migrated.id,
      expectedRevision: saved.draft.revision,
    });
    const published = (await repository.load({ entryId: migrated.id }))!;
    expect(published.draft.blocks[0]!.data).toEqual(saved.draft.blocks[0]!.data);
    expect(published.published!.blocks[0]!.data).toEqual({
      images: [{ kind: "image", ...data.images[0] }, { ...video }],
    });
    expect(
      (await mediaRows()).filter((row) => row.snapshot_id === published.published!.id),
    ).toEqual([
      {
        snapshot_id: published.published!.id,
        source_key: blocks[0]!.key,
        field_path: "/images/0/media",
      },
    ]);
    expect(
      (await repository.loadPublic("/blog/gallery"))!.entry.published!.blocks[0]!.data,
    ).toEqual(published.published!.blocks[0]!.data);
  },
);

contract(
  "SM1 videoEmbed v1 migrates draft, published and hidden blocks",
  async (runtime, expect) => {
    const videoEmbed = builtInBlocks.videoEmbed;
    const old = defineBlock({
      type: "videoEmbed",
      version: 1,
      fields: videoEmbed.fields,
    });
    const make = (block: BlockDefinition, version: number) =>
      defineConfig({
        blocks: [block],
        content: [
          defineCollection({ key: "posts", route: "/blog/:slug", version, blocks: ["videoEmbed"] }),
        ],
      });
    const before = await make(old, 1),
      after = await make(videoEmbed, 2);
    const { repository, sql } = await runtime.open({
      resolveModel: syncResolver(before.runtime.content),
    });
    await syncNotes(repository, before, 10);
    await seedMedia(sql, "m-1");
    const data = {
      url: "https://vimeo.com/123/abc",
      title: "Studio",
      poster: "m-1",
      caption: "Film",
    };
    const blocks = [false, true].map((hidden, index) => ({
      key: blockKey(`videoEmbed-${index}`),
      type: "videoEmbed",
      schemaVersion: 1,
      position: 1000 + index * 1000,
      hidden,
      anchor: `photos-${index}`,
      className: "wide",
      data,
      settings: {},
    }));
    await repository.create({
      entry: entry("videoEmbed-entry", "posts", {
        blocks,
        slug: "video-embed",
        title: "Video embed",
        updatedAt: 20,
      }),
      mediaReferences: blocks.map((b) => ({
        sourceKey: b.key,
        fieldPath: "poster",
        mediaId: mediaId("m-1"),
      })),
    });
    await repository.publish(publish("videoEmbed-entry", 1, 21, "videoEmbed-published"));
    const stored = (await repository.load({ entryId: contentEntryId("videoEmbed-entry") }))!;
    const state = await sql.all("select * from published_state");
    const references = await sql.all(
      "select snapshot_id, source_key, field_path, media_id from content_media_references order by snapshot_id, source_key, field_path",
    );
    const prepared = await prepareNotes(repository, after);
    expect(prepared.plan.isValid, JSON.stringify(prepared.plan)).toBe(true);
    await syncNotes(repository, after, 30, prepared);
    const migrated = (await repository.load({ entryId: stored.id }))!;
    for (const snapshot of [migrated.draft, migrated.published!]) {
      expect(snapshot.blocks).toEqual(
        blocks.map((b) => ({
          ...b,
          schemaVersion: 2,
          settings: { aspectRatio: "16:9", playback: "player" },
        })),
      );
    }
    expect(
      await sql.all(
        "select snapshot_id, source_key, field_path, media_id from content_media_references order by snapshot_id, source_key, field_path",
      ),
    ).toEqual(references);
    const useCases = new ContentUseCases({
      clock: { now: () => unixMilliseconds(35) },
      config: after.runtime,
      content: repository,
      media: repository,
      idGenerator: { next: sequence("video-validation") },
    });
    for (const [key, value] of [
      ["aspectRatio", "21:9"],
      ["playback", "autoplay"],
    ] as const) {
      await expect(
        useCases.save({
          actor: editor,
          entryId: migrated.id,
          expectedRevision: migrated.draft.revision,
          title: "Video embed",
          slug: "video-embed",
          fields: {},
          blocks: migrated.draft.blocks.map((block, index) =>
            index === 0 ? { ...block, settings: { ...block.settings, [key]: value } } : block,
          ),
        }),
      ).rejects.toMatchObject({ issues: [{ path: ["blocks", 0, "settings", key] }] });
      expect(await repository.load({ entryId: migrated.id })).toEqual(migrated);
    }
    expect(migrated.draft.revision).toBe(stored.draft.revision + 1);
    expect(await sql.all("select * from published_state")).not.toEqual(state);
    const stable = await repository.load({ entryId: stored.id });
    await syncNotes(repository, after, 40);
    expect(await repository.load({ entryId: stored.id })).toEqual(stable);
  },
);

contract(
  "LIST2 setting visibility sync preserves content, retains build behavior and validates inactive values",
  async (runtime, expect) => {
    const make = async (values?: readonly string[]) =>
      defineConfig({
        blocks: [
          defineBlock({
            type: "conditional",
            version: 1,
            fields: { image: field.media() },
            settings: {
              mode: field.select({ options: ["a", "b"], required: true, defaultValue: "a" }),
              wrap: field.boolean({ defaultValue: true }),
              preset: field.select({
                options: ["small", "large"],
                required: true,
                defaultValue: "small",
              }),
            },
            ...(values === undefined
              ? {}
              : {
                  settingsVisibility: {
                    wrap: { setting: "mode", values },
                    preset: { setting: "mode", values: ["b"] },
                  },
                }),
          }),
        ],
        content: [
          defineCollection({
            key: "posts",
            route: "/posts/:slug",
            version: 1,
            blocks: ["conditional"],
          }),
        ],
      });
    const original = await make();
    const { repository, sql } = await runtime.open({
      resolveModel: syncResolver(original.runtime.content),
      nextId: sequence("visibility"),
    });
    await syncNotes(repository, original, 10);
    await seedMedia(sql, "m-1");
    const storedBlock = {
      key: blockKey("conditional-block"),
      type: "conditional",
      schemaVersion: 1,
      position: 1000,
      hidden: false,
      data: { image: "m-1" },
      settings: { mode: "a", wrap: false, preset: "large" },
    };
    const created = entry("visibility-entry", "posts", {
      updatedAt: 15,
      slug: "visibility",
      blocks: [storedBlock],
    });
    await repository.create({
      entry: created,
      mediaReferences: [
        { sourceKey: storedBlock.key, fieldPath: "image", mediaId: mediaId("m-1") },
      ],
    });
    await repository.publish(publish("visibility-entry", 1, 20));
    const state = async () => ({
      entry: await repository.load({ entryId: created.id }),
      refs: await sql.all(
        "select * from content_media_references order by snapshot_id, source_key, field_path",
      ),
      publicState: await sql.all("select * from published_state"),
      outbox: await sql.all("select * from outbox_events order by id"),
    });
    const before = await state();
    for (const [index, values] of [["a"], ["b"], undefined].entries()) {
      const config = await make(values);
      expect(config.structureHash).toBe(original.structureHash);
      const prepared = await prepareNotes(repository, config);
      expect(prepared.plan.isValid).toBe(true);
      await syncNotes(repository, config, 30 + index, prepared);
      const after = await state();
      expect(after.entry).toEqual(before.entry);
      expect(after.refs).toEqual(before.refs);
      expect(after.publicState[0]!.version).toBe(
        Number(before.publicState[0]!.version) + index + 1,
      );
      expect(after.outbox).toHaveLength(before.outbox.length);
      expect(after.outbox[0]!.id).toBe(before.outbox[0]!.id);
      const payload = JSON.parse(String(after.outbox[0]!.payload_json));
      expect(payload.reason).toBe("configuration_sync");
      expect(payload.targetVersion).toBe(Number(before.publicState[0]!.version) + index + 1);
    }
    const afterSync = await state();
    const config = await make(["a"]);
    const useCases = new ContentUseCases({
      clock: { now: () => unixMilliseconds(40) },
      config: config.runtime,
      content: repository,
      media: repository,
      idGenerator: { next: sequence("visibility-validation") },
    });
    for (const [key, value] of [
      ["mode", "invalid"],
      ["wrap", "yes"],
      ["preset", "invalid"],
    ] as const) {
      await expect(
        useCases.save({
          actor: editor,
          entryId: created.id,
          expectedRevision: before.entry!.draft.revision,
          title: before.entry!.draft.title,
          slug: "visibility",
          fields: {},
          blocks: [{ ...storedBlock, settings: { ...storedBlock.settings, [key]: value } }],
        }),
      ).rejects.toMatchObject({ issues: [{ path: ["blocks", 0, "settings", key] }] });
      expect(await state()).toEqual(afterSync);
    }
    const stale = await prepareNotes(repository, config);
    await sql.run(
      "update content_models set projection_hash = ? where key = ?",
      "concurrent",
      "posts",
    );
    await expect(syncNotes(repository, config, 50, stale)).rejects.toMatchObject({
      code: "CONTENT_INVALID_STATE",
    });
    expect(await state()).toEqual(afterSync);
  },
);

contract(
  "maintains internal-link projections with no writes for unchanged locations",
  async (runtime, expect) => {
    const definition = defineBlock({
      type: "nestedLinks",
      version: 1,
      fields: { links: field.list({ item: field.group({ fields: { url: field.url() } }) }) },
      settings: { note: field.text({ defaultValue: "entry:ignored" }) },
    });
    const config = await defineConfig({
      blocks: [definition],
      content: [
        defineCollection({
          key: "posts",
          version: 1,
          route: "/blog/:slug",
          blocks: [definition.type],
          fields: { url: field.url() },
        }),
      ],
    });
    const harness = await runtime.open({ resolveModel: resolveRoute });
    const { repository, sql } = harness;
    await seedModels(sql, "posts");
    await repository.create({
      entry: entry("target", "posts", { slug: "target", updatedAt: 1 }),
      mediaReferences: [],
    });
    await repository.publish(publish("target", 1, 2));
    const service = (content = repository) =>
      new ContentUseCases({
        clock: { now: () => unixMilliseconds(10) },
        config: config.runtime,
        content,
        media: repository,
        idGenerator: { next: sequence("links") },
      });
    const useCases = service();
    const created = await useCases.create({
      actor: editor,
      modelKey: "posts",
      title: "Source",
      slug: "source",
      fields: { url: "entry:target" },
      blocks: [
        {
          type: definition.type,
          key: blockKey("source-block"),
          schemaVersion: 1,
          position: 1000,
          hidden: true,
          data: { links: [{ url: "entry:target" }, { url: "/manual" }] },
        },
      ],
    });
    const rows = () =>
      sql.all(
        "select snapshot_id,source_key,area,field_path,target_entry_id,delivered from content_entry_link_references order by snapshot_id,source_key,field_path",
      );
    const graph = async () =>
      (await sql.get<{ revision: number }>(
        "select revision from content_link_state where singleton_key=1",
      ))!.revision;
    expect(await graph()).toBe(1);
    expect(await rows()).toEqual([
      {
        snapshot_id: created.draft.id,
        source_key: "$fields",
        area: "fields",
        field_path: "/url",
        target_entry_id: "target",
        delivered: 1,
      },
      {
        snapshot_id: created.draft.id,
        source_key: "source-block",
        area: "data",
        field_path: "/links/0/url",
        target_entry_id: "target",
        delivered: 0,
      },
    ]);
    await sql.run("create table link_write_probe (kind text)");
    for (const operation of ["insert", "delete", "update"])
      await sql.run(
        `create trigger link_probe_${operation} after ${operation} on content_entry_link_references begin insert into link_write_probe values ('reference'); end`,
      );
    await sql.run(
      "create trigger graph_probe after update on content_link_state begin insert into link_write_probe values ('graph'); end",
    );
    const saved = await useCases.save({
      ...created.draft,
      actor: editor,
      entryId: created.id,
      expectedRevision: 1,
      title: "Renamed source",
    });
    expect(saved.draft.revision).toBe(2);
    expect(await sql.all("select * from link_write_probe")).toEqual([]);
    expect(await graph()).toBe(1);
    const published = await useCases.publish({
      actor: admin,
      entryId: created.id,
      expectedRevision: 2,
    });
    expect(await graph()).toBe(2);
    expect(await rows()).toHaveLength(4);
    const delivered = [
      { sourceKey: "$fields", area: "fields", pointer: "/url", targetId: "target" },
    ];
    expect((await repository.loadPublic("/blog/source"))!.internalLinks).toEqual(delivered);
    expect(
      (await repository.listPublic({ modelKey: contentModelKey("posts"), limit: 20 })).items.find(
        (item) => item.entry.id === created.id,
      )!.internalLinks,
    ).toEqual(delivered);
    const pages = await readAllBuildContentPages(repository, 1);
    expect(pages.entries.find((item) => item.entry.id === created.id)!.internalLinks).toEqual(
      delivered,
    );
    expect(pages.entries.find((item) => item.entry.id === "target")!.internalLinks).toEqual([]);
    const reordered = await useCases.save({
      ...saved.draft,
      actor: editor,
      entryId: created.id,
      expectedRevision: 2,
      blocks: saved.draft.blocks.map((block) => ({
        ...block,
        hidden: false,
        data: { links: [{ url: "/manual" }, { url: "entry:target" }] },
      })),
    });
    expect(await graph()).toBe(3);
    expect(
      (await rows()).find((row) => row.snapshot_id === created.draft.id && row.area === "data"),
    ).toMatchObject({ field_path: "/links/1/url", delivered: 1 });
    expect((await repository.loadPublic("/blog/source"))!.internalLinks).toEqual(delivered);
    const reverted = await useCases.revertDraft({
      actor: editor,
      entryId: created.id,
      expectedRevision: reordered.draft.revision,
    });
    expect(reverted.draft.blocks[0]!.hidden).toBe(true);
    expect(await graph()).toBe(4);
    const duplicate = await useCases.duplicate({ actor: editor, entryId: created.id });
    expect(await graph()).toBe(5);
    expect(
      (await rows())
        .filter((row) => row.snapshot_id === duplicate.draft.id)
        .map((row) => row.source_key),
    ).toEqual(["$fields", duplicate.draft.blocks[0]!.key]);
    await useCases.unpublish({
      actor: admin,
      entryId: created.id,
      expectedPublishedSnapshotId: published.entry.published!.id,
    });
    expect(await graph()).toBe(6);
    expect(
      (await rows()).filter((row) => row.snapshot_id === published.entry.published!.id),
    ).toEqual([]);
    await useCases.delete({
      actor: editor,
      entryId: duplicate.id,
      expectedRevision: duplicate.draft.revision,
    });
    expect(await graph()).toBe(7);
    const before = {
      rows: await rows(),
      graph: await graph(),
      entry: await repository.load({ entryId: created.id }),
    };
    const failing = service(
      harness.reopen({
        beforeMutation: (checkpoint) => {
          if (checkpoint === "draft.internal-links.complete")
            throw new Error("injected link failure");
        },
      }),
    );
    await expect(
      failing.save({
        ...reverted.draft,
        actor: editor,
        entryId: created.id,
        expectedRevision: reverted.draft.revision,
        fields: {},
      }),
    ).rejects.toThrow();
    expect({
      rows: await rows(),
      graph: await graph(),
      entry: await repository.load({ entryId: created.id }),
    }).toEqual(before);
  },
);

contract(
  "pages indexed link targets and all impact locations at high fan-out",
  async (runtime, expect) => {
    const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
    await seedModels(sql, "posts", "settings");
    await repository.create({
      entry: entry("target", "posts", { slug: "target", updatedAt: 1 }),
      mediaReferences: [],
    });
    await repository.publish(publish("target", 1, 2));
    await repository.create({
      entry: entry("settings-entry", "settings", { updatedAt: 1 }),
      mediaReferences: [],
    });
    const ids = Array.from(
      { length: 1000 },
      (_, index) => `source-${String(index).padStart(4, "0")}`,
    );
    const json = JSON.stringify(ids);
    await sql.run(
      "insert into content_entries (id,model_key,created_by,created_at,updated_at) select value,'posts','editor',1,1 from json_each(?)",
      json,
    );
    await sql.run(
      `insert into content_snapshots (id,entry_id,revision,title,fields_json,schema_version,created_at,updated_at,updated_by)
    select value||'-draft',value,1,value,'{}',1,1,1,'editor' from json_each(?) union all
    select value||'-published',value,1,value,'{}',1,1,1,'editor' from json_each(?)`,
      json,
      json,
    );
    await sql.run(
      "update content_entries set draft_snapshot_id=id||'-draft',published_snapshot_id=id||'-published' where id in (select value from json_each(?))",
      json,
    );
    await sql.run(
      "insert into published_routes (path,entry_id,snapshot_id,updated_at) select '/sources/'||value,value,value||'-published',1 from json_each(?)",
      json,
    );
    await sql.run(
      "insert into content_entry_link_references select value||'-published','$fields','fields','/url','target',1 from json_each(?)",
      json,
    );
    await sql.run(
      "insert into content_entry_link_references select 'source-0000-published','block','data','/links/'||value||'/url','target',case when value=5 then 0 else 1 end from json_each(?)",
      JSON.stringify(Array.from({ length: 199 }, (_, i) => i)),
    );
    await sql.run("update content_snapshots set title='Wild%card' where id='source-0000-draft'");
    await sql.run("update content_snapshots set title='wild_card' where id='source-0001-draft'");
    await sql.run("update content_snapshots set title='日本語' where id='source-0002-draft'");
    const statuses = await repository.resolveLinkTargets([
      "target",
      "settings-entry",
      "missing",
      ...ids.slice(0, 197),
    ]);
    expect(Object.keys(statuses)).toHaveLength(200);
    expect(statuses.target).toMatchObject({ state: "published", path: "/blog/target" });
    expect(statuses["settings-entry"]).toEqual({
      id: "settings-entry",
      state: "non-routable",
      modelKey: "settings",
    });
    expect(statuses.missing).toEqual({ id: "missing", state: "missing" });
    expect(
      (await repository.listLinkTargets({ search: "  WILD%  ", limit: 20 })).items.map(
        (item) => item.id,
      ),
    ).toEqual([ids[0]]);
    expect(
      (await repository.listLinkTargets({ search: "wild_", limit: 20 })).items.map(
        (item) => item.id,
      ),
    ).toEqual([ids[1]]);
    expect(
      (await repository.listLinkTargets({ search: "日本", limit: 20 })).items.map(
        (item) => item.id,
      ),
    ).toEqual([ids[2]]);
    expect((await repository.listLinkTargets({ status: "unpublished", limit: 20 })).items).toEqual(
      [],
    );
    const picker = await repository.listLinkTargets({ limit: 2 });
    expect(picker.items).toHaveLength(2);
    const picker2 = await repository.listLinkTargets({ limit: 2, after: picker.nextCursor! });
    expect(
      picker2.items
        .map((item) => item.id)
        .some((id) => picker.items.some((item) => item.id === id)),
    ).toBe(false);
    await expect(
      repository.listLinkTargets({ search: "foreign", limit: 2, after: picker.nextCursor! }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    const query = { targetId: "target", action: "delete" as const, actorId: "admin", limit: 50 };
    const first = await repository.readLinkImpact(query);
    if (first.mode !== "sources") throw new Error("Expected sources");
    expect(first.hasPublishedUsages).toBe(true);
    expect(first.sources).toHaveLength(50);
    const dense = first.sources[0]!;
    expect(dense.locations).toHaveLength(10);
    let locationCursor = dense.nextLocationsCursor;
    const locations = [...dense.locations];
    while (locationCursor) {
      const page = await repository.readLinkImpact({
        ...query,
        sourceEntryId: dense.entryId,
        snapshotId: dense.snapshotId,
        locationsAfter: locationCursor,
      });
      if (page.mode !== "locations") throw new Error("Expected locations");
      expect(page.locations.length).toBeLessThanOrEqual(50);
      locations.push(...page.locations);
      locationCursor = page.nextCursor;
    }
    expect(locations).toHaveLength(200);
    expect(new Set(locations.map((location) => JSON.stringify(location))).size).toBe(200);
    let sourceCursor = first.nextCursor;
    const sources = [...first.sources];
    while (sourceCursor) {
      const page = await repository.readLinkImpact({ ...query, after: sourceCursor });
      if (page.mode !== "sources") throw new Error("Expected sources");
      sources.push(...page.sources);
      sourceCursor = page.nextCursor;
    }
    expect(sources).toHaveLength(1000);
    expect(new Set(sources.map((source) => source.snapshotId)).size).toBe(1000);
    await expect(
      repository.readLinkImpact({ ...query, action: "unpublish", after: first.nextCursor! }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    await expect(
      repository.readLinkImpact({
        ...query,
        sourceEntryId: "other",
        snapshotId: dense.snapshotId,
        locationsAfter: dense.nextLocationsCursor!,
      }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    await sql.run("update content_link_state set revision=revision+1 where singleton_key=1");
    await expect(
      repository.readLinkImpact({ ...query, after: first.nextCursor! }),
    ).rejects.toMatchObject({ code: "CONTENT_LINK_IMPACT_CHANGED" });
    const plan = await sql.all(
      "explain query plan select snapshot_id from content_entry_link_references where target_entry_id=? and snapshot_id>? order by snapshot_id limit 51",
      "target",
      "",
    );
    expect(JSON.stringify(plan)).toContain("content_entry_link_references_target_idx");
  },
);

contract(
  "validates delivered internal targets at publication including self links and final-state races",
  async (runtime, expect) => {
    const config = await defineConfig({
      blocks: [builtInBlocks.link],
      content: [
        defineCollection({
          key: "posts",
          version: 1,
          route: "/blog/:slug",
          blocks: ["link"],
          fields: { url: field.url() },
        }),
        defineGlobal({ key: "settings", version: 1, blocks: [], fields: {} }),
      ],
    });
    const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
    await seedModels(sql, "posts", "settings");
    await repository.create({
      entry: entry("global-target", "settings", { updatedAt: 1 }),
      mediaReferences: [],
    });
    const useCases = new ContentUseCases({
      config: config.runtime,
      content: repository,
      media: repository,
      clock: { now: () => unixMilliseconds(10) },
      idGenerator: { next: sequence("target-policy") },
    });
    const create = (slug: string, url?: string) =>
      useCases.create({
        actor: editor,
        modelKey: "posts",
        title: slug,
        slug,
        fields: url === undefined ? {} : { url },
        blocks: [],
      });
    const target = await create("target");
    let source = await create("source", `entry:${target.id}`);
    const before = await repository.publishedContentVersion();
    await expect(
      useCases.publish({ actor: admin, entryId: source.id, expectedRevision: 1 }),
    ).rejects.toMatchObject({
      issues: [{ code: "internal_link_unavailable", path: ["fields", "url"] }],
    });
    expect(await repository.publishedContentVersion()).toBe(before);
    await expect(create("bad-global", "entry:global-target")).rejects.toMatchObject({
      issues: [{ code: "internal_link_non_routable", path: ["fields", "url"] }],
    });
    await useCases.publish({ actor: admin, entryId: target.id, expectedRevision: 1 });
    await useCases.publish({ actor: admin, entryId: source.id, expectedRevision: 1 });
    const targetWithReturn = await useCases.save({
      ...target.draft,
      actor: editor,
      entryId: target.id,
      expectedRevision: 1,
      fields: { url: `entry:${source.id}` },
    });
    await useCases.publish({
      actor: admin,
      entryId: target.id,
      expectedRevision: targetWithReturn.draft.revision,
    });
    const self = await create("self");
    const selfSaved = await useCases.save({
      ...self.draft,
      actor: editor,
      entryId: self.id,
      expectedRevision: 1,
      fields: { url: `entry:${self.id}` },
    });
    await expect(
      useCases.publish({
        actor: admin,
        entryId: self.id,
        expectedRevision: selfSaved.draft.revision,
      }),
    ).resolves.toMatchObject({ publication: "published" });
    const hidden = await useCases.create({
      actor: editor,
      modelKey: "posts",
      title: "Hidden",
      slug: "hidden",
      fields: {},
      blocks: [
        {
          key: blockKey("hidden-link"),
          type: "link",
          schemaVersion: 1,
          position: 1000,
          hidden: true,
          data: { label: "Missing", url: "entry:missing" },
        },
      ],
    });
    await expect(
      useCases.publish({ actor: admin, entryId: hidden.id, expectedRevision: 1 }),
    ).resolves.toMatchObject({ publication: "published" });
    const visible = await useCases.save({
      ...hidden.draft,
      actor: editor,
      entryId: hidden.id,
      expectedRevision: 1,
      blocks: hidden.draft.blocks.map((block) => ({ ...block, hidden: false })),
    });
    await expect(
      useCases.publish({
        actor: admin,
        entryId: hidden.id,
        expectedRevision: visible.draft.revision,
      }),
    ).rejects.toMatchObject({
      issues: [{ code: "internal_link_unavailable", path: ["blocks", 0, "data", "url"] }],
    });
    const conflicted = await create("self");
    await expect(
      useCases.publish({ actor: admin, entryId: conflicted.id, expectedRevision: 1 }),
    ).rejects.toMatchObject({ code: "CONTENT_ROUTE_CONFLICT" });
    // Final commit must refuse targets removed after application preflight.
    const raceTarget = await create("race-target");
    const racePublished = await useCases.publish({
      actor: admin,
      entryId: raceTarget.id,
      expectedRevision: 1,
    });
    source = await create("race-source", `entry:${raceTarget.id}`);
    const racePort = Object.create(repository) as ContractRepository;
    racePort.resolveLinkTargets = async (ids) => {
      const statuses = await repository.resolveLinkTargets(ids);
      await useCases.unpublish({
        actor: admin,
        entryId: raceTarget.id,
        expectedPublishedSnapshotId: racePublished.entry.published!.id,
      });
      return statuses;
    };
    const raceUseCases = new ContentUseCases({
      config: config.runtime,
      content: racePort,
      media: repository,
      clock: { now: () => unixMilliseconds(20) },
      idGenerator: { next: sequence("race") },
    });
    await expect(
      raceUseCases.publish({ actor: admin, entryId: source.id, expectedRevision: 1 }),
    ).rejects.toMatchObject({
      issues: [{ code: "internal_link_unavailable", path: ["fields", "url"] }],
    });
    expect((await repository.load({ entryId: source.id }))!.published).toBeUndefined();
    expect(await sql.all("pragma foreign_key_check")).toEqual([]);
  },
);

contract(
  "guards linked target removal with scoped impact receipts and replay-safe unpublication",
  async (runtime, expect) => {
    const config = await defineConfig({
      blocks: [builtInBlocks.link],
      content: [
        defineCollection({
          key: "posts",
          version: 1,
          route: "/blog/:slug",
          blocks: ["link"],
          fields: { url: field.url() },
        }),
      ],
    });
    const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
    await seedModels(sql, "posts");
    const useCases = new ContentUseCases({
      config: config.runtime,
      content: repository,
      media: repository,
      clock: { now: () => unixMilliseconds(10) },
      idGenerator: { next: sequence("impact") },
    });
    const create = (slug: string, fields: JsonObject = {}) =>
      useCases.create({ actor: editor, modelKey: "posts", title: slug, slug, fields, blocks: [] });
    const target = await create("target");
    const publication = await useCases.publish({
      actor: admin,
      entryId: target.id,
      expectedRevision: 1,
    });
    const source = await create("source", { url: `entry:${target.id}` });
    const impact = (action: "delete" | "unpublish", entryId = target.id, actor = admin) =>
      repository.readLinkImpact({
        targetId: entryId,
        action,
        actorId: actor.id,
        limit: 20,
      });
    expect((await impact("delete")).hasPublishedUsages).toBe(false);
    await useCases.publish({ actor: admin, entryId: source.id, expectedRevision: 1 });
    const evidence = await impact("unpublish");
    expect(evidence.hasPublishedUsages).toBe(true);
    const unchangedSources = await sql.all(
      "select id,fields_json from content_snapshots where entry_id=? order by id",
      source.id,
    );
    const version = await repository.publishedContentVersion();
    await expect(
      useCases.unpublish({
        actor: admin,
        entryId: target.id,
        expectedPublishedSnapshotId: publication.entry.published!.id,
      }),
    ).rejects.toMatchObject({ code: "CONTENT_LINKS_IN_USE" });
    await expect(
      useCases.delete({ actor: admin, entryId: target.id, expectedRevision: 1 }),
    ).rejects.toMatchObject({ code: "CONTENT_LINKS_IN_USE" });
    const acknowledgment = { receipt: evidence.receipt, acknowledgePublishedLinks: true as const };
    await expect(
      useCases.unpublish({
        actor: editor,
        entryId: target.id,
        expectedPublishedSnapshotId: publication.entry.published!.id,
        linkImpact: acknowledgment,
      }),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    await expect(
      useCases.delete({
        actor: { id: actorId("viewer"), role: "viewer" },
        entryId: target.id,
        expectedRevision: 1,
        linkImpact: acknowledgment,
      }),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    await expect(
      useCases.delete({
        actor: admin,
        entryId: target.id,
        expectedRevision: 1,
        linkImpact: acknowledgment,
      }),
    ).rejects.toMatchObject({ code: "CONTENT_LINK_IMPACT_CHANGED" });
    const other = await create("other");
    const otherPublication = await useCases.publish({
      actor: admin,
      entryId: other.id,
      expectedRevision: 1,
    });
    await expect(
      useCases.unpublish({
        actor: admin,
        entryId: other.id,
        expectedPublishedSnapshotId: otherPublication.entry.published!.id,
        linkImpact: acknowledgment,
      }),
    ).rejects.toMatchObject({ code: "CONTENT_LINK_IMPACT_CHANGED" });
    await expect(
      useCases.unpublish({
        actor: { ...admin, id: actorId("another-admin") },
        entryId: target.id,
        expectedPublishedSnapshotId: publication.entry.published!.id,
        linkImpact: acknowledgment,
      }),
    ).rejects.toMatchObject({ code: "CONTENT_LINK_IMPACT_CHANGED" });
    // An unrelated link edit conservatively invalidates the observed graph.
    await create("unrelated", { url: "entry:missing" });
    await expect(
      useCases.unpublish({
        actor: admin,
        entryId: target.id,
        expectedPublishedSnapshotId: publication.entry.published!.id,
        linkImpact: acknowledgment,
      }),
    ).rejects.toMatchObject({ code: "CONTENT_LINK_IMPACT_CHANGED" });
    expect(await repository.publishedContentVersion()).toBe(version + 1); // only the other publication
    const fresh = await impact("unpublish");
    const command = {
      actor: admin,
      entryId: target.id,
      expectedPublishedSnapshotId: publication.entry.published!.id,
      idempotencyKey: "unpublish-lost-response",
      linkImpact: { receipt: fresh.receipt, acknowledgePublishedLinks: true as const },
    };
    const result = await useCases.unpublish(command);
    expect(result.unpublication).toBe("unpublished");
    const afterVersion = await repository.publishedContentVersion();
    expect(await useCases.unpublish(command)).toMatchObject({
      unpublication: "replayed",
      build: { status: "not-dispatched" },
    });
    expect(await repository.publishedContentVersion()).toBe(afterVersion);
    await expect(useCases.unpublish({ ...command, linkImpact: acknowledgment })).rejects.toThrow();
    expect(
      await sql.all(
        "select id,fields_json from content_snapshots where entry_id=? order by id",
        source.id,
      ),
    ).toEqual(unchangedSources);
    const restored = await useCases.publish({
      actor: admin,
      entryId: target.id,
      expectedRevision: 1,
    });
    expect(restored.entry.id).toBe(target.id);
    const deletion = await impact("delete");
    await useCases.delete({
      actor: admin,
      entryId: target.id,
      expectedRevision: 1,
      linkImpact: { receipt: deletion.receipt, acknowledgePublishedLinks: true },
    });
    expect(await repository.load({ entryId: target.id })).toBeNull();
    expect(
      await sql.all(
        "select id,fields_json from content_snapshots where entry_id=? order by id",
        source.id,
      ),
    ).toEqual(unchangedSources);
    expect(
      await count(
        sql,
        "select count(*) as count from content_entry_link_references where target_entry_id=?",
        target.id,
      ),
    ).toBe(2);
    await expect(
      useCases.delete({ actor: admin, entryId: target.id, expectedRevision: 1 }),
    ).rejects.toThrow();
    const hidden = await useCases.create({
      actor: editor,
      modelKey: "posts",
      title: "Hidden source",
      slug: "hidden-source",
      fields: {},
      blocks: [
        {
          key: blockKey("hidden"),
          type: "link",
          schemaVersion: 1,
          position: 1000,
          hidden: true,
          data: { label: "Other", url: `entry:${other.id}` },
        },
      ],
    });
    await useCases.publish({ actor: admin, entryId: hidden.id, expectedRevision: 1 });
    const hiddenImpact = await impact("delete", other.id);
    expect(hiddenImpact.hasPublishedUsages).toBe(false);
    if (hiddenImpact.mode !== "sources") throw new Error("Expected sources");
    expect(
      hiddenImpact.sources.some(
        (source) =>
          source.phase === "published" && source.locations.every((location) => !location.delivered),
      ),
    ).toBe(true);
    await useCases.delete({ actor: admin, entryId: other.id, expectedRevision: 1 });
    const raceTarget = await create("simultaneous-target");
    const racePublished = await useCases.publish({
      actor: admin,
      entryId: raceTarget.id,
      expectedRevision: 1,
    });
    const raceSource = await create("simultaneous-source", { url: `entry:${raceTarget.id}` });
    const outcomes = await Promise.allSettled([
      useCases.publish({ actor: admin, entryId: raceSource.id, expectedRevision: 1 }),
      useCases.unpublish({
        actor: admin,
        entryId: raceTarget.id,
        expectedPublishedSnapshotId: racePublished.entry.published!.id,
      }),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    const targetAfter = await repository.load({ entryId: raceTarget.id });
    const sourceAfter = await repository.load({ entryId: raceSource.id });
    expect(targetAfter!.published !== undefined).toBe(sourceAfter!.published !== undefined);
    // A disappearing self-publication is not an external published usage.
    const self = await create("self");
    const selfSaved = await useCases.save({
      ...self.draft,
      actor: editor,
      entryId: self.id,
      expectedRevision: 1,
      fields: { url: `entry:${self.id}` },
    });
    const selfPublished = await useCases.publish({
      actor: admin,
      entryId: self.id,
      expectedRevision: selfSaved.draft.revision,
    });
    expect((await impact("unpublish", self.id)).hasPublishedUsages).toBe(false);
    await useCases.unpublish({
      actor: admin,
      entryId: self.id,
      expectedPublishedSnapshotId: selfPublished.entry.published!.id,
    });
    await useCases.delete({
      actor: editor,
      entryId: self.id,
      expectedRevision: selfSaved.draft.revision,
    });
  },
);

contract(
  "schema synchronization maintains nested and migrated link projections and rejects new unavailable targets",
  async (runtime, expect) => {
    const block = (version: number) =>
      defineBlock({
        type: "schemaLinks",
        version,
        fields: version === 1 ? { url: field.url() } : { destination: field.url() },
        ...(version === 1
          ? {}
          : {
              migrations: {
                2: ({ data, settings }) => ({ data: { destination: data.url! }, settings }),
              },
            }),
      });
    const configuration = async (
      version: number,
      target?: string,
      extra?: string,
      broken = false,
    ) =>
      defineConfig({
        blocks: [block(version === 1 ? 1 : 2)],
        content: [
          defineCollection({
            key: "posts",
            version,
            route: "/blog/:slug",
            blocks: ["schemaLinks"],
            fields: {
              links: field.list({
                item: field.group({
                  fields:
                    version === 1
                      ? { url: field.url() }
                      : { destination: field.url({ renamedFrom: "url" }) },
                }),
              }),
              ...(target === undefined
                ? {}
                : { newLink: field.url({ defaultValue: `entry:${target}` }) }),
              ...(extra === undefined ? {} : { extra: field.text({ defaultValue: extra }) }),
              ...(broken ? { broken: field.url({ defaultValue: "entry:missing" }) } : {}),
            },
          }),
        ],
      });
    const harness = await runtime.open({ resolveModel: resolveRoute });
    const { repository, sql } = harness;
    const sync = async (
      config: Awaited<ReturnType<typeof configuration>>,
      at: number,
      targetRepository = repository,
    ) => {
      const prepared = await prepareConfigurationSynchronization({
        models: config.runtime.content,
        blocks: config.runtime.blocks,
        state: targetRepository,
      });
      expect(prepared.plan.isValid, JSON.stringify(prepared.plan)).toBe(true);
      return applyPreparedConfigurationSynchronization({
        prepared,
        models: config.runtime.content,
        blocks: config.runtime.blocks,
        clock: { now: () => unixMilliseconds(at) },
        ids: { next: sequence("schema-singleton") },
        target: targetRepository,
      });
    };
    const first = await configuration(1);
    await sync(first, 1);
    const useCases = new ContentUseCases({
      config: first.runtime,
      content: repository,
      media: repository,
      clock: { now: () => unixMilliseconds(10) },
      idGenerator: { next: sequence("schema-links") },
    });
    const target = await useCases.create({
      actor: editor,
      modelKey: "posts",
      title: "Target",
      slug: "target",
      fields: {},
      blocks: [],
    });
    await useCases.publish({ actor: admin, entryId: target.id, expectedRevision: 1 });
    const source = await useCases.create({
      actor: editor,
      modelKey: "posts",
      title: "Source",
      slug: "source",
      fields: { links: [{ url: `entry:${target.id}` }, { url: "/manual" }] },
      blocks: [
        {
          key: blockKey("shown"),
          type: "schemaLinks",
          schemaVersion: 1,
          position: 1000,
          data: { url: `entry:${target.id}` },
        },
        {
          key: blockKey("hidden"),
          type: "schemaLinks",
          schemaVersion: 1,
          position: 2000,
          hidden: true,
          data: { url: "entry:missing" },
        },
      ],
    });
    await useCases.publish({ actor: admin, entryId: source.id, expectedRevision: 1 });
    const graph = async () =>
      (await sql.get<{ revision: number }>(
        "select revision from content_link_state where singleton_key=1",
      ))!.revision;
    const beforeGraph = await graph();
    const oldBlocks = await sql.all(
      "select snapshot_id,block_key,schema_version,data_json from content_blocks order by snapshot_id,block_key",
    );
    const failing = harness.reopen({
      beforeMutation: (checkpoint) => {
        if (checkpoint === "sync.migration.draft") throw new Error("interrupted link migration");
      },
    });
    await expect(sync(await configuration(2), 20, failing)).rejects.toThrow();
    expect(await graph()).toBe(beforeGraph);
    expect(
      await sql.all(
        "select snapshot_id,block_key,schema_version,data_json from content_blocks order by snapshot_id,block_key",
      ),
    ).toEqual(oldBlocks);
    expect(await sql.all("select * from mutation_guards")).toEqual([]);
    await sync(await configuration(2), 20);
    const changed = (await repository.load({ entryId: source.id }))!;
    for (const snapshot of [changed.draft, changed.published!]) {
      expect(snapshot.fields).toEqual({
        links: [{ destination: `entry:${target.id}` }, { destination: "/manual" }],
      });
      expect(snapshot.blocks[0]!.data).toEqual({ destination: `entry:${target.id}` });
      expect(snapshot.blocks[1]!.data).toEqual({ destination: "entry:missing" });
      const refs = await sql.all(
        "select source_key,field_path,target_entry_id,delivered from content_entry_link_references where snapshot_id=? order by source_key",
        snapshot.id,
      );
      expect(refs).toEqual([
        {
          source_key: "$fields",
          field_path: "/links/0/destination",
          target_entry_id: target.id,
          delivered: 1,
        },
        {
          source_key: "hidden",
          field_path: "/destination",
          target_entry_id: "missing",
          delivered: 0,
        },
        {
          source_key: "shown",
          field_path: "/destination",
          target_entry_id: target.id,
          delivered: 1,
        },
      ]);
    }
    expect(await graph()).toBe(beforeGraph + 2); // block migration unit and final field rewrite
    const third = await configuration(3, target.id);
    await sync(third, 30);
    const beforeFailure = await sql.all("select id,fields_json from content_snapshots order by id");
    const beforeFailedGraph = await graph();
    await expect(
      sync(await configuration(4, target.id, undefined, true), 40),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    expect(await sql.all("select id,fields_json from content_snapshots order by id")).toEqual(
      beforeFailure,
    );
    expect(await graph()).toBe(beforeFailedGraph);
    const currentTarget = (await repository.load({ entryId: target.id }))!;
    const impact = await repository.readLinkImpact({
      targetId: target.id,
      action: "unpublish",
      actorId: admin.id,
      limit: 20,
    });
    await useCases.unpublish({
      actor: admin,
      entryId: target.id,
      expectedPublishedSnapshotId: currentTarget.published!.id,
      linkImpact: { receipt: impact.receipt, acknowledgePublishedLinks: true },
    });
    const beforeUnrelated = await graph();
    await sync(await configuration(4, target.id, "Hello"), 50);
    expect(await graph()).toBe(beforeUnrelated);
    expect((await repository.load({ entryId: source.id }))!.published!.fields).toMatchObject({
      extra: "Hello",
    });
    expect(await sql.all("select * from mutation_guards")).toEqual([]);
    const current = await configuration(4, target.id, "Hello");
    const overflow = await defineConfig({
      blocks: [block(2)],
      content: [
        defineCollection({
          key: "posts",
          version: 5,
          route: "/blog/:slug",
          blocks: ["schemaLinks"],
          fields: {
            ...current.runtime.content[0]!.fields,
            many: field.list({
              item: field.url(),
              defaultValue: Array(100).fill(`entry:${target.id}`),
            }),
            more: field.list({
              item: field.url(),
              defaultValue: Array(100).fill(`entry:${target.id}`),
            }),
          },
        }),
      ],
    });
    await expect(sync(overflow as typeof current, 60)).rejects.toMatchObject({
      issues: [{ code: "too_many_internal_links" }],
    });
    expect(await graph()).toBe(beforeUnrelated);
    const pruned = await defineConfig({
      blocks: [block(2)],
      content: [
        defineCollection({
          key: "posts",
          version: 5,
          route: "/blog/:slug",
          blocks: [],
          removedBlocks: ["schemaLinks"],
          fields: current.runtime.content[0]!.fields,
        }),
      ],
    });
    await sync(pruned as typeof current, 70);
    expect(await graph()).toBe(beforeUnrelated + 1);
    expect(
      await sql.all("select * from content_entry_link_references where source_key<>'$fields'"),
    ).toEqual([]);
    expect(await sql.all("select * from content_blocks")).toEqual([]);
  },
);

contract(
  "retains populated-model removal refusal for linked pages, collections and globals",
  async (runtime, expect) => {
    const config = await defineConfig({
      content: [
        definePage({ key: "home", version: 1, path: "/", fields: { url: field.url() } }),
        defineCollection({
          key: "posts",
          version: 1,
          route: "/blog/:slug",
          fields: { url: field.url() },
        }),
        defineGlobal({ key: "settings", version: 1, fields: { url: field.url() } }),
      ],
    });
    const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
    const apply = async (models: typeof config.runtime.content) => {
      const prepared = await prepareConfigurationSynchronization({ models, state: repository });
      return applyPreparedConfigurationSynchronization({
        prepared,
        models,
        target: repository,
        clock: { now: () => unixMilliseconds(1) },
        ids: { next: sequence("removal") },
      });
    };
    await apply(config.runtime.content);
    const home = await sql.get<{ id: string }>(
      "select id from content_entries where model_key='home'",
    );
    const settings = await sql.get<{ id: string }>(
      "select id from content_entries where model_key='settings'",
    );
    const useCases = new ContentUseCases({
      config: config.runtime,
      content: repository,
      media: repository,
      clock: { now: () => unixMilliseconds(10) },
      idGenerator: { next: sequence("kept") },
    });
    await useCases.publish({
      actor: admin,
      entryId: contentEntryId(home!.id),
      expectedRevision: 1,
    });
    const post = await useCases.create({
      actor: editor,
      modelKey: "posts",
      title: "Linked",
      slug: "linked",
      fields: { url: `entry:${home!.id}` },
      blocks: [],
    });
    await useCases.publish({ actor: admin, entryId: post.id, expectedRevision: 1 });
    const global = (await repository.load({ entryId: contentEntryId(settings!.id) }))!;
    await useCases.save({
      ...global.draft,
      actor: editor,
      entryId: global.id,
      expectedRevision: 1,
      fields: { url: `entry:${post.id}` },
    });
    await useCases.publish({ actor: admin, entryId: global.id, expectedRevision: 2 });
    const state = async () => ({
      models: await sql.all("select * from content_models order by key"),
      entries: await sql.all("select * from content_entries order by id"),
      snapshots: await sql.all("select * from content_snapshots order by id"),
      refs: await sql.all(
        "select * from content_entry_link_references order by snapshot_id,source_key,field_path",
      ),
      routes: await sql.all("select * from published_routes order by path"),
      graph: await sql.all("select * from content_link_state"),
    });
    expect((await repository.loadPublicGlobal(contentModelKey("settings")))!.internalLinks).toEqual(
      [{ sourceKey: "$fields", area: "fields", pointer: "/url", targetId: post.id }],
    );
    const before = await state();
    for (const key of ["home", "posts", "settings"]) {
      const models = config.runtime.content.filter((model) => model.key !== key);
      const prepared = await prepareConfigurationSynchronization({ models, state: repository });
      expect(prepared.plan.isValid).toBe(false);
      expect(prepared.plan.diagnostics.some((item) => item.code === "REMOVAL_HAS_ENTRIES")).toBe(
        true,
      );
      await expect(apply(models as typeof config.runtime.content)).rejects.toMatchObject({
        code: "CONTENT_INVALID_STATE",
      });
      expect(await state()).toEqual(before);
    }
    await expect(apply([] as unknown as typeof config.runtime.content)).rejects.toMatchObject({
      code: "CONTENT_INVALID_STATE",
    });
    expect(await state()).toEqual(before);
  },
);

contract(
  "bounds impact cursors for maximum Unicode IDs and long valid field pointers",
  async (runtime, expect) => {
    const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
    await seedModels(sql, "posts");
    const targetId = "目".repeat(255);
    const sourceId = "源".repeat(255);
    const actor = "人".repeat(255);
    const target = entry(targetId, "posts", { title: "Target", slug: "target", updatedAt: 1 });
    await repository.create({
      entry: { ...target, draft: { ...target.draft, id: contentSnapshotId("target-draft") } },
      mediaReferences: [],
    });
    await repository.publish(publish(targetId, 1, 2, "公".repeat(255)));
    const keys = Array.from({ length: 11 }, (_, i) => `${"longField".repeat(600)}${i}`);
    const source = entry(sourceId, "posts", {
      title: "Source",
      slug: "source",
      updatedAt: 1,
      fields: Object.fromEntries(keys.map((key) => [key, `entry:${encodeURIComponent(targetId)}`])),
    });
    const snapshotId = "草".repeat(255);
    await repository.create({
      entry: { ...source, draft: { ...source.draft, id: contentSnapshotId(snapshotId) } },
      mediaReferences: [],
      internalLinks: keys.map((key) => ({
        sourceKey: "$fields",
        area: "fields",
        pointer: `/${key}`,
        targetId,
        delivered: true,
      })),
    });
    const first = await repository.readLinkImpact({
      targetId,
      action: "delete",
      actorId: actor,
      limit: 1,
    });
    if (first.mode !== "sources") throw new Error("Expected sources");
    expect(first.receipt.length).toBeLessThanOrEqual(4096);
    expect(first.sources[0]!.locations).toHaveLength(10);
    const after = first.sources[0]!.nextLocationsCursor!;
    expect(after.length).toBeLessThanOrEqual(4096);
    const next = await repository.readLinkImpact({
      targetId,
      action: "delete",
      actorId: actor,
      limit: 50,
      sourceEntryId: sourceId,
      snapshotId,
      locationsAfter: after,
    });
    if (next.mode !== "locations") throw new Error("Expected locations");
    expect(next.locations).toHaveLength(1);
    expect(
      new Set(
        [...first.sources[0]!.locations, ...next.locations].map((location) => location.pointer),
      ).size,
    ).toBe(11);
    await sql.run(
      "update content_entry_link_references set rowid=rowid+10000 where snapshot_id=?",
      snapshotId,
    );
    await expect(
      repository.readLinkImpact({
        targetId,
        action: "delete",
        actorId: actor,
        limit: 50,
        sourceEntryId: sourceId,
        snapshotId,
        locationsAfter: after,
      }),
    ).rejects.toMatchObject({ code: "CONTENT_LINK_IMPACT_CHANGED" });
  },
);

contract(
  "public query identity avoids builds and guards legacy, mixed and stale updates",
  async (runtime, expect) => {
    const model = async (
      listOptions?: CollectionModelInput["listOptions"],
      seo: "first" | "second" = "first",
    ) =>
      (
        await defineConfig({
          content: [
            defineCollection({
              key: "queries",
              route: "/queries/:slug",
              version: 1,
              fields: { first: field.text(), second: field.text() },
              seo: { description: seo },
              ...(listOptions === undefined ? {} : { listOptions }),
            }),
          ],
        })
      ).runtime.content[0]!;
    const original = await model();
    const { repository, sql } = await runtime.open({
      resolveModel: syncResolver([original]),
      nextId: sequence("identity"),
    });
    await applySync(repository, [original], 10);
    const stable = async () => ({
      snapshots: await sql.all("select * from content_snapshots order by id"),
      published: await sql.all("select * from published_state"),
      outbox: await sql.all("select * from outbox_events order by id"),
    });
    const baseline = await stable();
    for (const options of [
      { searchableFields: ["first"] },
      { sortableFields: ["second", "first"] },
      { sortableFields: ["first", "second"] },
      undefined,
    ] as const) {
      const current = await model(options);
      const result = await applySync(repository, [current], 20);
      expect(result.targetVersion).toBeUndefined();
      expect(await stable()).toEqual(baseline);
      expect((await repository.readConfigurationSyncState())[0]).toMatchObject({
        publicProjectionHash: current.publicProjectionHash,
        publicProjectionSourceHash: current.projectionHash,
      });
      expect((await applySync(repository, [current], 21)).status).toBe("noop");
    }
    // First enablement from pre-feature identity can be proven without a public baseline.
    await sql.run(
      "update content_models set public_projection_hash=null, public_projection_source_hash=null",
    );
    const enabled = await model({ searchableFields: ["first"] });
    const prepared = await prepareConfigurationSynchronization({
      models: [enabled],
      state: repository,
    });
    await applySync(repository, [enabled], 30);
    expect(await stable()).toEqual(baseline);
    await expect(applySync(repository, [enabled], 31, prepared)).rejects.toMatchObject({
      code: "CONTENT_INVALID_STATE",
    });
    // Concurrent baseline-only seeding changes state while leaving full identity equal.
    await sql.run(
      "update content_models set public_projection_hash=null, public_projection_source_hash=null",
    );
    const seedPlan = await prepareConfigurationSynchronization({
      models: [enabled],
      state: repository,
    });
    expect(seedPlan.plan.operations).toMatchObject([{ action: "record-baseline" }]);
    await applySync(repository, [enabled], 32);
    await expect(applySync(repository, [enabled], 33, seedPlan)).rejects.toMatchObject({
      code: "CONTENT_INVALID_STATE",
    });
    expect(await stable()).toEqual(baseline);
    // SEO and query changes together retain the public build.
    const mixed = await model({ filterableFields: ["second"] }, "second");
    expect((await applySync(repository, [mixed], 40)).targetVersion).toBe(2);
    expect(await count(sql, "select count(*) as count from outbox_events")).toBe(1);
    // Rollback-era full identity writes invalidate the hash/source association.
    await sql.run("update content_models set projection_hash='rollback-change'");
    expect((await applySync(repository, [mixed], 50)).targetVersion).toBe(3);
    expect((await applySync(repository, [mixed], 51)).status).toBe("noop");
  },
);

contract(
  "public query identity rolls back a failing final sync mutation",
  async (runtime, expect) => {
    const make = async (label: string) =>
      (
        await defineConfig({
          content: [
            defineCollection({
              key: "queries",
              route: "/queries/:slug",
              version: 1,
              label,
              fields: { summary: field.text() },
              listOptions: { searchableFields: ["summary"] },
            }),
          ],
        })
      ).runtime.content[0]!;
    const before = await make("Before"),
      after = await make("After");
    const { repository, sql, reopen } = await runtime.open({
      resolveModel: syncResolver([before]),
      nextId: sequence("failure"),
    });
    await applySync(repository, [before], 10);
    const dump = async () => ({
      models: await sql.all("select * from content_models"),
      published: await sql.all("select * from published_state"),
      outbox: await sql.all("select * from outbox_events"),
    });
    const saved = await dump();
    const failed = reopen({
      beforeMutation: (checkpoint) => {
        if (checkpoint === "public-state") throw new Error("injected identity failure");
      },
    });
    await expect(applySync(failed, [after], 20)).rejects.toThrow();
    expect(await dump()).toEqual(saved);
  },
);

contract(
  "configured collection queries share typed predicates, literal LIKE and exact field paging",
  async (runtime, expect) => {
    const definitions = {
      text: field.text(),
      area: field.textarea(),
      link: field.url(),
      category: field.select({ options: ["a", "b", "c"] }),
      number: field.number(),
      flag: field.boolean(),
      date: field.date(),
      time: field.datetime(),
    };
    const keys = Object.keys(definitions) as (keyof typeof definitions)[];
    const model = (
      await defineConfig({
        content: [
          defineCollection({
            key: "posts",
            route: "/blog/:slug",
            version: 1,
            fields: definitions,
            listOptions: {
              sortableFields: keys,
              filterableFields: keys,
              searchableFields: ["text", "area"],
            },
          }),
        ],
      })
    ).runtime.content[0]!;
    const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
    await seedModels(sql, "posts");
    let state = 123456789;
    const prefix =
      "A" +
      Array.from({ length: 6000 }, () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return String.fromCharCode(33 + (state % 90));
      }).join("");
    const fixtures: readonly [string, JsonObject][] = [
      [
        "a",
        {
          text: "a",
          area: prefix + "a",
          link: "https://example.test/" + prefix + "a",
          category: "b",
          number: 0,
          flag: false,
          date: "2024-02-29",
          time: "2026-10-25T12:00:00+02:00",
        },
      ],
      [
        "b",
        {
          text: "A",
          area: prefix + "b",
          link: "https://example.test/" + prefix + "b",
          category: "a",
          number: 2,
          flag: true,
          date: "2025-01-01",
          time: "2026-10-25T10:00:00Z",
        },
      ],
      [
        "c",
        {
          text: "Москва Ёлка [2026]* Їжак Ђак",
          area: "СЕРБІЯ",
          category: "c",
          number: 10,
          flag: false,
          date: "2026-10-25",
          time: "2026-10-26T10:00:00Z",
        },
      ],
      ["d", {}],
      [
        "e",
        {
          text: "",
          area: "",
          link: "",
          category: "",
          number: null,
          flag: null,
          date: "",
          time: "",
        },
      ],
      ["f", { text: " ", number: 2, flag: false }],
    ];
    for (const [name, fields] of fixtures)
      await repository.create({
        entry: entry(name, "posts", {
          fields,
          title: name === "d" ? "Москва title" : name,
          slug: name,
          updatedAt: 1,
        }),
        mediaReferences: [],
      });
    const list = (
      sort = "-updatedAt",
      filters: unknown = [],
      other: Record<string, unknown> = {},
    ) =>
      repository.list({
        modelKey: contentModelKey("posts"),
        listFields: ["flag", "number"],
        limit: 1,
        sort: sort as never,
        query: resolveCollectionQuery(model, sort, filters)!,
        ...other,
      });
    const fold = (value: string) => value.replace(/[A-Z]/gu, (letter) => letter.toLowerCase());
    for (const key of keys)
      for (const descending of [false, true]) {
        const sort = `${descending ? "-" : ""}field:${key}`;
        const orderValue = (fields: JsonObject) => {
          const value = fields[key];
          return value === undefined || value === null || value === ""
            ? null
            : key === "time"
              ? Date.parse(value as string)
              : typeof value === "string"
                ? fold(value)
                : Number(value);
        };
        const expected = [...fixtures]
          .sort(([a, av], [b, bv]) => {
            const left = orderValue(av),
              right = orderValue(bv);
            if (left === null || right === null)
              return left === right
                ? (a < b ? -1 : 1) * (descending ? -1 : 1)
                : left === null
                  ? 1
                  : -1;
            const compare = left < right ? -1 : left > right ? 1 : a < b ? -1 : 1;
            return compare * (descending ? -1 : 1);
          })
          .map(([name]) => name);
        const collected: string[] = [];
        let after: string | undefined;
        do {
          const page = await list(sort, [], after === undefined ? {} : { after });
          expect(page.totals.all).toBe(6);
          collected.push(...page.items.map((item) => item.id));
          after = page.nextCursor;
          if (after) expect(after.length).toBeLessThanOrEqual(4096);
        } while (after);
        expect(collected).toEqual(expected);
      }
    const match = async (filters: unknown, q?: string) =>
      (await list("title", filters, { limit: 100, ...(q === undefined ? {} : { q }) })).items
        .map((item) => item.id)
        .sort();
    for (const [filters, expected] of [
      [[{ field: "number", op: "eq", value: 0 }], ["a"]],
      [[{ field: "flag", op: "eq", value: false }], ["a", "c", "f"]],
      [
        [
          { field: "number", op: "range", min: 2, max: 10 },
          { field: "category", op: "in", values: ["b", "a"] },
        ],
        ["b"],
      ],
      [[{ field: "text", op: "eq", value: "A" }], ["a", "b"]],
      [[{ field: "text", op: "contains", value: "Ёлка" }], ["c"]],
      [[{ field: "text", op: "contains", value: "ёЛКА" }], []],
      [[{ field: "area", op: "contains", value: "СЕРБІЯ" }], ["c"]],
      [[{ field: "area", op: "contains", value: "сербія" }], []],
      [[{ field: "text", op: "contains", value: "[2026]*" }], ["c"]],
      [[{ field: "text", op: "contains", value: "елка" }], []],
      [[{ field: "link", op: "contains", value: "https://EXAMPLE.test/" }], ["a", "b"]],
      [[{ field: "date", op: "range", from: "2024-02-29", to: "2025-01-01" }], ["a", "b"]],
      [
        [
          {
            field: "time",
            op: "range",
            from: "2026-10-25T12:00:00+02:00",
            to: "2026-10-25T10:00:00Z",
          },
        ],
        ["a", "b"],
      ],
      [[{ field: "flag", op: "isNotSet" }], ["d", "e"]],
      [[{ field: "number", op: "isSet" }], ["a", "b", "c", "f"]],
    ] as const) {
      expect(await match(filters)).toEqual(expected);
    }
    expect(await match([], "Москва")).toEqual(["c", "d"]);
    expect(await match([], "МОСКВА")).toEqual([]);
    expect(await match([], "Їжак Ђак")).toEqual(["c"]);
    const unconfigured = await repository.list({
      modelKey: contentModelKey("posts"),
      listFields: [],
      sort: "title",
      limit: 100,
      q: "Москва",
    });
    expect(unconfigured.items.map((item) => item.id)).toEqual(["d"]);
    expect(
      (
        await list("title", [{ field: "flag", op: "eq", value: false }], {
          limit: 1,
          status: "draft",
        })
      ).totals,
    ).toEqual({ all: 3, draft: 3, changed: 0, published: 0 });
    expect(
      (await list("title", [], { limit: 100 })).items.find((item) => item.id === "a")!.listValues,
    ).toEqual({ flag: false, number: 0 });
    for (const [key, value] of [
      ["date", "2026-02-30"],
      ["number", "0"],
      ["flag", 0],
      ["time", "2026-10-25T10:00:00Z"],
    ] as const) {
      const scalarPage = await list(`field:${key}`);
      const boundary = JSON.parse(
        atob(scalarPage.nextCursor!.replace(/-/gu, "+").replace(/_/gu, "/")),
      );
      await expect(
        list(`field:${key}`, [], { after: base64Url({ ...boundary, value }) }),
      ).rejects.toMatchObject({ pointer: "/after" });
    }
    const first = await list("field:area");
    const cursor = first.nextCursor!;
    const decoded = JSON.parse(atob(cursor.replace(/-/gu, "+").replace(/_/gu, "/"))) as Record<
      string,
      unknown
    >;
    for (const change of [
      { id: "absent" },
      { snapshot: "absent" },
      { revision: 99 },
      { rank: 1 },
      { type: "number" },
      { kind: "foreign" },
    ])
      await expect(
        list("field:area", [], { after: base64Url({ ...decoded, ...change }) }),
      ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE", pointer: "/after" });
    // Publication does not alter the current draft identity; public data stays immutable after an edit.
    const anchor = first.items[0]!.id;
    await repository.publish(publish(anchor, 1, 2));
    await expect(list("field:area", [], { after: cursor })).resolves.toMatchObject({
      totals: { published: 1 },
    });
    await expect(repository.saveCompleteDraft(save(anchor, 99, 3))).rejects.toThrow();
    await expect(list("field:area", [], { after: cursor })).resolves.toBeDefined();
    const loaded = await repository.load({ entryId: anchor });
    await repository.saveCompleteDraft(
      save(anchor, 1, 4, {
        fields: { ...loaded!.draft.fields, text: "Edited" },
        title: loaded!.draft.title,
      }),
    );
    await expect(list("field:area", [], { after: cursor })).rejects.toMatchObject({
      pointer: "/after",
    });
    expect((await repository.loadPublished({ entryId: anchor }))!.fields.text).toBe(
      loaded!.draft.fields.text,
    );
    // A deleted boundary is rejected even when no further items would match.
    const final = await list("field:area", [], { limit: 5 });
    const lastCursor = final.nextCursor!;
    const lastId = final.items.at(-1)!.id;
    const last = await repository.load({ entryId: lastId });
    await repository.delete({
      entryId: lastId,
      expectedRevision: last!.draft.revision,
      deletedAt: unixMilliseconds(5),
      deletedBy: editor,
    });
    await expect(list("field:area", [], { after: lastCursor })).rejects.toMatchObject({
      pointer: "/after",
    });
  },
);

contract(
  "bounded string anchors cover long text/select, replacement, foreign models and empty races",
  async (runtime, expect) => {
    const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
    await seedModels(sql, "posts", "settings");
    const long = Array.from({ length: 6000 }, (_, i) =>
      String.fromCharCode(65 + ((i * 7) % 26)),
    ).join("");
    const model = (
      await defineConfig({
        content: [
          defineCollection({
            key: "posts",
            route: "/blog/:slug",
            version: 1,
            fields: {
              text: field.text(),
              choice: field.select({ options: [long + "a", long + "b"] }),
            },
            listOptions: { sortableFields: ["text", "choice"] },
          }),
        ],
      })
    ).runtime.content[0]!;
    for (const [id, value] of [
      ["a", long + "a"],
      ["b", long + "b"],
      ["c", ""],
      ["d", null],
    ] as const)
      await repository.create({
        entry: entry(id, "posts", {
          updatedAt: 1,
          slug: id,
          fields: { text: value, choice: value },
        }),
        mediaReferences: [],
      });
    const list = (sort: string, after?: string, status?: "draft" | "published") =>
      repository.list({
        modelKey: contentModelKey("posts"),
        sort: sort as never,
        listFields: [],
        limit: 1,
        query: resolveCollectionQuery(model, sort, [])!,
        ...(after ? { after: after as never } : {}),
        ...(status ? { status } : {}),
      });
    for (const field of ["text", "choice"])
      for (const desc of [false, true]) {
        const sort = `${desc ? "-" : ""}field:${field}`;
        let after: string | undefined;
        const ids: string[] = [];
        do {
          const result = await list(sort, after);
          ids.push(...result.items.map((row) => row.id));
          after = result.nextCursor;
          if (after) {
            expect(after.length).toBeLessThanOrEqual(4096);
            expect(after).not.toContain(long);
          }
        } while (after);
        expect(ids).toEqual(desc ? ["b", "a", "d", "c"] : ["a", "b", "c", "d"]);
      }
    const first = await list("field:text", undefined, "draft"),
      cursor = first.nextCursor!;
    const anchor = first.items[0]!.id;
    // A foreign model fails even though the snapshot and revision still exist.
    await sql.run("update content_entries set model_key='settings' where id=?", anchor);
    await expect(list("field:text", cursor, "draft")).rejects.toMatchObject({ pointer: "/after" });
    await sql.run("update content_entries set model_key='posts' where id=?", anchor);
    await sql.run(
      "insert into content_snapshots (id, entry_id, revision, slug, title, fields_json, schema_version, created_at, updated_at, updated_by) select 'replacement', entry_id, revision, slug, title, fields_json, schema_version, created_at, updated_at, updated_by from content_snapshots where id=?",
      `${anchor}-draft`,
    );
    await sql.run("update content_entries set draft_snapshot_id='replacement' where id=?", anchor);
    await expect(list("field:text", cursor, "draft")).rejects.toMatchObject({ pointer: "/after" });
    await sql.run(
      "update content_entries set draft_snapshot_id=? where id=?",
      `${anchor}-draft`,
      anchor,
    );
    // An unchanged boundary may leave the status set; its order remains usable.
    await repository.publish(publish(anchor, 1, 2));
    const draftPage = await list("field:text", cursor, "draft");
    expect(draftPage.items[0]!.id).toBe("b");
    for (const id of ["b", "c", "d"]) await repository.publish(publish(id, 1, 2));
    expect((await list("field:text", cursor, "draft")).items).toEqual([]);
    // Races overlap the async fingerprint/planning phase and a successful draft revision update.
    // A single item statement must either see the old snapshot or reject, including zero matches.
    for (const status of ["draft"] as const) {
      const pending = list("field:text", cursor, status).then(
        (page) => ({ page }),
        (error) => ({ error }),
      );
      await sql.run(
        "update content_snapshots set revision=revision+1 where id=?",
        `${anchor}-draft`,
      );
      const result = await pending;
      if ("error" in result) expect(result.error).toMatchObject({ pointer: "/after" });
      else expect(result.page.items.every((row) => row.id !== anchor)).toBe(true);
      await expect(list("field:text", cursor, status)).rejects.toMatchObject({ pointer: "/after" });
      await sql.run("update content_snapshots set revision=1 where id=?", `${anchor}-draft`);
    }
  },
);

contract(
  "query performance is model-scoped with constant first/scalar/string statement counts at 1000 entries",
  async (runtime, expect) => {
    const { repository, sql, reads } = await runtime.open({ resolveModel: resolveRoute });
    await seedModels(sql, "posts", "settings");
    const model = (
      await defineConfig({
        content: [
          defineCollection({
            key: "posts",
            route: "/blog/:slug",
            version: 1,
            fields: { text: field.text(), n: field.number(), flag: field.boolean() },
            listOptions: {
              sortableFields: ["text", "n"],
              filterableFields: ["n", "flag", "text"],
              searchableFields: ["text"],
            },
          }),
        ],
      })
    ).runtime.content[0]!;
    // Set-based fixture loading avoids measuring editorial writes and includes one near-limit draft.
    await sql.run(`with recursive seq(n) as (values(0) union all select n+1 from seq where n<999)
    insert into content_entries (id,model_key,created_by,created_at,updated_at)
    select 'perf-'||printf('%04d',n), case when n%10=0 then 'settings' else 'posts' end,
    'editor',1,n+1 from seq`);
    await sql.run(`with recursive seq(n) as (values(0) union all select n+1 from seq where n<999)
    insert into content_snapshots (id,entry_id,revision,title,fields_json,schema_version,created_at,updated_at,updated_by)
    select 'perf-draft-'||n,'perf-'||printf('%04d',n),1,'Entry '||n,
    json_object('n',n,'flag',json(case when n%2=0 then 'true' else 'false' end),'text',
      case when n=999 then replace(hex(zeroblob(450000)),'0','x')||' needle' else 'Mixed Москва Launch '||printf('%04d',n) end),1,1,1,'editor' from seq`);
    await sql.run(
      "update content_entries set draft_snapshot_id='perf-draft-'||cast(substr(id,6) as integer)",
    );
    const list = (sort: string, limit: number, after?: string, filters: unknown = [], q?: string) =>
      repository.list({
        modelKey: contentModelKey("posts"),
        listFields: [],
        limit,
        sort: sort as never,
        query: resolveCollectionQuery(model, sort, filters)!,
        ...(after ? { after: after as never } : {}),
        ...(q ? { q } : {}),
      });
    const evidence: unknown[] = [];
    for (const sort of ["-updatedAt", "field:n", "field:text"])
      for (const limit of [1, 10, 100]) {
        reads.reset();
        const started = Date.now();
        const first = await list(sort, limit);
        const initial = reads.snapshot();
        expect(initial.statements).toBe(2);
        expect(first.totals.all).toBe(900);
        expect(first.items.length).toBe(limit);
        expect(initial.sql.every((statement) => statement.includes("e.model_key ="))).toBe(true);
        // Only projection JSON may cross the adapter boundary, never a full draft.
        expect(
          initial.sql.every((statement) => !statement.includes("d.fields_json as fields_json")),
        ).toBe(true);
        reads.reset();
        const next = await list(sort, limit, first.nextCursor!);
        const continuation = reads.snapshot();
        expect(continuation.statements).toBe(2);
        expect(next.items.length).toBe(limit);
        evidence.push({
          sort,
          limit,
          ms: Date.now() - started,
          first: initial.statements,
          continuation: continuation.statements,
          ...(initial.rowsRead === undefined
            ? {}
            : { firstRowsRead: initial.rowsRead, continuationRowsRead: continuation.rowsRead }),
        });
      }
    const far = await list(
      "field:n",
      10,
      undefined,
      [{ field: "n", op: "range", min: 990 }],
      "needle",
    );
    expect(far.items.map((row) => row.id)).toEqual(["perf-0999"]);
    // Default list preserves the existing model-entry index.
    const queryPlan = await sql.all<{ detail: string }>(
      "explain query plan select id from content_entries where model_key=? order by updated_at desc,id desc limit 10",
      "posts",
    );
    expect(queryPlan.some((row) => /index/iu.test(row.detail))).toBe(true);
    // Backend limits remain truthful: no partial page is substituted for a database error.
    expect(far.totals.all).toBe(1);
    runtime.recordEvidence?.(evidence);
  },
);

contract(
  "runtime LIKE policies count UTF-8 escapes before SQL while equality keeps 200 units",
  async (runtime, expect) => {
    const { repository, sql, reads } = await runtime.open({ resolveModel: resolveRoute });
    await seedModels(sql, "posts");
    const terms = [
      "a".repeat(48),
      "я".repeat(24),
      "%".repeat(24),
      "_".repeat(24),
      "\\".repeat(24),
      "aя".repeat(16),
      "😀".repeat(12),
      "я".repeat(200),
    ];
    await repository.create({
      entry: entry("budget", "posts", {
        updatedAt: 1,
        title: "Budget",
        fields: { text: terms.join(" separator ") },
      }),
      mediaReferences: [],
    });
    const model = (
      await defineConfig({
        content: [
          defineCollection({
            key: "posts",
            route: "/blog/:slug",
            version: 1,
            fields: { text: field.text() },
            listOptions: { filterableFields: ["text"], searchableFields: ["text"] },
          }),
        ],
      })
    ).runtime.content[0]!;
    const list = (q?: string, filters: unknown = []) =>
      repository.list({
        modelKey: contentModelKey("posts"),
        listFields: [],
        sort: "title",
        limit: 5,
        // Direct callers cannot relax an adapter's own policy.
        listQueryLimits: NODE_LIST_QUERY_LIMITS,
        query: resolveCollectionQuery(model, "title", filters)!,
        ...(q ? { q } : {}),
      });
    for (const value of terms.slice(0, -1)) {
      expect((await list(` ${value} `)).items.map((row) => row.id)).toEqual(["budget"]);
      expect(
        (await list(undefined, [{ field: "text", op: "contains", value }])).items.map(
          (row) => row.id,
        ),
      ).toEqual(["budget"]);
    }
    for (const value of [
      "a".repeat(49),
      "я".repeat(24) + "a",
      "%".repeat(24) + "a",
      "aя".repeat(16) + "a",
      "я".repeat(200),
    ]) {
      reads.reset();
      if (
        runtime.listQueryLimits?.maxLikePatternBytes !== undefined &&
        runtime.listQueryLimits.maxLikePatternBytes !== null
      ) {
        await expect(list(value)).rejects.toMatchObject({ pointer: "/q" });
        await expect(
          list(undefined, [{ field: "text", op: "contains", value }]),
        ).rejects.toMatchObject({ pointer: "/filters/0/value" });
        expect(reads.snapshot().statements).toBe(0);
      } else {
        await expect(list(value)).resolves.toBeDefined();
        await expect(
          list(undefined, [{ field: "text", op: "contains", value }]),
        ).resolves.toBeDefined();
      }
    }
    await sql.run(
      "update content_snapshots set fields_json=? where id='budget-draft'",
      JSON.stringify({ text: "я".repeat(200) }),
    );
    expect(
      (await list(undefined, [{ field: "text", op: "eq", value: "я".repeat(200) }])).items.map(
        (row) => row.id,
      ),
    ).toEqual(["budget"]);
  },
);

contract(
  "stores, filters, counts and deletes media tags atomically without public build effects",
  async (runtime, expect) => {
    const harness = await runtime.open({
      resolveModel: resolveRoute,
      nextId: sequence("tag-work"),
    });
    const { repository, sql } = harness;
    await seedPublishedLifecycle(repository, sql);
    const version = await repository.publishedContentVersion();
    const builds = await pendingBuilds(sql);
    const patch = (id: string, expected: number, time: number, tags: readonly string[]) => ({
      ...metadataUpdate(id, expected, time),
      tags,
      publishedEffect: false,
    });
    await repository.updateMediaMetadata(patch("media-1", 1, 10, [" Birch ", "IBIZA", "birch"]));
    expect((await repository.loadMediaCatalogItem("media-1"))!.media.tags).toEqual([
      "birch",
      "ibiza",
    ]);
    expect(await repository.publishedContentVersion()).toBe(version);
    expect(await pendingBuilds(sql)).toEqual(builds);
    await repository.createMedia({
      id: mediaId("tag-new"),
      storageKey: "tag-new",
      filename: "tag-cover.png",
      mimeType: "image/png",
      size: 2,
      width: 1,
      height: 1,
      createdAt: unixMilliseconds(2),
      createdBy: editor.id,
      tags: ["ibiza", "birch", "red"],
    });
    const created = await repository.loadMedia("tag-new");
    expect(created!.tags).toEqual(["birch", "ibiza", "red"]);
    for (const sort of [
      "createdAt",
      "-createdAt",
      "filename",
      "-filename",
      "size",
      "-size",
    ] as const) {
      const first = await repository.listMedia({ limit: 1, sort, tags: ["Ibiza", "BIRCH"] });
      expect(first.items).toHaveLength(1);
      expect(first.items[0]!.media.tags).toContain("birch");
      const next = await repository.listMedia({
        limit: 1,
        sort,
        tags: ["birch", "ibiza"],
        after: first.nextCursor!,
      });
      expect(next.items).toHaveLength(1);
      expect(next.items[0]!.media.id).not.toBe(first.items[0]!.media.id);
      await expect(
        repository.listMedia({ limit: 1, sort, tags: ["birch"], after: first.nextCursor! }),
      ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    }
    expect(
      (
        await repository.listMedia({
          limit: 10,
          sort: "filename",
          tags: ["birch", "ibiza"],
          q: "tag-cover",
          type: "image/png",
        })
      ).items.map((i) => i.media.id),
    ).toEqual(["tag-new"]);
    expect(
      (await repository.listMedia({ limit: 10, sort: "filename", tags: ["unknown"] })).items,
    ).toEqual([]);
    const catalog = await repository.listMediaTags({ limit: 1 });
    expect(catalog.items).toEqual([{ tag: "birch", count: 2 }]);
    expect(
      (await repository.listMediaTags({ limit: 10, after: catalog.nextCursor! })).items,
    ).toEqual([
      { tag: "ibiza", count: 2 },
      { tag: "red", count: 1 },
    ]);
    expect((await repository.listMediaTags({ limit: 10, q: "RE" })).items).toEqual([
      { tag: "red", count: 1 },
    ]);
    await expect(
      repository.listMediaTags({ limit: 10, q: "re", after: catalog.nextCursor! }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    const state = await mediaMetadataState(sql);
    await expect(
      repository.updateMediaMetadata(patch("media-1", 1, 11, ["stale"])),
    ).rejects.toMatchObject({ code: "MEDIA_UPDATE_CONFLICT" });
    expect(await mediaMetadataState(sql)).toEqual(state);
    const concurrent = await Promise.allSettled([
      repository.updateMediaMetadata(patch("media-1", 10, 11, ["first"])),
      harness.reopen().updateMediaMetadata(patch("media-1", 10, 12, ["second"])),
    ]);
    expect(concurrent.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const loser = concurrent.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(loser.reason).toMatchObject({ code: "MEDIA_UPDATE_CONFLICT" });
    const publicEntry = await repository.loadPublic("/blog/post");
    // Public projections do not select stored organization tags.
    if (publicEntry !== null)
      expect(publicEntry.media.every((m) => m.tags.length === 0)).toBe(true);
    const exported = await readAllBuildContentPages(repository);
    for (const item of exported.entries)
      expect(item.media.every((m) => m.tags.length === 0)).toBe(true);
    const current = (await repository.loadMedia("media-1"))!;
    await repository.updateMediaMetadata(patch("media-1", current.updatedAt, 13, []));
    expect((await repository.loadMedia("media-1"))!.tags).toEqual([]);
    await repository.markForDeletion({
      mediaId: mediaId("tag-new"),
      requestedAt: unixMilliseconds(20),
      requestedBy: editor,
    });
    expect((await repository.listMediaTags({ limit: 10, q: "red" })).items).toEqual([
      { tag: "red", count: 1 },
    ]);
    const leases = await repository.claim({
      eventTypes: ["media.delete.requested"],
      limit: 10,
      now: unixMilliseconds(21),
    });
    await repository.completeMediaDeletion({
      mediaId: mediaId("tag-new"),
      leaseId: leases[0]!.id,
      completedAt: unixMilliseconds(22),
    });
    expect((await repository.listMediaTags({ limit: 10 })).items).toEqual([]);
  },
);

contract(
  "rolls back tag replacement after an injected tag checkpoint failure",
  async (runtime, expect) => {
    let fail = false;
    const { repository, sql } = await runtime.open({
      resolveModel: resolveRoute,
      beforeMutation(name) {
        if (fail && name === "media.tags") throw new Error("injected tag failure");
      },
    });
    await seedPublishedLifecycle(repository, sql);
    await repository.updateMediaMetadata({
      ...metadataUpdate("media-1", 1, 10),
      tags: ["before"],
      publishedEffect: false,
    });
    const before = await mediaMetadataState(sql);
    fail = true;
    await expect(
      repository.updateMediaMetadata({
        ...metadataUpdate("media-1", 10, 11),
        tags: ["after"],
        publishedEffect: false,
      }),
    ).rejects.toThrow();
    expect(await mediaMetadataState(sql)).toEqual(before);
  },
);

contract("enforces the ASCII media tag schema on every SQL runtime", async (runtime, expect) => {
  const { sql } = await runtime.open({ resolveModel: noModels });
  await seedMedia(sql, "schema-tag");
  const insert = (tag: string, id = "schema-tag") =>
    sql.run("insert into media_tags(media_id, tag) values (?, ?)", id, tag);
  await insert("project-2026");
  for (const tag of [
    "project-2026",
    "",
    "a".repeat(41),
    "A",
    "a b",
    "a,b",
    "Выставка",
    "😀",
    "a\u0000",
  ])
    await expect(insert(tag)).rejects.toThrow();
  await expect(insert("valid", "missing")).rejects.toThrow();
});

contract(
  "stores content hashes and filters active media by hash for import lookups",
  async (runtime, expect) => {
    const harness = await runtime.open({ resolveModel: resolveRoute });
    const { repository, sql } = harness;
    await seedPublishedLifecycle(repository, sql);
    const hash = "a".repeat(64);
    const other = "b".repeat(64);
    const create = (id: string, sha256: string, filename: string, createdAt: number) =>
      repository.createMedia({
        id: mediaId(id),
        storageKey: id,
        filename,
        mimeType: "image/png",
        sha256,
        size: createdAt,
        width: 1,
        height: 1,
        createdAt: unixMilliseconds(createdAt),
        createdBy: editor.id,
        tags: id === "hash-b" ? ["kept"] : [],
      });
    await create("hash-a", hash, "a.png", 3);
    await create("hash-b", hash, "b.png", 4);
    await create("hash-c", hash, "c.png", 5);
    await create("hash-other", other, "other.png", 6);
    expect((await repository.loadMedia("hash-a"))!.sha256).toBe(hash);
    expect((await repository.loadMedia("media-1"))!.sha256).toBeUndefined();

    // Metadata and tag updates keep the hash.
    await repository.updateMediaMetadata({
      ...metadataUpdate("hash-a", 3, 10),
      alt: "Alt",
      tags: ["x"],
      publishedEffect: false,
    });
    expect((await repository.loadMediaCatalogItem("hash-a"))!.media.sha256).toBe(hash);

    // Only active items match; deleting items and legacy rows never do.
    await repository.markForDeletion({
      mediaId: mediaId("hash-c"),
      requestedAt: unixMilliseconds(11),
      requestedBy: editor,
    });
    const ids = async (input: Partial<Parameters<typeof repository.listMedia>[0]>) =>
      (await repository.listMedia({ limit: 10, sort: "filename", ...input })).items.map(
        (item) => item.media.id,
      );
    expect(await ids({ sha256: hash })).toEqual(["hash-a", "hash-b"]);
    expect(await ids({ sha256: other })).toEqual(["hash-other"]);
    expect(await ids({ sha256: "c".repeat(64) })).toEqual([]);
    expect(await ids({ sha256: hash, tags: ["kept"] })).toEqual(["hash-b"]);
    expect(await ids({ sha256: hash, q: "b.png", type: "image/png" })).toEqual(["hash-b"]);
    expect(await ids({ sha256: hash, type: "image/gif" })).toEqual([]);
    for (const sort of [
      "createdAt",
      "-createdAt",
      "filename",
      "-filename",
      "size",
      "-size",
    ] as const) {
      const first = await repository.listMedia({ limit: 1, sort, sha256: hash });
      const next = await repository.listMedia({
        limit: 1,
        sort,
        sha256: hash,
        after: first.nextCursor!,
      });
      expect([...first.items, ...next.items].map((i) => i.media.id).sort()).toEqual([
        "hash-a",
        "hash-b",
      ]);
      expect(next.nextCursor).toBeUndefined();
      await expect(
        repository.listMedia({ limit: 1, sort, after: first.nextCursor! }),
      ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
      await expect(
        repository.listMedia({ limit: 1, sort, sha256: other, after: first.nextCursor! }),
      ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    }
    await expect(
      repository.listMedia({ limit: 10, sort: "filename", sha256: hash.toUpperCase() }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });

    // A cursor issued without a hash keeps working without one.
    const plain = await repository.listMedia({ limit: 1, sort: "filename" });
    await expect(
      repository.listMedia({ limit: 1, sort: "filename", after: plain.nextCursor! }),
    ).resolves.toMatchObject({ items: [expect.anything()] });

    // Public projections never select the hash.
    await repository.saveCompleteDraft(
      save("post", 1, 12, {
        fields: { image: "hash-a", title: "Hashed" },
        mediaReferences: [{ fieldPath: "image", mediaId: mediaId("hash-a"), sourceKey: "$fields" }],
        slug: "post",
        title: "Hashed",
      }),
    );
    await repository.publish(publish("post", 2, 13));
    const publicEntry = await repository.loadPublic("/blog/post");
    expect(publicEntry!.media.map((m) => m.id)).toContain("hash-a");
    expect(publicEntry!.media.every((m) => m.sha256 === undefined)).toBe(true);
    expect((await repository.loadPublicMedia("hash-a"))!.sha256).toBeUndefined();
    const exported = await readAllBuildContentPages(repository);
    for (const item of exported.entries)
      expect(item.media.every((m) => m.sha256 === undefined)).toBe(true);

    await expect(
      sql.run("update media set sha256 = ? where id = 'media-2'", "A".repeat(64)),
    ).rejects.toThrow();
    await expect(
      sql.run("update media set sha256 = ? where id = 'media-2'", "a".repeat(63)),
    ).rejects.toThrow();
  },
);

contract(
  "filters entry lists by exact current draft slug for import lookups",
  async (runtime, expect) => {
    const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
    await seedModels(sql, "posts");
    const create = (id: string, slug: string, title: string, updatedAt: number) =>
      repository.create({
        entry: entry(id, "posts", { slug, title, updatedAt }),
        mediaReferences: [],
      });
    await create("about-1", "about", "About one", 1);
    await create("about-2", "about", "About two", 2);
    await create("about-us", "about-us", "About us", 3);
    await create("renamed", "old", "Renamed", 4);
    await repository.publish(publish("renamed", 1, 5));
    await repository.saveCompleteDraft(save("renamed", 1, 6, { slug: "new", title: "Renamed" }));
    const listInput = {
      limit: 10,
      listFields: [],
      modelKey: contentModelKey("posts"),
      sort: "-updatedAt" as const,
    };
    const about = await repository.list({ ...listInput, slug: "about" });
    expect(about.items.map((item) => item.id)).toEqual(["about-2", "about-1"]);
    expect(about.totals).toEqual({ all: 2, changed: 0, draft: 2, published: 0 });
    expect(
      (await repository.list({ ...listInput, slug: "new" })).items.map((item) => item.id),
    ).toEqual(["renamed"]);
    expect((await repository.list({ ...listInput, slug: "old" })).items).toEqual([]);
    expect(
      (await repository.list({ ...listInput, slug: "about", q: "two" })).items.map((i) => i.id),
    ).toEqual(["about-2"]);
    expect(
      (await repository.list({ ...listInput, slug: "new", status: "changed" })).totals,
    ).toMatchObject({ all: 1, changed: 1 });
    expect(
      (await repository.list({ ...listInput, slug: "about", sort: "title" })).items.map(
        (i) => i.id,
      ),
    ).toEqual(["about-1", "about-2"]);
    const first = await repository.list({ ...listInput, limit: 1, slug: "about" });
    const next = await repository.list({
      ...listInput,
      limit: 1,
      slug: "about",
      after: first.nextCursor!,
    });
    expect(next.items.map((item) => item.id)).toEqual(["about-1"]);
    await expect(
      repository.list({ ...listInput, limit: 1, slug: "about-us", after: first.nextCursor! }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    await expect(
      repository.list({ ...listInput, limit: 1, after: first.nextCursor! }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
  },
);

declare function atob(data: string): string;
