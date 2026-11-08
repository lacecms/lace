import { noteV1, noteV3, noteConfig, prepareNotes, syncNotes, note } from "../sync/fixtures.js";

import { defineCollection, defineConfig } from "@lacecms/config";

import { builtInBlocks, defineBlock, field, validateBlockData } from "@lacecms/content";

import { blockKey, contentEntryId, mediaId } from "@lacecms/domain";

import {
  type ContractRepository,
  type RepositoryContractCase,
  count,
  seedMedia,
  entry,
  save,
  publish,
  syncResolver,
  registerContract,
} from "../shared.js";
import { richTextBlock, noteState, openNotes } from "../sync/fixtures.js";

export const cases: RepositoryContractCase[] = [];
const contract = registerContract(cases);

contract(
  "migrates stale blocks from version 1 to 3 in drafts and published snapshots",
  async (runtime, expect) => {
    const { repository, sql } = await openNotes(runtime);
    const before = await noteState(sql);
    const v3 = await noteConfig(noteV3(), 2);
    const prepared = await prepareNotes(repository, v3);
    expect(prepared.plan).toMatchObject({
      isValid: true,
      operations: [
        {
          action: "version-update",
          evolution: {
            migrations: [
              {
                blockType: "note",
                blocks: 5,
                draft: 3,
                fromVersions: [1],
                published: 2,
                toVersion: 3,
              },
            ],
          },
        },
      ],
    });
    expect(prepared.report.text).toContain(
      "planned block migrations: note 1 -> 3 (draft=3, published=2, blocks=5)",
    );
    expect(prepared.report.check.exitCode).toBe(1);
    expect(await noteState(sql)).toEqual(before);

    await expect(syncNotes(repository, v3, 30, prepared)).resolves.toMatchObject({
      migrated: { blocks: 5, drafts: 3, published: 2 },
      status: "applied",
      targetVersion: before.version! + 1,
    });
    expect(await count(sql, "select count(*) as count from outbox_events")).toBe(1);
    expect(await sql.all("select config_version from content_models")).toEqual([
      { config_version: 2 },
    ]);

    const draftOnly = (await repository.load({ entryId: contentEntryId("draft-only") }))!;
    expect(draftOnly.draft).toMatchObject({
      revision: 2,
      updatedAt: 30,
      updatedBy: { id: "system:content-sync" },
    });
    expect(draftOnly.draft.blocks).toEqual([
      { ...richTextBlock("text-1") },
      {
        data: { cover: "m-1", text: "Draft note" },
        hidden: false,
        key: "n1",
        position: 2000,
        schemaVersion: 3,
        settings: {},
        type: "note",
      },
    ]);
    const live = (await repository.load({ entryId: contentEntryId("live") }))!;
    expect([live.draft.revision, live.published!.revision]).toEqual([2, 2]);
    expect(live.published).toMatchObject({ createdAt: 22, updatedBy: { id: "editor" } });
    const changed = (await repository.load({ entryId: contentEntryId("changed") }))!;
    expect([changed.draft.revision, changed.published!.revision]).toEqual([3, 1]);
    expect(changed.draft.blocks[0]!.data).toEqual({ text: "New" });
    expect(changed.published!.blocks[0]!.data).toEqual({ text: "Old" });

    const definition = v3.runtime.blocks.get("note")!;
    for (const value of [live.published!, changed.published!]) {
      for (const stored of value.blocks) {
        expect(stored.schemaVersion).toBe(definition.version);
        expect(() => validateBlockData(definition, stored.data, "publish")).not.toThrow();
      }
    }
    expect(
      await sql.all(
        "select snapshot_id, source_key, field_path from content_media_references where media_id = 'm-1'",
      ),
    ).toEqual([{ field_path: "cover", snapshot_id: "draft-only-draft", source_key: "n1" }]);
    expect((await repository.loadMediaCatalogItem("m-1"))!.usageCount).toBe(1);

    await expect(syncNotes(repository, v3, 31)).resolves.toMatchObject({ status: "noop" });
    await expect(repository.saveCompleteDraft(save("draft-only", 1, 40))).rejects.toMatchObject({
      code: "CONTENT_REVISION_CONFLICT",
    });
  },
);

contract(
  "refuses throwing, invalid and media-introducing migrations without writing",
  async (runtime, expect) => {
    const { repository, sql } = await openNotes(runtime);
    const before = await noteState(sql);
    const refusals = [
      [
        noteV3({
          3: () => {
            throw new Error("boom");
          },
        }),
        "BLOCK_MIGRATION_FAILED",
      ],
      [noteV3({ 3: () => ({ data: {} }) }), "BLOCK_MIGRATION_INVALID"],
      [
        noteV3({ 3: ({ data: { quote } }) => ({ data: { cover: "m-2", text: quote ?? "x" } }) }),
        "BLOCK_MIGRATION_INVALID",
      ],
    ] as const;
    for (const [definition, code] of refusals) {
      const config = await noteConfig(definition, 2);
      const prepared = await prepareNotes(repository, config);
      expect(prepared.plan.isValid).toBe(false);
      expect(prepared.plan.diagnostics).toMatchObject([{ blockType: "note", code }]);
      await expect(syncNotes(repository, config, 30, prepared)).rejects.toMatchObject({
        code: "CONTENT_INVALID_STATE",
      });
    }
    const invalid = await prepareNotes(
      repository,
      await noteConfig(noteV3({ 3: () => ({ data: {} }) }), 2),
    );
    // Drafts validate in draft mode; only published snapshots lack the required text.
    expect(invalid.plan.diagnostics[0]).toMatchObject({ affectedCount: 2 });
    expect(invalid.plan.diagnostics[0]!.snapshots).toMatchObject([
      { blockKey: "n1", entryId: "changed", path: "data.text", state: "published" },
      { blockKey: "n1", entryId: "live", path: "data.text", state: "published" },
    ]);
    expect(await noteState(sql)).toEqual(before);
  },
);

contract(
  "refuses stored built-in blocks below their version without writing",
  async (runtime, expect) => {
    const gallery = builtInBlocks.gallery;
    const old = defineBlock({
      fields: gallery.fields,
      settings: gallery.settings!,
      type: "gallery",
      version: 4,
    });
    const make = (block: typeof gallery, version: number) =>
      defineConfig({
        blocks: [block],
        content: [
          defineCollection({ blocks: ["gallery"], key: "posts", route: "/blog/:slug", version }),
        ],
      });
    const before = await make(old, 1);
    const after = await make(gallery, 2);
    const { repository, sql } = await runtime.open({
      resolveModel: syncResolver(before.runtime.content),
    });
    await syncNotes(repository, before, 10);
    await repository.create({
      entry: entry("old-gallery", "posts", {
        blocks: [
          {
            data: { images: [] },
            hidden: false,
            key: blockKey("g1"),
            position: 1000,
            schemaVersion: 4,
            settings: {},
            type: "gallery",
          },
        ],
        slug: "old-gallery",
        title: "Old gallery",
        updatedAt: 20,
      }),
      mediaReferences: [],
    });
    const state = await noteState(sql);
    const prepared = await prepareNotes(repository, after);
    expect(prepared.plan.isValid).toBe(false);
    expect(prepared.plan.diagnostics).toMatchObject([
      { blockType: "gallery", code: "BLOCK_MIGRATION_MISSING" },
    ]);
    await expect(syncNotes(repository, after, 30, prepared)).rejects.toMatchObject({
      code: "CONTENT_INVALID_STATE",
    });
    expect(await noteState(sql)).toEqual(state);
  },
);

contract(
  "resumes block migration and nested backfills after an interrupted synchronization",
  async (runtime, expect) => {
    const harness = await openNotes(runtime);
    const { repository, sql } = harness;
    const before = await noteState(sql);
    const v3 = await defineConfig({
      blocks: [...Object.values(builtInBlocks), noteV3()],
      content: [
        defineCollection({
          key: "posts",
          route: "/blog/:slug",
          version: 2,
          blocks: ["richText", "note"],
          fields: {
            summary: field.text(),
            profile: field.group({
              defaultValue: {},
              fields: { flag: field.text({ defaultValue: "on" }) },
            }),
          },
        }),
      ],
    });
    let checkpoints = 0;
    const failing = harness.reopen({
      beforeMutation: (name) => {
        if (name.startsWith("sync.migration.") && ++checkpoints === 3) {
          throw new Error("injected failure");
        }
      },
      resolveModel: syncResolver(v3.runtime.content),
    });
    await expect(syncNotes(failing, v3, 30)).rejects.toMatchObject({
      code: "CONTENT_INVALID_STATE",
    });
    const interrupted = await noteState(sql);
    expect(interrupted.models).toEqual(before.models);
    expect(interrupted.version).toBe(before.version);
    expect(interrupted.outbox).toBe(before.outbox);
    expect(
      interrupted.snapshots.every(
        (row) => JSON.parse(row.fields_json as string).profile === undefined,
      ),
    ).toBe(true);

    await expect(syncNotes(repository, v3, 30)).resolves.toMatchObject({ status: "applied" });
    const resumed = await noteState(sql);
    expect(resumed.blocks.filter((row) => row.block_type === "note")).toEqual(
      resumed.blocks
        .filter((row) => row.block_type === "note")
        .map((row) => ({ ...row, schema_version: 3 })),
    );
    expect(resumed.snapshots.map((row) => [row.id, row.revision])).toEqual([
      ["changed-draft", 3],
      ["changed-published", 1],
      ["draft-only-draft", 2],
      ["live-draft", 2],
      ["live-published", 2],
    ]);
    expect(resumed.models).toMatchObject([{ config_version: 2, has_baseline: 1 }]);
    expect(resumed.version).toBe(before.version! + 1);
    for (const row of resumed.snapshots)
      expect(JSON.parse(row.fields_json as string).profile).toEqual({ flag: "on" });
    expect(await count(sql, "select count(*) as count from outbox_events")).toBe(1);
    await expect(syncNotes(repository, v3, 31)).resolves.toMatchObject({ status: "noop" });
  },
);

contract(
  "stops block migration as stale when a draft is saved after the scan",
  async (runtime, expect) => {
    const { repository, sql } = await openNotes(runtime);
    const before = await noteState(sql);
    const v3 = await noteConfig(noteV3(), 2);
    const racing: ContractRepository = Object.assign(
      Object.create(repository) as ContractRepository,
      {
        async applyConfigurationSyncBlockMigrations(
          input: Parameters<ContractRepository["applyConfigurationSyncBlockMigrations"]>[0],
        ) {
          await repository.saveCompleteDraft(save("changed", 2, 26, { slug: "changed" }));
          return repository.applyConfigurationSyncBlockMigrations(input);
        },
      },
    );
    await expect(syncNotes(racing, v3, 30)).rejects.toMatchObject({
      code: "CONFIGURATION_SYNC_STALE",
    });
    const stopped = await noteState(sql);
    expect(stopped.models).toEqual(before.models);
    expect(stopped.version).toBe(before.version);

    await expect(syncNotes(repository, v3, 31)).resolves.toMatchObject({ status: "applied" });
    const changed = (await repository.load({ entryId: contentEntryId("changed") }))!;
    expect(changed.draft).toMatchObject({ blocks: [], revision: 3 });
    expect(changed.published).toMatchObject({ revision: 1 });
    expect(changed.published!.blocks[0]).toMatchObject({ data: { text: "Old" }, schemaVersion: 3 });
  },
);

contract(
  "migrates entries holding the maximum blocks and references within budgets",
  async (runtime, expect) => {
    const v1 = await noteConfig(noteV1, 1);
    const { repository, sql } = await runtime.open({
      resolveModel: syncResolver(v1.runtime.content),
    });
    await syncNotes(repository, v1, 10);
    await seedMedia(sql, "m-1");
    const blocks = Array.from({ length: 200 }, (_, index) =>
      note(`n${index}`, { body: `Note ${index}`, image: "m-1" }, index + 1),
    );
    await repository.create({
      entry: entry("big", "posts", { blocks, slug: "big", title: "Big", updatedAt: 20 }),
      mediaReferences: blocks.map((value) => ({
        fieldPath: "image",
        mediaId: mediaId("m-1"),
        sourceKey: value.key,
      })),
    });
    await repository.publish(publish("big", 1, 21, "big-published"));
    const v3 = await noteConfig(noteV3(), 2);
    await expect(syncNotes(repository, v3, 30)).resolves.toMatchObject({
      migrated: { blocks: 400, drafts: 1, published: 1 },
      status: "applied",
    });
    const big = (await repository.load({ entryId: contentEntryId("big") }))!;
    expect([big.draft.revision, big.published!.revision]).toEqual([2, 2]);
    expect(big.published!.blocks.at(-1)).toMatchObject({
      data: { cover: "m-1", text: "Note 199" },
      position: 200,
      schemaVersion: 3,
    });
    expect(
      await sql.all(
        "select field_path, count(*) as count from content_media_references group by field_path",
      ),
    ).toEqual([{ count: 400, field_path: "cover" }]);
  },
);
