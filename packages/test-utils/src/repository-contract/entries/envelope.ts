import { envelopeBlock, blockReference } from "../entries/fixtures.js";
import { ContentUseCases } from "@lacecms/application";
import { readAllBuildContentPages } from "../../delivery/build-export.js";
import { defineCollection, defineConfig, defineGlobal, definePage } from "@lacecms/config";
import { defineBlock, field } from "@lacecms/content";

import {
  blockKey,
  contentEntryId,
  contentModelKey,
  contentSnapshotId,
  mediaId,
  unixMilliseconds,
} from "@lacecms/domain";
import type { ContentEntry } from "@lacecms/domain";
import {
  type ContractSql,
  type RepositoryContractCase,
  editor,
  admin,
  resolveRoute,
  sequence,
  seedModels,
  seedMedia,
  entry,
  save,
  publish,
  syncResolver,
  registerContract,
} from "../shared.js";

import { noteConfig, prepareNotes, syncNotes, note } from "../sync/fixtures.js";
import { metadataUpdate } from "../media/fixtures.js";

export const cases: RepositoryContractCase[] = [];
const contract = registerContract(cases);

async function envelopeRows(sql: ContractSql) {
  return sql.all(
    "select snapshot_id, block_key, anchor, class_name, hidden, settings_json from content_blocks order by snapshot_id, position",
  );
}

const panelV1 = defineBlock({
  fields: { body: field.text() },
  settings: { tone: field.text({ defaultValue: "light" }) },
  type: "note",
  version: 1,
});

const panelV2 = defineBlock({
  fields: { body: field.text() },
  migrations: {
    2: ({ data, settings: { tone = "light", ...rest } }) => ({
      data,
      settings: { ...rest, theme: tone },
    }),
  },
  settings: {
    align: field.select({ defaultValue: "left", options: ["left", "center"] }),
    theme: field.text({ defaultValue: "light" }),
  },
  type: "note",
  version: 2,
});

contract(
  "persists and copies block envelopes through save, publish, revert and duplicate",
  async (runtime, expect) => {
    const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
    await seedModels(sql, "posts");
    for (const id of ["media-1", "media-2"]) await seedMedia(sql, id);
    const shown = envelopeBlock("b1", "media-1", {
      anchor: "pricing",
      className: "wide md:w-1/2",
      settings: { align: "center", boxed: true },
    });
    const hidden = envelopeBlock("b2", "media-2", { hidden: true, settings: {} }, 2000);
    await repository.create({
      entry: entry("post", "posts", { blocks: [shown, hidden], slug: "post", updatedAt: 1 }),
      mediaReferences: [blockReference("media-1", "b1"), blockReference("media-2", "b2")],
    });
    expect(await envelopeRows(sql)).toEqual([
      {
        anchor: "pricing",
        block_key: "b1",
        class_name: "wide md:w-1/2",
        hidden: 0,
        settings_json: '{"align":"center","boxed":true}',
        snapshot_id: "post-draft",
      },
      {
        anchor: null,
        block_key: "b2",
        class_name: null,
        hidden: 1,
        settings_json: "{}",
        snapshot_id: "post-draft",
      },
    ]);
    expect((await repository.load({ entryId: contentEntryId("post") }))!.draft.blocks).toEqual([
      shown,
      hidden,
    ]);

    // The published copy shares the draft's anchors: uniqueness is per snapshot.
    await repository.publish(publish("post", 1, 2, "post-published"));
    const published = (await repository.load({ entryId: contentEntryId("post") }))!;
    expect(published.published!.blocks).toEqual([shown, hidden]);

    const changed = envelopeBlock("b1", "media-1", { settings: { align: "left" } });
    await repository.saveCompleteDraft(
      save("post", 1, 3, {
        blocks: [changed],
        mediaReferences: [blockReference("media-1", "b1")],
        slug: "post",
      }),
    );
    const saved = (await repository.load({ entryId: contentEntryId("post") }))!;
    expect(saved.draft.blocks).toEqual([changed]);
    expect(saved.published!.blocks).toEqual([shown, hidden]);

    await repository.revertDraft({
      entryId: contentEntryId("post"),
      expectedPublishedSnapshotId: contentSnapshotId("post-published"),
      expectedRevision: 2,
      revertedAt: unixMilliseconds(4),
      revertedBy: editor,
    });
    expect((await repository.load({ entryId: contentEntryId("post") }))!.draft.blocks).toEqual([
      shown,
      hidden,
    ]);

    const copyBlocks = [
      envelopeBlock("c1", "media-1", { anchor: "pricing", className: "wide md:w-1/2" }),
      envelopeBlock("c2", "media-2", { hidden: true }, 2000),
    ];
    await repository.create({
      duplicateOf: { entryId: contentEntryId("post"), expectedRevision: 3 },
      entry: entry("copy", "posts", { blocks: copyBlocks, updatedAt: 5 }),
      mediaReferences: [blockReference("media-1", "c1"), blockReference("media-2", "c2")],
    });
    expect((await repository.load({ entryId: contentEntryId("copy") }))!.draft.blocks).toEqual(
      copyBlocks,
    );
  },
);

contract(
  "leaves hidden blocks and their exclusive media out of public delivery",
  async (runtime, expect) => {
    const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
    await seedModels(sql, "posts", "settings");
    for (const id of ["media-1", "media-2", "media-3"]) await seedMedia(sql, id);
    await repository.create({
      entry: entry("post", "posts", {
        blocks: [
          envelopeBlock("b1", "media-1", { anchor: "top" }),
          envelopeBlock("b2", "media-2", { hidden: true }, 2000),
          // media-1 is also held by a hidden block; the visible use keeps it public.
          envelopeBlock("b3", "media-1", { hidden: true }, 3000),
        ],
        slug: "post",
        updatedAt: 1,
      }),
      mediaReferences: [
        blockReference("media-1", "b1"),
        blockReference("media-2", "b2"),
        blockReference("media-1", "b3"),
      ],
    });
    await repository.publish(publish("post", 1, 2, "post-published"));
    await repository.create({
      entry: entry("settings", "settings", {
        blocks: [envelopeBlock("g1", "media-3", { hidden: true })],
        fields: { image: "media-1", title: "Lace" },
        title: "Site settings",
        updatedAt: 3,
      }),
      mediaReferences: [
        { fieldPath: "image", mediaId: mediaId("media-1"), sourceKey: "$fields" as const },
        blockReference("media-3", "g1"),
      ],
    });
    await repository.publish(publish("settings", 1, 4, "settings-published"));

    const keys = (value: { readonly entry: ContentEntry } | null) =>
      value!.entry.published!.blocks.map((block) => block.key as string);
    const mediaIds = (value: { readonly media: readonly { readonly id: string }[] } | null) =>
      value!.media.map((media) => media.id);
    const byPath = await repository.loadPublic("/blog/post");
    expect(keys(byPath)).toEqual(["b1"]);
    expect(byPath!.entry.published!.blocks[0]).toMatchObject({ anchor: "top", hidden: false });
    expect(mediaIds(byPath)).toEqual(["media-1"]);
    const page = await repository.listPublic({ limit: 10, modelKey: contentModelKey("posts") });
    expect(keys(page.items[0]!)).toEqual(["b1"]);
    expect(mediaIds(page.items[0]!)).toEqual(["media-1"]);
    const global = await repository.loadPublicGlobal(contentModelKey("settings"));
    expect(keys(global)).toEqual([]);
    expect(mediaIds(global)).toEqual(["media-1"]);
    const exported = await readAllBuildContentPages(repository);
    expect(keys(exported.entries[0]!)).toEqual(["b1"]);
    expect(exported.entries.flatMap(mediaIds)).toEqual(["media-1"]);
    expect(keys(exported.globals[0]!)).toEqual([]);
    expect(mediaIds(exported.globals[0]!)).toEqual(["media-1"]);
    expect(await repository.loadPublicMedia(mediaId("media-1"))).not.toBeNull();
    expect(await repository.loadPublicMedia(mediaId("media-2"))).toBeNull();
    expect(await repository.loadPublicMedia(mediaId("media-3"))).toBeNull();

    // Hidden blocks stay stored, so their media stays protected and listed.
    await expect(
      repository.markForDeletion({
        mediaId: mediaId("media-2"),
        requestedAt: unixMilliseconds(5),
        requestedBy: editor,
      }),
    ).rejects.toMatchObject({ code: "MEDIA_IN_USE" });
    expect(await repository.loadMediaUsage({ limit: 50, mediaId: mediaId("media-2") })).toEqual([
      expect.objectContaining({
        entryId: "post",
        locations: [
          {
            blockKey: "b2",
            blockType: "hero",
            field: "image",
            source: "block",
            states: ["draft", "published"],
          },
        ],
      }),
    ]);
    expect(
      (await repository.load({ entryId: contentEntryId("post") }))!.published!.blocks.map(
        (block) => block.key as string,
      ),
    ).toEqual(["b1", "b2", "b3"]);
  },
);

contract(
  "block migrations rewrite settings and keep anchors, class names and hidden flags",
  async (runtime, expect) => {
    const v1 = await noteConfig(panelV1, 1);
    const { repository, sql } = await runtime.open({
      resolveModel: syncResolver(v1.runtime.content),
    });
    await syncNotes(repository, v1, 10);
    const stored = Object.freeze({
      ...note("n1", { body: "Live" }),
      anchor: "intro",
      className: "lead",
      hidden: true,
      settings: { tone: "dark" },
    });
    await repository.create({
      entry: entry("live", "posts", {
        blocks: [stored],
        slug: "live",
        title: "Live",
        updatedAt: 20,
      }),
      mediaReferences: [],
    });
    await repository.publish(publish("live", 1, 21, "live-published"));

    const v2 = await noteConfig(panelV2, 2);
    const prepared = await prepareNotes(repository, v2);
    expect(prepared.plan.isValid).toBe(true);
    await syncNotes(repository, v2, 30, prepared);
    expect(await envelopeRows(sql)).toEqual(
      ["live-draft", "live-published"].map((snapshot) => ({
        anchor: "intro",
        block_key: "n1",
        class_name: "lead",
        hidden: 1,
        settings_json: '{"align":"left","theme":"dark"}',
        snapshot_id: snapshot,
      })),
    );
    const live = (await repository.load({ entryId: contentEntryId("live") }))!;
    expect(live.draft.blocks[0]).toMatchObject({ schemaVersion: 2, settings: { theme: "dark" } });
    expect(live.published!.blocks[0]).toMatchObject({ anchor: "intro", hidden: true });
  },
);

contract(
  "preserves composite JSON and nested media through the complete lifecycle",
  async (runtime, expect) => {
    const config = await defineConfig({
      blocks: [
        defineBlock({
          type: "nested",
          version: 1,
          fields: {
            images: field.list({ item: field.group({ fields: { image: field.media() } }) }),
          },
        }),
      ],
      content: [
        defineCollection({
          key: "posts",
          version: 1,
          route: "/blog/:slug",
          blocks: ["nested"],
          fields: {
            team: field.list({ item: field.group({ fields: { photo: field.media() } }) }),
            empty: field.group({ fields: {} }),
          },
        }),
        definePage({
          key: "home",
          version: 1,
          path: "/",
          blocks: [],
          fields: { images: field.list({ item: field.media() }) },
        }),
        defineGlobal({
          key: "settings",
          version: 1,
          blocks: [],
          fields: { images: field.list({ item: field.media() }) },
        }),
      ],
    });
    const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
    await seedModels(sql, "posts", "home", "settings");
    for (const id of ["visible", "hidden", "draft-only"]) await seedMedia(sql, id);
    const useCases = new ContentUseCases({
      clock: { now: () => unixMilliseconds(10) },
      config: config.runtime,
      content: repository,
      media: repository,
      idGenerator: { next: sequence("composite") },
    });
    const blocks = [
      {
        type: "nested",
        schemaVersion: 1,
        key: blockKey("nested"),
        position: 1000,
        hidden: true,
        data: { images: [{ image: "hidden" }] },
      },
    ];
    const created = await useCases.create({
      actor: editor,
      modelKey: "posts",
      title: "Nested",
      slug: "nested",
      blocks,
      fields: { team: [{ photo: "visible" }], empty: {} },
    });
    const references = () =>
      sql.all(
        "select source_key, field_path, media_id from content_media_references where snapshot_id = ? order by source_key, field_path",
        created.draft.id,
      );
    expect(await references()).toEqual([
      { source_key: "$fields", field_path: "/team/0/photo", media_id: "visible" },
      { source_key: "nested", field_path: "/images/0/image", media_id: "hidden" },
    ]);
    await useCases.publish({ actor: admin, entryId: created.id, expectedRevision: 1 });
    expect(await repository.loadPublic("/blog/nested")).toMatchObject({
      entry: { published: { fields: { team: [{ photo: "visible" }], empty: {} }, blocks: [] } },
    });
    expect(await repository.loadPublicMedia("visible")).not.toBeNull();
    expect(await repository.loadPublicMedia("hidden")).toBeNull();
    expect((await readAllBuildContentPages(repository)).entries[0]).toMatchObject({
      entry: { published: { fields: created.draft.fields, blocks: [] } },
    });
    const listed = await repository.listPublic({ limit: 10, modelKey: contentModelKey("posts") });
    expect(listed.items[0]!.entry.published!.fields).toEqual(created.draft.fields);
    for (const modelKey of ["home", "settings"]) {
      const singleton = await useCases.create({
        actor: editor,
        modelKey,
        title: "Singleton",
        fields: { images: ["visible"] },
        blocks: [],
      });
      await useCases.publish({ actor: admin, entryId: singleton.id, expectedRevision: 1 });
    }
    expect((await repository.loadPublic("/"))!.entry.published!.fields).toEqual({
      images: ["visible"],
    });
    expect(
      (await repository.loadPublicGlobal(contentModelKey("settings")))!.entry.published!.fields,
    ).toEqual({ images: ["visible"] });
    expect(
      (await readAllBuildContentPages(repository)).globals[0]!.entry.published!.fields,
    ).toEqual({
      images: ["visible"],
    });
    const version = await repository.publishedContentVersion();
    expect(
      (await repository.updateMediaMetadata(metadataUpdate("hidden", 1, 11, { alt: "Hidden" })))
        .targetVersion,
    ).toBe(version + 1);
    expect(
      (await repository.loadMediaUsage({ limit: 50, mediaId: mediaId("hidden") }))[0]!.locations,
    ).toContainEqual({
      source: "block",
      blockKey: "nested",
      blockType: "nested",
      field: "/images/0/image",
      states: ["draft", "published"],
    });
    const saved = await useCases.save({
      actor: editor,
      entryId: created.id,
      expectedRevision: 1,
      title: "Changed",
      slug: "nested",
      blocks,
      fields: { team: [{ photo: "draft-only" }, { photo: "visible" }], empty: {} },
    });
    expect(await references()).toEqual([
      { source_key: "$fields", field_path: "/team/0/photo", media_id: "draft-only" },
      { source_key: "$fields", field_path: "/team/1/photo", media_id: "visible" },
      { source_key: "nested", field_path: "/images/0/image", media_id: "hidden" },
    ]);
    expect(await repository.loadPublicMedia("draft-only")).toBeNull();
    await expect(
      useCases.save({
        actor: editor,
        entryId: created.id,
        expectedRevision: 1,
        title: "Stale",
        blocks: [],
        fields: {},
      }),
    ).rejects.toMatchObject({ code: "CONTENT_REVISION_CONFLICT" });
    const duplicate = await useCases.duplicate({
      actor: editor,
      entryId: created.id,
      expectedRevision: saved.draft.revision,
    });
    expect(duplicate.draft.fields).toEqual(saved.draft.fields);
    expect(duplicate.draft.blocks[0]!.key).not.toBe("nested");
    expect(
      await sql.get(
        "select source_key, field_path from content_media_references where snapshot_id = ? and media_id = 'hidden'",
        duplicate.draft.id,
      ),
    ).toEqual({ source_key: duplicate.draft.blocks[0]!.key, field_path: "/images/0/image" });
    const reverted = await useCases.revertDraft({
      actor: editor,
      entryId: created.id,
      expectedRevision: 2,
    });
    expect(reverted.draft.fields).toEqual(created.draft.fields);
    expect(await references()).not.toContainEqual(
      expect.objectContaining({ media_id: "draft-only" }),
    );
    await useCases.delete({ actor: editor, entryId: duplicate.id, expectedRevision: 1 });
    await useCases.delete({
      actor: admin,
      entryId: created.id,
      expectedRevision: reverted.draft.revision,
    });
    expect(
      (
        await repository.markForDeletion({
          mediaId: mediaId("hidden"),
          requestedBy: editor,
          requestedAt: unixMilliseconds(12),
        })
      ).status,
    ).toBe("deleting");
  },
);
