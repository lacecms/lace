import { ContentUseCases, prepareConfigurationSynchronization } from "@lacecms/application";

import { defineCollection, defineConfig } from "@lacecms/config";

import { builtInBlocks, defineBlock, field } from "@lacecms/content";
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
  "presentation-only sync preserves populated snapshots and stale guards",
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

contract(
  "mixed galleries publish only the shown values of each item kind",
  async (runtime, expect) => {
    const config = await defineConfig({
      blocks: [builtInBlocks.gallery],
      content: [
        defineCollection({ key: "posts", route: "/blog/:slug", version: 1, blocks: ["gallery"] }),
      ],
    });
    const { repository, sql } = await runtime.open({
      resolveModel: syncResolver(config.runtime.content),
    });
    await syncNotes(repository, config, 10);
    await seedMedia(sql, "m-1");
    const data = {
      images: [{ media: "m-1", alt: "Kitchen", caption: "Before", link: "/work/kitchen" }],
    };
    const settings = { lightbox: true, layoutMode: "flex-row", layoutWrap: false };
    const block = {
      key: blockKey("gallery-0"),
      type: "gallery",
      schemaVersion: 6,
      position: 1000,
      hidden: false,
      data: {
        images: [
          {
            kind: "image",
            ...data.images[0],
            aspectRatio: "16:9",
            placement: "auto",
            playback: "ambient",
            size: "fill",
          },
        ],
      },
      settings,
    };
    await repository.create({
      entry: entry("gallery-mixed", "posts", {
        blocks: [block],
        slug: "gallery",
        title: "Gallery",
        updatedAt: 20,
      }),
      mediaReferences: [
        { sourceKey: block.key, fieldPath: "/images/0/media", mediaId: mediaId("m-1") },
      ],
    });
    const migrated = (await repository.load({ entryId: contentEntryId("gallery-mixed") }))!;
    const mediaRows = () =>
      sql.all(
        "select snapshot_id, source_key, field_path from content_media_references order by snapshot_id, source_key",
      );
    const blocks = [block];
    const after = config;

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
      images: [
        { kind: "image", ...data.images[0], placement: "auto", size: "fill" },
        { ...video, placement: "auto" },
      ],
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
  "setting visibility sync preserves content, retains build behavior and validates inactive values",
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
