import { prepareConfigurationSynchronization } from "@lacecms/application";

import { defineCollection, defineConfig } from "@lacecms/config";
import { defineBlock, field } from "@lacecms/content";
import type { BlockDefinition } from "@lacecms/content";
import { blockKey, contentEntryId, mediaId, unixMilliseconds } from "@lacecms/domain";
import type { ContentBlock } from "@lacecms/domain";
import {
  type RepositoryContractCase,
  editor,
  resolveRoute,
  count,
  seedMedia,
  entry,
  publish,
  syncResolver,
  applySync,
  registerContract,
} from "../shared.js";
import { lifecycleState } from "../entries/fixtures.js";
import {
  evolvingPosts,
  seedEvolvingEntries,
  prepareNotes,
  syncNotes,
  note,
} from "../sync/fixtures.js";

export const cases: RepositoryContractCase[] = [];
const contract = registerContract(cases);

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
