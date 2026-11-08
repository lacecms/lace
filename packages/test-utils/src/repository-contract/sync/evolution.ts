import { evolvingPosts, seedEvolvingEntries } from "../sync/fixtures.js";
import { prepareConfigurationSynchronization } from "@lacecms/application";
import { defineCollection, defineConfig } from "@lacecms/config";
import type { CollectionModelInput } from "@lacecms/config";
import { builtInBlocks, defineBlock, field } from "@lacecms/content";
import type { BlockDefinition } from "@lacecms/content";
import { contentEntryId, mediaId, unixMilliseconds } from "@lacecms/domain";

import {
  type RepositoryContractCase,
  editor,
  count,
  seedMedia,
  entry,
  save,
  publish,
  syncResolver,
  applySync,
  registerContract,
} from "../shared.js";
import {
  richTextBlock,
  syncEvidenceState,
  seedHintedEntries,
  hintedState,
  hintedFieldsV1,
  conditionalFields,
} from "../sync/fixtures.js";

export const cases: RepositoryContractCase[] = [];
const contract = registerContract(cases);

contract(
  "evolves a populated model with compatible changes and backfills defaults",
  async (runtime, expect) => {
    const v1 = await evolvingPosts();
    const { repository, sql } = await runtime.open({ resolveModel: syncResolver([v1]) });
    await applySync(repository, [v1], 10);
    expect(
      await sql.get(
        "select structure_json_hash = structure_hash as valid from content_models where key = 'posts'",
      ),
    ).toEqual({ valid: 1 });
    await seedEvolvingEntries(repository, { draft: { summary: "a" }, published: { summary: "b" } });
    const before = await syncEvidenceState(sql);

    const v2 = await evolvingPosts({
      blocks: ["richText", "image", "quote", "cta"],
      fields: {
        extra: field.text(),
        flag: field.text({ defaultValue: "on", required: true }),
        mandatory: field.text({ required: true }),
        summary: field.text({ maxLength: 200 }),
      },
      version: 2,
    });
    const prepared = await prepareConfigurationSynchronization({ models: [v2], state: repository });
    expect(prepared.plan).toMatchObject({
      isValid: true,
      operations: [
        {
          action: "version-update",
          evolution: { backfills: ["flag"], snapshots: { draft: 2, published: 1 } },
        },
      ],
    });
    await expect(applySync(repository, [v2], 30, prepared)).resolves.toMatchObject({
      status: "applied",
      targetVersion: before.version! + 1,
    });
    expect(await count(sql, "select count(*) as count from outbox_events")).toBe(1);
    const draftOnly = await repository.load({ entryId: contentEntryId("draft-only") });
    const live = await repository.load({ entryId: contentEntryId("live") });
    expect(draftOnly!.draft).toMatchObject({ fields: { flag: "on", summary: "a" }, revision: 1 });
    expect(live!.draft).toMatchObject({ fields: { flag: "on", summary: "b" }, revision: 1 });
    expect(live!.published).toMatchObject({ fields: { flag: "on", summary: "b" }, revision: 1 });
    expect(draftOnly!.draft.updatedAt).toBe(20);
    expect(await sql.get("select config_version from content_models")).toEqual({
      config_version: 2,
    });
    await expect(applySync(repository, [v2], 31)).resolves.toMatchObject({ status: "noop" });
  },
);

contract(
  "refuses a failing tightening by naming snapshots and applies a satisfied one",
  async (runtime, expect) => {
    const v1 = await evolvingPosts();
    const { repository, sql } = await runtime.open({ resolveModel: syncResolver([v1]) });
    await applySync(repository, [v1], 10);
    await seedEvolvingEntries(repository, {
      draft: { summary: "far too long" },
      published: { summary: "also long" },
    });
    const before = await syncEvidenceState(sql);

    const tight = await evolvingPosts({
      fields: { summary: field.text({ maxLength: 3 }) },
      version: 2,
    });
    const refused = await prepareConfigurationSynchronization({
      models: [tight],
      state: repository,
    });
    expect(refused.plan.isValid).toBe(false);
    expect(refused.plan.diagnostics).toMatchObject([
      {
        affectedCount: 3,
        code: "CONSTRAINT_VIOLATED",
        fieldKey: "summary",
        snapshots: [
          { entryId: "draft-only", state: "draft", title: "Draft" },
          { entryId: "live", state: "draft", title: "Live" },
          { entryId: "live", state: "published", title: "Live" },
        ],
      },
    ]);
    await expect(applySync(repository, [tight], 30, refused)).rejects.toMatchObject({
      code: "CONTENT_INVALID_STATE",
    });
    expect(await syncEvidenceState(sql)).toEqual(before);

    const satisfied = await evolvingPosts({
      fields: { summary: field.text({ maxLength: 20, required: true }) },
      version: 2,
    });
    await expect(applySync(repository, [satisfied], 31)).resolves.toMatchObject({
      status: "applied",
    });
    expect((await syncEvidenceState(sql)).snapshots).toEqual(before.snapshots);
  },
);

contract(
  "removes unused fields and block types but refuses removing or changing stored data",
  async (runtime, expect) => {
    const v1 = await evolvingPosts({
      fields: { legacy: field.text(), summary: field.text() },
    });
    const { repository, sql } = await runtime.open({ resolveModel: syncResolver([v1]) });
    await applySync(repository, [v1], 10);
    await seedEvolvingEntries(
      repository,
      { draft: { summary: "a" }, published: { summary: "b" } },
      [richTextBlock("text-1")],
    );

    const pruned = await evolvingPosts({
      blocks: ["richText", "image"],
      fields: { summary: field.text() },
      version: 2,
    });
    await expect(applySync(repository, [pruned], 30)).resolves.toMatchObject({
      status: "applied",
    });
    const before = await syncEvidenceState(sql);

    const richTextV2 = defineBlock({
      fields: { content: field.richText({ required: true }), lead: field.text() },
      type: "richText",
      version: 2,
    });
    const destructive = await evolvingPosts(
      { blocks: ["image"], fields: {}, version: 3 },
      Object.values(builtInBlocks),
    );
    const plan = await prepareConfigurationSynchronization({
      models: [destructive],
      state: repository,
    });
    expect(plan.plan.diagnostics).toMatchObject([
      { blockType: "richText", code: "BLOCK_TYPE_REMOVAL_HAS_BLOCKS", affectedCount: 1 },
      { code: "FIELD_REMOVAL_HAS_DATA", fieldKey: "summary", affectedCount: 3 },
    ]);

    const withRichText = (definition: BlockDefinition) => [
      ...Object.values(builtInBlocks).filter((block) => block.type !== "richText"),
      definition,
    ];
    const richTextSameVersion = defineBlock({
      fields: { content: field.richText({ required: true }), lead: field.text() },
      type: "richText",
      version: 1,
    });
    const unversioned = await evolvingPosts(
      { blocks: ["richText", "image"], fields: { summary: field.text() }, version: 3 },
      withRichText(richTextSameVersion),
    );
    const migration = await prepareConfigurationSynchronization({
      models: [unversioned],
      state: repository,
    });
    expect(migration.plan.diagnostics).toMatchObject([
      {
        blockType: "richText",
        code: "BLOCK_DEFINITION_CHANGE_HAS_BLOCKS",
        changeClass: "migration",
      },
    ]);
    expect(migration.plan.diagnostics[0]!.message).toContain(
      "Increase the block version and declare migrations.",
    );
    await expect(applySync(repository, [unversioned], 31, migration)).rejects.toMatchObject({
      code: "CONTENT_INVALID_STATE",
    });

    const missingConfig = await defineConfig({
      blocks: withRichText(richTextV2),
      content: [
        defineCollection({
          blocks: ["richText", "image"],
          fields: { summary: field.text() },
          key: "posts",
          route: "/blog/:slug",
          version: 3,
        }),
      ],
    });
    const missing = await prepareConfigurationSynchronization({
      blocks: missingConfig.runtime.blocks,
      models: missingConfig.runtime.content,
      state: repository,
    });
    expect(missing.plan.diagnostics).toMatchObject([
      { affectedCount: 1, blockType: "richText", code: "BLOCK_MIGRATION_MISSING" },
    ]);
    expect(missing.plan.diagnostics[0]!.snapshots).toMatchObject([
      { blockKey: "text-1", entryId: "draft-only", schemaVersion: 1, state: "draft" },
    ]);
    expect(await syncEvidenceState(sql)).toEqual(before);
  },
);

contract(
  "prepares check plans without writing and rejects them after a concurrent draft save",
  async (runtime, expect) => {
    const v1 = await evolvingPosts();
    const { repository, sql } = await runtime.open({ resolveModel: syncResolver([v1]) });
    await applySync(repository, [v1], 10);
    await seedEvolvingEntries(repository, { draft: {}, published: {} });
    const before = await syncEvidenceState(sql);

    const v2 = await evolvingPosts({
      fields: { flag: field.text({ defaultValue: "on" }), summary: field.text({ maxLength: 50 }) },
      version: 2,
    });
    const prepared = await prepareConfigurationSynchronization({ models: [v2], state: repository });
    expect(prepared.report.check.exitCode).toBe(1);
    expect(prepared.report.text).toContain("planned backfills: flag");
    expect(prepared.report.text).toContain("validated field-changed field summary");
    expect(await syncEvidenceState(sql)).toEqual(before);

    await repository.saveCompleteDraft(save("draft-only", 1, 40));
    await expect(applySync(repository, [v2], 41, prepared)).rejects.toMatchObject({
      code: "CONFIGURATION_SYNC_STALE",
    });
    const after = await syncEvidenceState(sql);
    expect(after.models).toEqual(before.models);
    expect(after.version).toBe(before.version);
    expect(after.outbox).toBe(before.outbox);
    expect(after.snapshots.some((row) => String(row.fields_json).includes("flag"))).toBe(false);
  },
);

contract(
  "records baselines for upgraded installations without a build, then evolves",
  async (runtime, expect) => {
    const v1 = await evolvingPosts();
    const { repository, sql } = await runtime.open({ resolveModel: syncResolver([v1]) });
    await applySync(repository, [v1], 10);
    await seedEvolvingEntries(repository, { draft: {}, published: {} });
    await sql.run("update content_models set structure_json = null, structure_json_hash = null");
    const v2 = await evolvingPosts({
      fields: { extra: field.text(), summary: field.text({ maxLength: 100 }) },
      version: 2,
    });

    const strict = await prepareConfigurationSynchronization({ models: [v2], state: repository });
    expect(strict.plan.diagnostics).toMatchObject([{ code: "STRUCTURE_BASELINE_MISSING" }]);
    expect(strict.plan.diagnostics[0]!.message).toContain("Restore the previous definition");

    const before = await syncEvidenceState(sql);
    const baseline = await prepareConfigurationSynchronization({ models: [v1], state: repository });
    expect(baseline.plan.operations).toMatchObject([{ action: "record-baseline" }]);
    await expect(applySync(repository, [v1], 30, baseline)).resolves.toMatchObject({
      status: "applied",
    });
    const recorded = await syncEvidenceState(sql);
    expect(recorded.version).toBe(before.version);
    expect(recorded.outbox).toBe(before.outbox);
    expect(recorded.models).toMatchObject([{ has_baseline: 1 }]);
    await expect(applySync(repository, [v2], 31)).resolves.toMatchObject({ status: "applied" });

    await sql.run("update content_models set structure_hash = 'written-by-older-engine'");
    expect((await repository.readConfigurationSyncState())[0]).not.toHaveProperty("structure");
  },
);

contract(
  "prunes newly hidden published values and refuses revealed gaps without writes",
  async (runtime, expect) => {
    const v1 = await evolvingPosts({ fields: conditionalFields() });
    const { repository, sql } = await runtime.open({ resolveModel: syncResolver([v1]) });
    await applySync(repository, [v1], 10);
    await seedMedia(sql, "m-1");
    await repository.create({
      entry: entry("draft-only", "posts", {
        fields: { kind: "image", videoUrl: "https://example.com/draft" },
        title: "Draft",
        updatedAt: 20,
      }),
      mediaReferences: [],
    });
    await repository.create({
      entry: entry("live", "posts", {
        fields: { kind: "video", media: "m-1", videoUrl: "https://example.com/live" },
        slug: "live",
        title: "Live",
        updatedAt: 21,
      }),
      mediaReferences: [{ fieldPath: "media", mediaId: mediaId("m-1"), sourceKey: "$fields" }],
    });
    await repository.publish(publish("live", 1, 22, "live-published"));
    const before = await syncEvidenceState(sql);
    const liveReferences = () =>
      sql.all(
        "select snapshot_id, field_path from content_media_references where media_id = 'm-1' order by snapshot_id",
      );
    expect(await liveReferences()).toEqual([
      { snapshot_id: "live-draft", field_path: "media" },
      { snapshot_id: "live-published", field_path: "media" },
    ]);

    const v2 = await evolvingPosts({
      fields: conditionalFields(),
      version: 2,
      visibility: {
        media: { field: "kind", values: ["image"] },
        videoUrl: { field: "kind", values: ["video"] },
      },
    } as Partial<CollectionModelInput>);
    const stale = await prepareConfigurationSynchronization({ models: [v2], state: repository });
    await sql.run(
      "update content_models set projection_hash = ? where key = ?",
      "changed-concurrently",
      "posts",
    );
    await expect(applySync(repository, [v2], 29, stale)).rejects.toMatchObject({
      code: "CONFIGURATION_SYNC_STALE",
    });
    await sql.run(
      "update content_models set projection_hash = ? where key = ?",
      v1.projectionHash,
      "posts",
    );
    expect(await syncEvidenceState(sql)).toEqual(before);

    const prepared = await prepareConfigurationSynchronization({ models: [v2], state: repository });
    expect(prepared.plan).toMatchObject({
      isValid: true,
      operations: [
        {
          action: "version-update",
          evolution: {
            changes: [
              {
                kind: "field-visibility-added",
                target: "media",
                affected: { draft: 0, published: 1 },
              },
              {
                kind: "field-visibility-added",
                target: "videoUrl",
                affected: { draft: 0, published: 0 },
              },
            ],
          },
        },
      ],
    });
    await expect(applySync(repository, [v2], 30, prepared)).resolves.toMatchObject({
      status: "applied",
      targetVersion: before.version! + 1,
    });
    expect(await count(sql, "select count(*) as count from outbox_events")).toBe(1);
    const draftOnly = await repository.load({ entryId: contentEntryId("draft-only") });
    const live = await repository.load({ entryId: contentEntryId("live") });
    expect(draftOnly!.draft).toMatchObject({
      fields: { kind: "image", videoUrl: "https://example.com/draft" },
      revision: 1,
      updatedAt: 20,
    });
    expect(live!.draft.fields).toEqual({
      kind: "video",
      media: "m-1",
      videoUrl: "https://example.com/live",
    });
    expect(live!.published).toMatchObject({
      fields: { kind: "video", videoUrl: "https://example.com/live" },
      revision: 1,
    });
    expect(live!.published!.fields).not.toHaveProperty("media");
    expect(await liveReferences()).toEqual([{ snapshot_id: "live-draft", field_path: "media" }]);

    const settled = await syncEvidenceState(sql);
    const v3 = await evolvingPosts({
      fields: conditionalFields(),
      version: 3,
      visibility: { media: { field: "kind", values: ["image"] } },
    } as Partial<CollectionModelInput>);
    await repository.saveCompleteDraft(
      save("live", 1, 40, {
        fields: { kind: "image", media: "m-1" },
        mediaReferences: [{ fieldPath: "media", mediaId: mediaId("m-1"), sourceKey: "$fields" }],
        slug: "live",
        title: "Live",
      }),
    );
    await repository.publish(publish("live", 2, 41, "live-published-2"));
    const refused = await prepareConfigurationSynchronization({ models: [v3], state: repository });
    expect(refused.plan.isValid).toBe(false);
    expect(refused.plan.diagnostics).toMatchObject([
      { code: "CONSTRAINT_VIOLATED", fieldKey: "videoUrl", affectedCount: 1 },
    ]);
    expect(refused.plan.diagnostics[0]!.snapshots).toMatchObject([
      { entryId: "live", state: "published" },
    ]);
    expect((await syncEvidenceState(sql)).models).toEqual(settled.models);
  },
);

contract(
  "renames, prunes and drops hinted data with its media references",
  async (runtime, expect) => {
    const v1 = await evolvingPosts({ fields: hintedFieldsV1 });
    const { repository, sql } = await runtime.open({ resolveModel: syncResolver([v1]) });
    await applySync(repository, [v1], 10);
    await seedHintedEntries(repository, sql);
    const request = (id: string) => ({
      mediaId: mediaId(id),
      requestedAt: unixMilliseconds(40),
      requestedBy: editor,
    });
    await expect(repository.markForDeletion(request("m-3"))).rejects.toMatchObject({
      code: "MEDIA_IN_USE",
    });
    const usage = (id: string) =>
      repository.loadMediaCatalogItem(id).then((item) => item!.usageCount);
    const coverUsage = await usage("m-1");
    const before = await hintedState(sql);

    const v2 = await evolvingPosts({
      blocks: ["richText", "quote"],
      fields: {
        heroImage: field.media({ renamedFrom: "cover" }),
        keep: field.text(),
        title: field.text({ renamedFrom: "headline" }),
      },
      removedBlocks: ["image"],
      removedFields: ["thumb"],
      version: 2,
    });
    const prepared = await prepareConfigurationSynchronization({ models: [v2], state: repository });
    expect(prepared.plan).toMatchObject({
      isValid: true,
      operations: [
        {
          action: "version-update",
          evolution: {
            blockRemovals: ["image"],
            fieldRemovals: ["thumb"],
            renames: [
              { from: "cover", to: "heroImage" },
              { from: "headline", to: "title" },
            ],
          },
        },
      ],
    });
    expect(prepared.report.text).toContain(
      "planned renames: cover -> heroImage, headline -> title",
    );
    expect(prepared.report.text).toContain("planned field removals: thumb");
    expect(prepared.report.text).toContain("planned block removals: image");
    expect(await hintedState(sql)).toEqual(before);

    await expect(applySync(repository, [v2], 30, prepared)).resolves.toMatchObject({
      status: "applied",
      targetVersion: before.version! + 1,
    });
    expect(await count(sql, "select count(*) as count from outbox_events")).toBe(1);
    const draftOnly = await repository.load({ entryId: contentEntryId("draft-only") });
    const live = await repository.load({ entryId: contentEntryId("live") });
    expect(draftOnly!.draft).toMatchObject({
      fields: { heroImage: "m-1", keep: "k", title: "Draft head" },
      revision: 1,
      updatedAt: 20,
    });
    expect(draftOnly!.draft.fields).not.toHaveProperty("thumb");
    expect(draftOnly!.draft.fields).not.toHaveProperty("headline");
    expect(draftOnly!.draft.blocks.map((value) => [value.key, value.type, value.position])).toEqual(
      [
        ["text-1", "richText", 1000],
        ["quote-1", "quote", 3000],
      ],
    );
    expect(live!.published).toMatchObject({
      fields: { heroImage: "m-1", title: "Live head" },
      revision: 1,
    });
    expect(live!.published!.fields).not.toHaveProperty("cover");

    expect(await usage("m-1")).toBe(coverUsage);
    expect(await usage("m-2")).toBe(0);
    expect(await usage("m-3")).toBe(0);
    expect(
      await sql.all(
        "select distinct field_path from content_media_references where media_id = 'm-1'",
      ),
    ).toEqual([{ field_path: "heroImage" }]);
    await expect(repository.markForDeletion(request("m-3"))).resolves.toMatchObject({
      status: "deleting",
    });

    await expect(applySync(repository, [v2], 31)).resolves.toMatchObject({ status: "noop" });
    const settled = await hintedState(sql);
    const v3 = await evolvingPosts({
      blocks: ["richText", "quote"],
      fields: {
        extra: field.text(),
        heroImage: field.media({ renamedFrom: "cover" }),
        keep: field.text(),
        title: field.text({ renamedFrom: "headline" }),
      },
      removedBlocks: ["image"],
      removedFields: ["thumb"],
      version: 3,
    });
    const inert = await prepareConfigurationSynchronization({ models: [v3], state: repository });
    expect(inert.plan.operations).toMatchObject([
      {
        action: "version-update",
        evolution: { changes: [{ kind: "field-added", target: "extra" }] },
      },
    ]);
    await applySync(repository, [v3], 32, inert);
    const after = await hintedState(sql);
    expect(after.snapshots).toEqual(settled.snapshots);
    expect(after.blocks).toEqual(settled.blocks);
    expect(after.references).toEqual(settled.references);
  },
);

contract(
  "refuses unhinted removals of stored data and renames onto stored data",
  async (runtime, expect) => {
    const v1 = await evolvingPosts({ fields: hintedFieldsV1 });
    const { repository, sql } = await runtime.open({ resolveModel: syncResolver([v1]) });
    await applySync(repository, [v1], 10);
    await seedHintedEntries(repository, sql);
    const before = await hintedState(sql);

    const unhinted = await evolvingPosts({
      blocks: ["richText", "quote"],
      fields: { cover: field.media(), headline: field.text(), keep: field.text() },
      version: 2,
    });
    const refused = await prepareConfigurationSynchronization({
      models: [unhinted],
      state: repository,
    });
    expect(refused.plan.diagnostics).toMatchObject([
      {
        affectedCount: 1,
        blockType: "image",
        code: "BLOCK_TYPE_REMOVAL_HAS_BLOCKS",
        snapshots: [{ entryId: "draft-only", state: "draft", title: "Draft" }],
      },
      {
        affectedCount: 1,
        code: "FIELD_REMOVAL_HAS_DATA",
        fieldKey: "thumb",
        snapshots: [{ entryId: "draft-only", state: "draft", title: "Draft" }],
      },
    ]);
    expect(refused.report.text).toContain('removedBlocks: ["image"]');
    expect(refused.report.text).toContain('removedFields: ["thumb"]');
    await expect(applySync(repository, [unhinted], 30, refused)).rejects.toMatchObject({
      code: "CONTENT_INVALID_STATE",
    });
    expect(await hintedState(sql)).toEqual(before);

    // A stray stored value under the new key blocks the move instead of being overwritten.
    await sql.run(
      "update content_snapshots set fields_json = json_set(fields_json, '$.title', 'stray') where id = 'live-published'",
    );
    const stray = await hintedState(sql);
    const renamed = await evolvingPosts({
      fields: {
        cover: field.media(),
        keep: field.text(),
        thumb: field.media(),
        title: field.text({ renamedFrom: "headline" }),
      },
      version: 2,
    });
    const onto = await prepareConfigurationSynchronization({
      models: [renamed],
      state: repository,
    });
    expect(onto.plan.diagnostics).toMatchObject([
      {
        affectedCount: 1,
        code: "FIELD_RENAME_TARGET_HAS_DATA",
        fieldKey: "title",
        snapshots: [{ entryId: "live", state: "published" }],
      },
    ]);
    await expect(applySync(repository, [renamed], 31, onto)).rejects.toMatchObject({
      code: "CONTENT_INVALID_STATE",
    });
    expect(await hintedState(sql)).toEqual(stray);
  },
);

contract("renames a model and one of its fields in one apply", async (runtime, expect) => {
  const v1 = await evolvingPosts({ fields: hintedFieldsV1 });
  const articles = await evolvingPosts({
    fields: {
      cover: field.media(),
      keep: field.text(),
      thumb: field.media(),
      title: field.text({ renamedFrom: "headline" }),
    },
    key: "articles",
    renamedFrom: "posts",
    version: 2,
  });
  const { repository, sql } = await runtime.open({
    resolveModel: syncResolver([v1, articles]),
  });
  await applySync(repository, [v1], 10);
  await seedHintedEntries(repository, sql);

  const prepared = await prepareConfigurationSynchronization({
    models: [articles],
    state: repository,
  });
  expect(prepared.plan.operations).toMatchObject([
    {
      action: "rename",
      evolution: { renames: [{ from: "headline", to: "title" }] },
      renamedFrom: "posts",
    },
  ]);
  await expect(applySync(repository, [articles], 30, prepared)).resolves.toMatchObject({
    status: "applied",
  });
  expect(await sql.all("select model_key from content_entries order by id")).toEqual([
    { model_key: "articles" },
    { model_key: "articles" },
  ]);
  const live = await repository.load({ entryId: contentEntryId("live") });
  expect(live!.published!.fields).toEqual({ cover: "m-1", title: "Live head" });
});
