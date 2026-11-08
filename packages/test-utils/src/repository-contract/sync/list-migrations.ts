import { ContentUseCases, prepareConfigurationSynchronization } from "@lacecms/application";

import { defineCollection, defineConfig } from "@lacecms/config";

import { builtInBlocks, defineBlock, field } from "@lacecms/content";
import type { BlockDefinition } from "@lacecms/content";
import { blockKey, contentEntryId, mediaId, unixMilliseconds } from "@lacecms/domain";

import {
  type RepositoryContractCase,
  editor,
  admin,
  sequence,
  seedMedia,
  entry,
  publish,
  syncResolver,
  applySync,
  registerContract,
} from "../shared.js";

import { prepareNotes, syncNotes } from "../sync/fixtures.js";

export const cases: RepositoryContractCase[] = [];
const contract = registerContract(cases);

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
      code: "CONFIGURATION_SYNC_STALE",
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
      code: "CONFIGURATION_SYNC_STALE",
    });
    expect(await state()).toEqual(afterSync);
  },
);
