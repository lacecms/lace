import { ContentUseCases, prepareConfigurationSynchronization } from "@lacecms/application";

import { readAllBuildContentPages } from "../build-export.js";
import { defineCollection, defineConfig, defineGlobal, definePage } from "@lacecms/config";

import { defineBlock, field } from "@lacecms/content";
import type { BlockDefinition } from "@lacecms/content";
import {
  blockKey,
  contentEntryId,
  contentModelKey,
  contentSnapshotId,
  mediaId,
  unixMilliseconds,
} from "@lacecms/domain";
import type { ContentBlock, ContentEntry } from "@lacecms/domain";

import {
  type ContractSql,
  type RepositoryContractCase,
  editor,
  admin,
  resolveRoute,
  sequence,
  count,
  seedModels,
  seedMedia,
  entry,
  heroBlock,
  save,
  publish,
  syncResolver,
  applySync,
  registerContract,
} from "./shared.js";
import { lifecycleState } from "./lifecycle.js";
import {
  evolvingPosts,
  seedEvolvingEntries,
  block,
  noteConfig,
  prepareNotes,
  syncNotes,
  note,
} from "./sync.js";
import { metadataUpdate } from "./media.js";
export const cases: RepositoryContractCase[] = [];
const contract = registerContract(cases);
export function envelopeBlock(
  key: string,
  image: string,
  envelope: Partial<Pick<ContentBlock, "anchor" | "className" | "hidden" | "settings">>,
  position = 1000,
): ContentBlock {
  return Object.freeze({ ...heroBlock(key, image, key, "hero", position), ...envelope });
}

export function blockReference(media: string, key: string) {
  return Object.freeze({ fieldPath: "image", mediaId: mediaId(media), sourceKey: blockKey(key) });
}

async function envelopeRows(sql: ContractSql) {
  return sql.all(
    "select snapshot_id, block_key, anchor, class_name, hidden, settings_json from content_blocks order by snapshot_id, position",
  );
}

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

contract(
  "migration scans count model lists and every unchanged hidden block before writes",
  async (runtime, expect) => {
    const other = defineBlock({
      type: "other",
      version: 1,
      fields: { rows: field.list({ item: field.text() }) },
    });
    const old = defineBlock({ type: "note", version: 1, fields: { image: field.media() } });
    const next = defineBlock({
      type: "note",
      version: 2,
      fields: { images: field.list({ item: field.media() }) },
      migrations: { 2: ({ data }) => ({ data: { images: [data.image!] } }) },
    });
    const configuration = (note: BlockDefinition, version: number) =>
      defineConfig({
        blocks: [other, note],
        content: [
          defineCollection({
            key: "posts",
            version,
            route: "/blog/:slug",
            blocks: ["note", "other"],
            fields: { rows: field.list({ item: field.text() }) },
          }),
        ],
      });
    const before = await configuration(old, 1);
    const after = await configuration(next, 2);
    const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
    await syncNotes(repository, before, 1);
    await seedMedia(sql, "m-1");
    const blocks: ContentBlock[] = [
      note("n1", { image: "m-1" }, 1000),
      ...Array.from({ length: 4 }, (_, i) => ({
        ...note(`n${i + 2}`, { rows: Array(100).fill("x") }, (i + 2) * 1000),
        type: "other",
        hidden: true,
      })),
    ];
    await repository.create({
      entry: entry("budget", "posts", {
        blocks,
        fields: { rows: Array(100).fill("x") },
        slug: "budget",
        updatedAt: 2,
      }),
      mediaReferences: [{ sourceKey: blockKey("n1"), fieldPath: "image", mediaId: mediaId("m-1") }],
    });
    const refused = await prepareNotes(repository, after);
    expect(refused.plan.isValid).toBe(false);
    expect(refused.report.text).toContain("too_many_list_items");
    expect(
      (await repository.load({ entryId: contentEntryId("budget") }))!.draft.blocks[0]!
        .schemaVersion,
    ).toBe(1);
    await repository.saveCompleteDraft({
      entryId: contentEntryId("budget"),
      mutation: {
        blocks,
        fields: { rows: Array(99).fill("x") },
        expectedRevision: 1,
        title: "Budget",
        slug: "budget",
        updatedBy: editor,
        updatedAt: unixMilliseconds(5),
        mediaReferences: [
          { sourceKey: blockKey("n1"), fieldPath: "image", mediaId: mediaId("m-1") },
        ],
      },
    });
    await repository.publish(publish("budget", 2, 6, "budget-published"));
    const prepared = await prepareNotes(repository, after);
    expect(prepared.plan.isValid).toBe(true);
    await syncNotes(repository, after, 10, prepared);
    const loaded = (await repository.load({ entryId: contentEntryId("budget") }))!;
    for (const snapshot of [loaded.draft, loaded.published!]) {
      expect(snapshot.blocks[0]).toMatchObject({ schemaVersion: 2, data: { images: ["m-1"] } });
      expect(snapshot.fields.rows).toHaveLength(99);
      expect(
        await sql.get(
          "select field_path from content_media_references where snapshot_id = ? and source_key = 'n1'",
          snapshot.id,
        ),
      ).toEqual({ field_path: "/images/0" });
    }
    expect((await prepareNotes(repository, after)).plan.isValid).toBe(true);
    const incompatible = await defineConfig({
      blocks: [other, next],
      content: [
        defineCollection({
          key: "posts",
          version: 3,
          route: "/blog/:slug",
          blocks: ["note", "other"],
          fields: { rows: field.list({ item: field.text(), maxItems: 90 }) },
        }),
      ],
    });
    const state = await lifecycleState(sql);
    const refusedEvolution = await prepareNotes(repository, incompatible);
    expect(refusedEvolution.plan.diagnostics).toContainEqual(
      expect.objectContaining({ code: "CONSTRAINT_VIOLATED" }),
    );
    await expect(syncNotes(repository, incompatible, 12, refusedEvolution)).rejects.toThrow();
    expect(await lifecycleState(sql)).toEqual(state);
  },
);

contract(
  "nested synchronization rewrites parent/child hints and references atomically",
  async (runtime, expect) => {
    const v1 = await evolvingPosts({
      blocks: ["image"],
      fields: {
        links: field.list({
          item: field.group({
            fields: { headline: field.text(), photo: field.media(), legacy: field.media() },
          }),
        }),
        optional: field.group({ fields: { note: field.text() } }),
        required: field.text({ required: true }),
      },
    });
    const v2 = await evolvingPosts({
      version: 2,
      blocks: ["image"],
      removedFields: ["/cards/*/legacy"],
      fields: {
        cards: field.list({
          renamedFrom: "links",
          item: field.group({
            fields: {
              title: field.text({ renamedFrom: "headline" }),
              image: field.media({ renamedFrom: "photo" }),
              caption: field.text({ defaultValue: "new" }),
              requiredChild: field.text({ required: true }),
            },
          }),
        }),
        optional: field.group({ fields: { note: field.text({ defaultValue: "optional" }) } }),
        required: field.text({ required: true }),
      },
    });
    let fail = false;
    const { repository, sql } = await runtime.open({
      resolveModel: syncResolver([v1]),
      beforeMutation(checkpoint) {
        if (fail && checkpoint === "sync.model.rewrite-fields.1")
          throw new Error("nested injected failure");
      },
    });
    await applySync(repository, [v1], 1);
    await seedMedia(sql, "nested-keep");
    await seedMedia(sql, "nested-drop");
    const originalFields = {
      links: [
        { headline: "First", photo: "nested-keep", legacy: "nested-drop" },
        { headline: "Second" },
      ],
      optional: {},
    };
    await repository.create({
      entry: entry("nested", "posts", {
        fields: originalFields,
        slug: "nested",
        updatedAt: 2,
        blocks: [
          {
            data: { image: "nested-keep" },
            hidden: true,
            key: blockKey("retained"),
            position: 1000,
            schemaVersion: 1,
            settings: {},
            type: "image",
          },
        ],
      }),
      mediaReferences: [
        { sourceKey: blockKey("retained"), fieldPath: "image", mediaId: mediaId("nested-keep") },
        { sourceKey: "$fields", fieldPath: "/links/0/photo", mediaId: mediaId("nested-keep") },
        { sourceKey: "$fields", fieldPath: "/links/0/legacy", mediaId: mediaId("nested-drop") },
      ],
    });
    await repository.publish(publish("nested", 1, 3, "nested-publication"));
    await expect(
      repository.markForDeletion({
        mediaId: mediaId("nested-drop"),
        requestedBy: editor,
        requestedAt: unixMilliseconds(3),
      }),
    ).rejects.toMatchObject({ code: "MEDIA_IN_USE" });
    const before = await lifecycleState(sql);
    const prepared = await prepareConfigurationSynchronization({ models: [v2], state: repository });
    expect(prepared.plan.isValid).toBe(true);
    expect(await lifecycleState(sql)).toEqual(before);
    fail = true;
    await expect(applySync(repository, [v2], 4, prepared)).rejects.toThrow();
    expect(await lifecycleState(sql)).toEqual(before);
    expect((await repository.readConfigurationSyncState())[0]!.version).toBe(1);
    fail = false;
    const version = await repository.publishedContentVersion();
    await expect(applySync(repository, [v2], 5, prepared)).resolves.toMatchObject({
      status: "applied",
      targetVersion: version + 1,
    });
    const loaded = (await repository.load({ entryId: contentEntryId("nested") }))!;
    for (const snapshot of [loaded.draft, loaded.published!]) {
      expect(snapshot.fields).toEqual({
        cards: [
          { title: "First", image: "nested-keep", caption: "new" },
          { title: "Second", caption: "new" },
        ],
        optional: { note: "optional" },
      });
      expect(snapshot.revision).toBe(1);
      expect(snapshot.updatedAt).toBe(snapshot.state === "draft" ? 2 : 3);
      expect(
        await sql.all(
          "select source_key,field_path,media_id from content_media_references where snapshot_id=? order by source_key",
          snapshot.id,
        ),
      ).toEqual([
        { source_key: "$fields", field_path: "/cards/0/image", media_id: "nested-keep" },
        { source_key: "retained", field_path: "image", media_id: "nested-keep" },
      ]);
    }
    expect(await repository.loadMediaUsage({ mediaId: mediaId("nested-drop"), limit: 20 })).toEqual(
      [],
    );
    expect(await count(sql, "select count(*) as count from outbox_events")).toBe(1);
    await expect(
      repository.markForDeletion({
        mediaId: mediaId("nested-drop"),
        requestedBy: editor,
        requestedAt: unixMilliseconds(6),
      }),
    ).resolves.toMatchObject({ status: "deleting" });
    const completed = await lifecycleState(sql);
    await expect(applySync(repository, [v2], 6)).resolves.toMatchObject({ status: "noop" });
    expect(await lifecycleState(sql)).toEqual(completed);
  },
);

contract(
  "nested synchronization scans and rewrites multiple snapshot pages and rejects stale saves/publication/duplication",
  async (runtime, expect) => {
    const v1 = await evolvingPosts({
      blocks: [],
      fields: { profile: field.group({ fields: { name: field.text() } }) },
    });
    const v2 = await evolvingPosts({
      version: 2,
      blocks: [],
      fields: {
        profile: field.group({
          fields: {
            title: field.text({ renamedFrom: "name" }),
            enabled: field.boolean({ defaultValue: true }),
          },
        }),
      },
    });
    const { repository, sql, reopen } = await runtime.open({ resolveModel: syncResolver([v1]) });
    await applySync(repository, [v1], 1);
    for (let index = 0; index < 103; index++)
      await repository.create({
        entry: entry(`nested-${index}`, "posts", {
          fields: index === 0 ? {} : { profile: { name: String(index) } },
          slug: `nested-${index}`,
          updatedAt: 2,
        }),
        mediaReferences: [],
      });
    const prepared = await prepareConfigurationSynchronization({ models: [v2], state: repository });
    expect(prepared.plan.isValid).toBe(true);
    expect(prepared.plan.operations[0]).toMatchObject({
      evolution: { snapshots: { draft: 103, published: 0 } },
    });
    await reopen().saveCompleteDraft({
      entryId: contentEntryId("nested-1"),
      mutation: {
        blocks: [],
        fields: { profile: { name: "new" } },
        expectedRevision: 1,
        title: "Saved",
        updatedAt: unixMilliseconds(3),
        updatedBy: editor,
        mediaReferences: [],
      },
    });
    const changed = await lifecycleState(sql);
    await expect(applySync(repository, [v2], 4, prepared)).rejects.toThrow();
    expect(await lifecycleState(sql)).toEqual(changed);
    const beforePublication = await prepareConfigurationSynchronization({
      models: [v2],
      state: repository,
    });
    await repository.publish(publish("nested-2", 1, 4, "nested-2-published"));
    const published = await lifecycleState(sql);
    await expect(applySync(repository, [v2], 5, beforePublication)).rejects.toThrow();
    expect(await lifecycleState(sql)).toEqual(published);
    const beforeDuplicate = await prepareConfigurationSynchronization({
      models: [v2],
      state: repository,
    });
    await repository.create({
      duplicateOf: { entryId: contentEntryId("nested-2"), expectedRevision: 1 },
      entry: entry("nested-duplicate", "posts", {
        fields: { profile: { name: "2" } },
        updatedAt: 5,
      }),
      mediaReferences: [],
    });
    const duplicated = await lifecycleState(sql);
    await expect(applySync(repository, [v2], 6, beforeDuplicate)).rejects.toThrow();
    expect(await lifecycleState(sql)).toEqual(duplicated);
    await applySync(repository, [v2], 7);
    expect((await repository.load({ entryId: contentEntryId("nested-0") }))!.draft.fields).toEqual(
      {},
    );
    expect((await repository.load({ entryId: contentEntryId("nested-1") }))!.draft.fields).toEqual({
      profile: { title: "new", enabled: true },
    });
    expect(
      await count(
        sql,
        "select count(*) as count from content_snapshots where json_extract(fields_json,'$.profile.enabled')=1",
      ),
    ).toBe(104);
  },
);

contract(
  "nested model defaults compose with block migration budgets before any writes",
  async (runtime, expect) => {
    const other = defineBlock({
      type: "other",
      version: 1,
      fields: { rows: field.list({ item: field.text() }) },
    });
    const old = defineBlock({
      type: "note",
      version: 1,
      fields: { label: field.text() },
      settings: { tone: field.select({ options: ["dark", "light"], defaultValue: "dark" }) },
    });
    const next = defineBlock({
      type: "note",
      version: 2,
      fields: { rows: field.list({ item: field.text() }) },
      settings: { tone: field.select({ options: ["dark", "light"], defaultValue: "dark" }) },
      migrations: { 2: ({ settings }) => ({ data: { rows: Array(30).fill("m") }, settings }) },
    });
    const config = (noteBlock: BlockDefinition, version: number, added = 0) =>
      defineConfig({
        blocks: [other, noteBlock],
        content: [
          defineCollection({
            key: "posts",
            route: "/blog/:slug",
            version,
            blocks: ["other", "note"],
            fields: {
              rows: field.list({ item: field.text() }),
              required: field.text({ required: true }),
              profile: field.group({
                fields: added
                  ? {
                      extra: field.list({
                        item: field.text(),
                        defaultValue: Array(added).fill("f"),
                      }),
                    }
                  : {},
              }),
            },
          }),
        ],
      });
    const beforeConfig = await config(old, 1);
    const overflowConfig = await config(next, 2, 20);
    const validConfig = await config(next, 2, 10);
    const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
    await syncNotes(repository, beforeConfig, 1);
    await repository.create({
      entry: entry("nested-budget", "posts", {
        slug: "budget",
        updatedAt: 2,
        fields: { rows: Array(60).fill("x"), profile: {} },
        blocks: [
          { ...note("migration", { label: "old" }), settings: { tone: "light" } },
          ...Array.from({ length: 4 }, (_, index) => ({
            ...note(`kept-${index}`, { rows: Array(100).fill("x") }, (index + 3) * 1000),
            type: "other",
            hidden: true,
          })),
        ],
      }),
      mediaReferences: [],
    });
    await repository.publish(publish("nested-budget", 1, 3, "nested-budget-publication"));
    const before = await lifecycleState(sql);
    const refused = await prepareNotes(repository, overflowConfig);
    expect(refused.plan.isValid).toBe(false);
    expect(refused.plan.diagnostics).toContainEqual(
      expect.objectContaining({ code: "BACKFILL_EXCEEDS_LIMIT" }),
    );
    await expect(syncNotes(repository, overflowConfig, 4, refused)).rejects.toThrow();
    expect(await lifecycleState(sql)).toEqual(before);
    const valid = await prepareNotes(repository, validConfig);
    expect(valid.plan.isValid).toBe(true);
    await syncNotes(repository, validConfig, 5, valid);
    const loaded = (await repository.load({ entryId: contentEntryId("nested-budget") }))!;
    for (const snapshot of [loaded.draft, loaded.published!]) {
      expect(snapshot.fields.profile).toEqual({ extra: Array(10).fill("f") });
      expect(snapshot.blocks[0]).toMatchObject({
        schemaVersion: 2,
        data: { rows: Array(30).fill("m") },
        settings: { tone: "light" },
      });
    }
  },
);

contract(
  "nested synchronization refuses type loss, bounds and media defaults without writes",
  async (runtime, expect) => {
    const v1 = await evolvingPosts({
      blocks: [],
      fields: {
        links: field.list({
          item: field.group({ fields: { title: field.text(), image: field.media() } }),
        }),
      },
    });
    const { repository, sql } = await runtime.open({ resolveModel: syncResolver([v1]) });
    await applySync(repository, [v1], 1);
    await seedEvolvingEntries(repository, {
      draft: { links: [] },
      published: { links: [{ title: "stored" }] },
    });
    const baseline = await lifecycleState(sql);
    const scenarios = [
      {
        definition: field.list({ item: field.group({ fields: { image: field.media() } }) }),
        code: "FIELD_REMOVAL_HAS_DATA",
      },
      {
        definition: field.list({
          item: field.group({ fields: { title: field.number(), image: field.media() } }),
        }),
        code: "FIELD_TYPE_CHANGED",
      },
      {
        definition: field.list({
          maxItems: 0,
          item: field.group({ fields: { title: field.text(), image: field.media() } }),
        }),
        code: "CONSTRAINT_VIOLATED",
      },
      {
        definition: field.list({
          minItems: 2,
          item: field.group({ fields: { title: field.text(), image: field.media() } }),
        }),
        code: "CONSTRAINT_VIOLATED",
        count: 1,
      },
      {
        definition: field.list({
          item: field.group({
            fields: { title: field.text(), image: field.media({ defaultValue: "media-default" }) },
          }),
        }),
        code: "MEDIA_DEFAULT_BACKFILL_UNSUPPORTED",
      },
    ];
    for (const scenario of scenarios) {
      const v2 = await evolvingPosts({
        version: 2,
        blocks: [],
        fields: { links: scenario.definition },
      });
      const prepared = await prepareConfigurationSynchronization({
        models: [v2],
        state: repository,
      });
      expect(prepared.plan.diagnostics).toContainEqual(
        expect.objectContaining({
          code: scenario.code,
          ...(scenario.count === undefined ? {} : { affectedCount: scenario.count }),
        }),
      );
      await expect(applySync(repository, [v2], 30, prepared)).rejects.toThrow();
      expect(await lifecycleState(sql)).toEqual(baseline);
    }
    const valid = await evolvingPosts({
      version: 2,
      blocks: [],
      fields: {
        links: field.list({
          minItems: 1,
          item: field.group({
            fields: {
              title: field.text({ required: true }),
              image: field.media(),
              newRequired: field.text({ required: true }),
            },
          }),
        }),
      },
    });
    await expect(applySync(repository, [valid], 31)).resolves.toMatchObject({ status: "applied" });
    expect(
      (await repository.load({ entryId: contentEntryId("draft-only") }))!.draft.fields,
    ).toEqual({ links: [] });
  },
);

contract(
  "CE9A placeholder-only sync preserves populated snapshots and stale guards",
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
                    title: field.text({ ...(placeholder === undefined ? {} : { placeholder }) }),
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
      fields: { nested: { title: "Stored" } },
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
contract(
  "CE9B layout-only sync preserves populated snapshots and stale guards",
  async (runtime, expect) => {
    const make = async (label?: string) =>
      (
        await defineConfig({
          blocks: [
            defineBlock({
              type: "layout",
              version: 1,
              fields: { title: field.text() },
              settings: { size: field.number({ defaultValue: 1 }) },
              ...(label === undefined
                ? {}
                : {
                    layout: { mode: "tabs", groups: [{ key: "main", label, fields: ["title"] }] },
                    settingsLayout: {
                      mode: "sections",
                      groups: [{ key: "style", label, fields: ["size"] }],
                    },
                  }),
            }),
          ],
          content: [
            defineCollection({
              key: "posts",
              route: "/posts/:slug",
              version: 1,
              blocks: ["layout"],
              ...(label === undefined
                ? {}
                : {
                    layout: { mode: "tabs", groups: [{ key: "main", label, fields: ["nested"] }] },
                  }),
              fields: {
                nested: field.group({
                  fields: {
                    title: field.text(),
                    photo: field.media(),
                    links: field.list({ item: field.text() }),
                  },
                  ...(label === undefined
                    ? {}
                    : {
                        layout: {
                          mode: "sections",
                          groups: [{ key: "main", label, fields: ["title", "photo", "links"] }],
                        },
                      }),
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
    await seedMedia(sql, "layout-media");
    const created = entry("guidance-entry", "posts", {
      updatedAt: 15,
      slug: "guidance",
      fields: { nested: { title: "Stored", photo: "layout-media", links: ["first", "second"] } },
      blocks: [
        { ...block("layout-key", "layout", 1000, { title: "Block" }), settings: { size: 2 } },
      ],
    });
    await repository.create({
      entry: created,
      mediaReferences: [
        { sourceKey: "$fields", fieldPath: "/nested/photo", mediaId: mediaId("layout-media") },
      ],
    });
    await repository.publish(publish("guidance-entry", 1, 20));
    const before = await repository.load({ entryId: created.id });
    const unchanged = async () => ({
      references: await sql.all("select * from content_media_references order by snapshot_id"),
      published: await sql.all("select * from published_state"),
      outbox: await sql.all("select * from outbox_events"),
    });
    const state = await unchanged();
    for (const [index, placeholder] of ["Title", "New title", undefined].entries()) {
      const models = await make(placeholder);
      expect(models[0]!.structureHash).toBe(original[0]!.structureHash);
      const plan = await prepareConfigurationSynchronization({ models, state: repository });
      expect(plan.plan.operations).toMatchObject([{ action: "label-update" }]);
      await applySync(repository, models, 30 + index, plan);
      expect(await repository.load({ entryId: created.id })).toEqual(before);
      const nextState = await unchanged();
      expect(nextState.references).toEqual(state.references);
      expect(nextState.published).toMatchObject([{ version: 3 + index }]);
      expect(nextState.outbox).toHaveLength(1);
      expect(
        JSON.parse((nextState.outbox[0] as { payload_json: string }).payload_json),
      ).toMatchObject({ reason: "configuration_sync", targetVersion: 3 + index });
      expect(
        (await prepareConfigurationSynchronization({ models, state: repository })).plan.operations,
      ).toEqual([]);
    }
    const models = await make("Stale");
    const plan = await prepareConfigurationSynchronization({ models, state: repository });
    const beforeStale = await unchanged();
    await sql.run(
      "update content_models set projection_hash = ? where key = ?",
      "concurrent",
      "posts",
    );
    await expect(applySync(repository, models, 40, plan)).rejects.toMatchObject({
      code: "CONTENT_INVALID_STATE",
    });
    expect(await repository.load({ entryId: created.id })).toEqual(before);
    expect(await unchanged()).toEqual(beforeStale);
  },
);

/** Media IDs each page entry and global delivers, in path then key order. */
