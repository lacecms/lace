import {
  applyPreparedConfigurationSynchronization,
  prepareConfigurationSynchronization,
} from "@lacecms/application";

import { defineCollection, defineConfig } from "@lacecms/config";
import type { CollectionModelInput, NormalizedContentModel } from "@lacecms/config";
import { builtInBlocks, defineBlock, field, validateBlockData } from "@lacecms/content";
import type { BlockDefinition, BlockMigrations, JsonObject } from "@lacecms/content";
import { blockKey, contentEntryId, mediaId, unixMilliseconds } from "@lacecms/domain";
import type { ContentBlock } from "@lacecms/domain";

import {
  type ContractRepository,
  type ContractSql,
  type RepositoryContractRuntime,
  type RepositoryContractCase,
  editor,
  sequence,
  count,
  seedMedia,
  entry,
  save,
  publish,
  syncResolver,
  applySync,
  registerContract,
} from "./shared.js";
export const cases: RepositoryContractCase[] = [];
const contract = registerContract(cases);
export async function evolvingPosts(
  overrides: Partial<CollectionModelInput> = {},
  blocks: readonly BlockDefinition[] = Object.values(builtInBlocks),
): Promise<NormalizedContentModel> {
  const config = await defineConfig({
    blocks,
    content: [
      defineCollection({
        blocks: ["richText", "image", "quote"],
        fields: { summary: field.text({ maxLength: 100 }) },
        key: "posts",
        route: "/blog/:slug",
        version: 1,
        ...overrides,
      } as CollectionModelInput),
    ],
  });
  return config.runtime.content[0]!;
}

function richTextBlock(key: string) {
  return Object.freeze({
    data: { content: { content: [], type: "doc" } },
    hidden: false,
    key: blockKey(key),
    position: 1000,
    schemaVersion: 1,
    settings: {},
    type: "richText",
  });
}

/** Seeds one draft-only and one published `posts` entry through the repository. */
export async function seedEvolvingEntries(
  repository: ContractRepository,
  fields: { readonly draft: JsonObject; readonly published: JsonObject },
  blocks: readonly ContentBlock[] = [],
): Promise<void> {
  await repository.create({
    entry: entry("draft-only", "posts", {
      blocks,
      fields: fields.draft,
      title: "Draft",
      updatedAt: 20,
    }),
    mediaReferences: [],
  });
  await repository.create({
    entry: entry("live", "posts", {
      fields: fields.published,
      slug: "live",
      title: "Live",
      updatedAt: 21,
    }),
    mediaReferences: [],
  });
  await repository.publish(publish("live", 1, 22, "live-published"));
}

async function syncEvidenceState(sql: ContractSql) {
  return {
    models: await sql.all(
      "select key, config_version, structure_hash, structure_json is not null as has_baseline from content_models order by key",
    ),
    outbox: await count(sql, "select count(*) as count from outbox_events"),
    snapshots: await sql.all(
      "select id, revision, fields_json, updated_at from content_snapshots order by id",
    ),
    version: (await sql.get<{ version: number }>("select version from published_state"))?.version,
  };
}

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
      code: "CONTENT_INVALID_STATE",
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
  "accepts a legacy structural hash once when fields use display-like keys",
  async (runtime, expect) => {
    const described = await evolvingPosts({ fields: { description: field.textarea() } });
    expect(described.legacyStructureHash).toEqual(expect.any(String));
    const { repository, sql } = await runtime.open({ resolveModel: syncResolver([described]) });
    await applySync(repository, [described], 10);
    await seedEvolvingEntries(repository, { draft: {}, published: {} });
    await sql.run(
      "update content_models set structure_hash = ?, structure_json = null, structure_json_hash = null",
      described.legacyStructureHash,
    );
    const prepared = await prepareConfigurationSynchronization({
      models: [described],
      state: repository,
    });
    expect(prepared.plan).toMatchObject({
      isValid: true,
      operations: [{ action: "record-baseline" }],
    });
    await applySync(repository, [described], 20, prepared);
    expect(await sql.get("select structure_hash from content_models")).toEqual({
      structure_hash: described.structureHash,
    });
    await expect(applySync(repository, [described], 21)).resolves.toMatchObject({
      status: "noop",
    });
  },
);

export function block(key: string, type: string, position: number, data: JsonObject) {
  return Object.freeze({
    data,
    hidden: false,
    key: blockKey(key),
    position,
    schemaVersion: 1,
    settings: {},
    type,
  });
}

/** Seeds hinted-rewrite content: two media fields, an image block and a quote block. */
async function seedHintedEntries(repository: ContractRepository, sql: ContractSql): Promise<void> {
  for (const id of ["m-1", "m-2", "m-3"]) await seedMedia(sql, id);
  await repository.create({
    entry: entry("draft-only", "posts", {
      blocks: [
        richTextBlock("text-1"),
        block("img-1", "image", 2000, { alt: "Alt", media: "m-2" }),
        block("quote-1", "quote", 3000, { quote: "Q" }),
      ],
      fields: { cover: "m-1", headline: "Draft head", keep: "k", thumb: "m-3" },
      title: "Draft",
      updatedAt: 20,
    }),
    mediaReferences: [
      { fieldPath: "cover", mediaId: mediaId("m-1"), sourceKey: "$fields" },
      { fieldPath: "thumb", mediaId: mediaId("m-3"), sourceKey: "$fields" },
      { fieldPath: "media", mediaId: mediaId("m-2"), sourceKey: blockKey("img-1") },
    ],
  });
  await repository.create({
    entry: entry("live", "posts", {
      fields: { cover: "m-1", headline: "Live head" },
      slug: "live",
      title: "Live",
      updatedAt: 21,
    }),
    mediaReferences: [{ fieldPath: "cover", mediaId: mediaId("m-1"), sourceKey: "$fields" }],
  });
  await repository.publish(publish("live", 1, 22, "live-published"));
}

async function hintedState(sql: ContractSql) {
  return {
    ...(await syncEvidenceState(sql)),
    blocks: await sql.all(
      "select snapshot_id, block_key, block_type, position, data_json from content_blocks order by snapshot_id, position",
    ),
    references: await sql.all(
      "select snapshot_id, source_key, field_path, media_id from content_media_references order by snapshot_id, source_key, field_path",
    ),
  };
}

const hintedFieldsV1 = {
  cover: field.media(),
  headline: field.text(),
  keep: field.text(),
  thumb: field.media(),
};

const conditionalFields = () => ({
  kind: field.select({ options: ["image", "video"], required: true, defaultValue: "image" }),
  media: field.media(),
  videoUrl: field.url({ required: true }),
});

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
      code: "CONTENT_INVALID_STATE",
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

export const noteV1 = defineBlock({
  fields: { body: field.text({ required: true }), image: field.media() },
  type: "note",
  version: 1,
});

export function noteV3(migrations: BlockMigrations = {}): BlockDefinition {
  return defineBlock({
    fields: { cover: field.media(), text: field.text({ required: true }) },
    migrations: {
      2: ({ data: { body, image, ...rest } }) => ({
        data: {
          ...rest,
          ...(image === undefined ? {} : { cover: image }),
          ...(body === undefined ? {} : { quote: body }),
        },
      }),
      3: ({ data: { quote, ...rest } }) => ({
        data: quote === undefined ? rest : { ...rest, text: quote },
      }),
      ...migrations,
    },
    type: "note",
    version: 3,
  });
}

/** A `posts` configuration whose blocks include one `note` definition. */
export async function noteConfig(note: BlockDefinition, version: number) {
  return defineConfig({
    blocks: [...Object.values(builtInBlocks), note],
    content: [
      defineCollection({
        blocks: ["richText", "note"],
        fields: { summary: field.text() },
        key: "posts",
        route: "/blog/:slug",
        version,
      }),
    ],
  });
}

type NoteConfig = Awaited<ReturnType<typeof noteConfig>>;

export async function prepareNotes(repository: ContractRepository, config: NoteConfig) {
  return prepareConfigurationSynchronization({
    blocks: config.runtime.blocks,
    models: config.runtime.content,
    state: repository,
  });
}

export async function syncNotes(
  repository: ContractRepository,
  config: NoteConfig,
  at: number,
  prepared?: Awaited<ReturnType<typeof prepareNotes>>,
) {
  return applyPreparedConfigurationSynchronization({
    blocks: config.runtime.blocks,
    clock: { now: () => unixMilliseconds(at) },
    ids: { next: sequence(`sync-${at}`) },
    models: config.runtime.content,
    prepared: prepared ?? (await prepareNotes(repository, config)),
    target: repository,
  });
}

export function note(key: string, data: JsonObject, position = 2000) {
  return Object.freeze({
    data,
    hidden: false,
    key: blockKey(key),
    position,
    schemaVersion: 1,
    settings: {},
    type: "note",
  });
}

/**
 * Seeds a draft-only entry with a media-holding note, a published entry in
 * sync with its draft, and a published entry with a newer draft.
 */
async function seedNoteEntries(repository: ContractRepository, sql: ContractSql): Promise<void> {
  for (const id of ["m-1", "m-2"]) await seedMedia(sql, id);
  await repository.create({
    entry: entry("draft-only", "posts", {
      blocks: [richTextBlock("text-1"), note("n1", { body: "Draft note", image: "m-1" })],
      title: "Draft",
      updatedAt: 20,
    }),
    mediaReferences: [{ fieldPath: "image", mediaId: mediaId("m-1"), sourceKey: blockKey("n1") }],
  });
  await repository.create({
    entry: entry("live", "posts", {
      blocks: [note("n1", { body: "Live" })],
      slug: "live",
      title: "Live",
      updatedAt: 21,
    }),
    mediaReferences: [],
  });
  await repository.publish(publish("live", 1, 22, "live-published"));
  await repository.create({
    entry: entry("changed", "posts", {
      blocks: [note("n1", { body: "Old" })],
      slug: "changed",
      title: "Changed",
      updatedAt: 23,
    }),
    mediaReferences: [],
  });
  await repository.publish(publish("changed", 1, 24, "changed-published"));
  await repository.saveCompleteDraft(
    save("changed", 1, 25, { blocks: [note("n1", { body: "New" })], slug: "changed" }),
  );
}

async function noteState(sql: ContractSql) {
  return {
    ...(await syncEvidenceState(sql)),
    blocks: await sql.all(
      "select snapshot_id, block_key, block_type, position, schema_version, data_json from content_blocks order by snapshot_id, position",
    ),
    references: await sql.all(
      "select snapshot_id, source_key, field_path, media_id from content_media_references order by snapshot_id, source_key, field_path",
    ),
    updatedBy: await sql.all("select id, updated_by from content_snapshots order by id"),
  };
}

async function openNotes(runtime: RepositoryContractRuntime) {
  const v1 = await noteConfig(noteV1, 1);
  const harness = await runtime.open({ resolveModel: syncResolver(v1.runtime.content) });
  await syncNotes(harness.repository, v1, 10);
  await seedNoteEntries(harness.repository, harness.sql);
  return harness;
}

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
    await expect(syncNotes(racing, v3, 30)).rejects.toThrow("stale");
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

/** Checkpoints both adapters expose inside the atomic media metadata update. */
