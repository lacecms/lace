import { globalEntry, seoReference } from "../entries/fixtures.js";
import {
  applyPreparedConfigurationSynchronization,
  prepareConfigurationSynchronization,
} from "@lacecms/application";

import { readAllBuildContentPages } from "../../delivery/build-export.js";
import { defineCollection, defineConfig } from "@lacecms/config";
import type { CollectionModelInput } from "@lacecms/config";
import { builtInBlocks, field } from "@lacecms/content";
import type { BlockDefinition } from "@lacecms/content";
import {
  blockKey,
  contentEntryId,
  contentModelKey,
  contentSnapshotId,
  createContentEntry,
  mediaId,
  unixMilliseconds,
} from "@lacecms/domain";
import type { ContentEntry, EntrySeo } from "@lacecms/domain";

import {
  type ContractRepository,
  type ContractSql,
  type RepositoryContractCase,
  PUBLICATION_CHECKPOINTS,
  UNPUBLICATION_CHECKPOINTS,
  editor,
  resolveRoute,
  sequence,
  count,
  seedModels,
  seedMedia,
  entry,
  heroEntry,
  references,
  save,
  publish,
  syncPage,
  syncGlobal,
  syncResolver,
  applySync,
  registerContract,
} from "../shared.js";
import { lifecycleState, unpublishCommand, revertCommand } from "../entries/fixtures.js";
import { noteV1, noteV3, note } from "../sync/fixtures.js";
import { metadataUpdate, pendingBuilds } from "../media/fixtures.js";
export const cases: RepositoryContractCase[] = [];
const contract = registerContract(cases);
async function seedPublishedGlobal(repository: ContractRepository, sql: ContractSql) {
  await seedModels(sql, "home", "posts", "settings");
  await seedMedia(sql, "media-1");
  await seedMedia(sql, "media-2");
  for (const [id, model] of [
    ["home", "home"],
    ["post", "posts"],
  ] as const) {
    await repository.create({
      entry: heroEntry(id, model, 1),
      mediaReferences: references(`${id}-block`),
    });
    await repository.publish(publish(id, 1, 2, `${id}-published`));
  }
  await repository.create({
    entry: globalEntry("settings", 1, "media-2"),
    mediaReferences: [
      { fieldPath: "image", mediaId: mediaId("media-2"), sourceKey: "$fields" },
      { fieldPath: "image", mediaId: mediaId("media-2"), sourceKey: blockKey("settings-block") },
    ],
  });
  return repository.publish(publish("settings", 1, 3, "settings-published"));
}

contract("synchronizes a global singleton without a route", async (runtime, expect) => {
  const models = [syncPage(), syncGlobal()];
  const { repository, sql } = await runtime.open({
    nextId: sequence("outbox"),
    resolveModel: syncResolver(models),
  });
  await expect(applySync(repository, models, 10)).resolves.toMatchObject({ status: "applied" });
  expect(await repository.readConfigurationSyncState()).toMatchObject([
    { entryCount: 1, key: "home", kind: "page" },
    { draftSnapshotCount: 1, entryCount: 1, key: "settings", kind: "global" },
  ]);
  const listed = await repository.list({
    limit: 10,
    listFields: [],
    modelKey: contentModelKey("settings"),
    sort: "-updatedAt",
  });
  expect(listed.items).toMatchObject([{ status: "draft", title: "Site settings" }]);
  const loaded = await repository.load({ entryId: contentEntryId(listed.items[0]!.id) });
  expect(loaded).toMatchObject({
    draft: { blocks: [], revision: 1, updatedBy: { id: "system:content-sync" } },
    model: { key: "settings", kind: "global" },
  });
  expect(loaded!.draft).not.toHaveProperty("slug");
  expect(
    await sql.get("select singleton_key from content_entries where model_key = 'settings'"),
  ).toEqual({ singleton_key: 1 });
  expect(await count(sql, "select count(*) as count from published_routes")).toBe(0);
  await expect(
    repository.create({ entry: globalEntry("second", 11), mediaReferences: [] }),
  ).rejects.toMatchObject({ code: "CONTENT_MODEL_CARDINALITY_CONFLICT" });
  expect(
    await count(sql, "select count(*) as count from content_entries where model_key = 'settings'"),
  ).toBe(1);
});

contract("rolls back a failed synchronized global singleton", async (runtime, expect) => {
  const models = [syncGlobal()];
  const { repository, sql } = await runtime.open({
    beforeMutation: (checkpoint) => {
      if (checkpoint === "sync.page.snapshot") throw new Error("injected failure");
    },
    resolveModel: syncResolver(models),
  });
  await expect(applySync(repository, models, 10)).rejects.toMatchObject({
    code: "CONTENT_INVALID_STATE",
  });
  expect(await repository.readConfigurationSyncState()).toEqual([]);
  expect(await count(sql, "select count(*) as count from content_entries")).toBe(0);
});

contract("publishes and reads a global by model key without a route", async (runtime, expect) => {
  const { repository, sql } = await runtime.open({
    nextId: sequence("outbox"),
    resolveModel: resolveRoute,
  });
  await seedModels(sql, "settings");
  await seedMedia(sql, "media-1");
  await repository.create({
    entry: globalEntry("settings", 1),
    mediaReferences: references("settings-block"),
  });
  expect(await repository.loadPublicGlobal(contentModelKey("settings"))).toBeNull();
  expect(await repository.loadPublicMedia("media-1")).toBeNull();
  const version = await repository.publishedContentVersion();
  const published = await repository.publish(publish("settings", 1, 2, "settings-published"));
  expect(published).toMatchObject({ outcome: "published", targetVersion: version + 1 });
  expect(await count(sql, "select count(*) as count from published_routes")).toBe(0);
  expect(await repository.publishedContentVersion()).toBe(version + 1);
  const pending = await sql.all<{ payload_json: string }>(
    "select payload_json from outbox_events where type = 'site.build.requested' and processed_at is null",
  );
  expect(pending).toHaveLength(1);

  const read = await repository.loadPublicGlobal(contentModelKey("settings"));
  expect(read).toMatchObject({
    entry: {
      id: "settings",
      model: { key: "settings", kind: "global" },
      published: { fields: { image: "media-1", title: "Lace" }, id: "settings-published" },
    },
    media: [{ id: "media-1" }],
  });
  expect(read).not.toHaveProperty("path");
  expect(await repository.loadPublicMedia("media-1")).toMatchObject({ id: "media-1" });

  await repository.saveCompleteDraft(
    save("settings", 1, 3, { fields: { title: "Changed" }, title: "Site settings" }),
  );
  await repository.publish(publish("settings", 2, 4, "settings-republished"));
  expect(await repository.loadPublicGlobal(contentModelKey("settings"))).toMatchObject({
    entry: { published: { fields: { title: "Changed" }, id: "settings-republished" } },
    media: [],
  });
  expect(await repository.publishedContentVersion()).toBe(version + 2);
  expect(
    await count(sql, "select count(*) as count from outbox_events where processed_at is null"),
  ).toBe(1);
  expect(
    await count(sql, "select count(*) as count from content_snapshots where entry_id = 'settings'"),
  ).toBe(2);
});

contract(
  "keeps globals out of routed reads and lists them in the export",
  async (runtime, expect) => {
    const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
    await seedPublishedGlobal(repository, sql);
    await seedMedia(sql, "media-3");
    await repository.saveCompleteDraft(
      save("settings", 1, 4, {
        fields: { image: "media-3" },
        mediaReferences: [
          { fieldPath: "image", mediaId: mediaId("media-3"), sourceKey: "$fields" },
        ],
        title: "Site settings",
      }),
    );

    expect(await repository.loadPublic("/")).toMatchObject({ entry: { id: "home" } });
    for (const key of ["home", "posts", "missing"]) {
      expect(await repository.loadPublicGlobal(contentModelKey(key)), key).toBeNull();
    }
    expect(
      (await repository.listPublic({ limit: 10, modelKey: contentModelKey("settings") })).items,
    ).toEqual([]);
    expect(
      (await repository.listPublic({ limit: 10, modelKey: contentModelKey("posts") })).items.map(
        (item) => item.entry.id,
      ),
    ).toEqual(["post"]);

    const exported = await readAllBuildContentPages(repository);
    expect(exported.entries.map((item) => item.path)).toEqual(["/", "/blog/post"]);
    expect(exported.globals.map((item) => item.entry.id)).toEqual(["settings"]);
    expect(exported.globals[0]).toMatchObject({
      entry: { published: { fields: { image: "media-2" } } },
      media: [{ id: "media-2" }],
    });
    expect(exported.globals[0]).not.toHaveProperty("path");
    expect(
      [...exported.entries, ...exported.globals].flatMap((item) => item.media.map((m) => m.id)),
    ).toEqual(["media-1", "media-1", "media-2"]);
    // Media referenced only by the global's draft stays private.
    expect(await repository.loadPublicMedia("media-3")).toBeNull();
    expect(await repository.loadPublicMedia("media-2")).toMatchObject({ id: "media-2" });
  },
);

contract("unpublishes and reverts a global without touching routes", async (runtime, expect) => {
  const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
  await seedPublishedGlobal(repository, sql);
  await repository.saveCompleteDraft(
    save("settings", 1, 4, { fields: { title: "Changed" }, title: "Site settings" }),
  );
  const version = await repository.publishedContentVersion();
  const reverted = await repository.revertDraft(revertCommand("settings", 2, "settings-published"));
  expect(reverted.entry!.draft).toMatchObject({ fields: { image: "media-2" }, revision: 3 });
  expect(await repository.publishedContentVersion()).toBe(version);

  const routesBefore = await sql.all("select * from published_routes order by path");
  const result = await repository.unpublish(unpublishCommand("settings", "settings-published", 5));
  expect(result).toMatchObject({ outcome: "unpublished", targetVersion: version + 1 });
  expect(result.entry.draft).toEqual(reverted.entry!.draft);
  expect(await repository.loadPublicGlobal(contentModelKey("settings"))).toBeNull();
  expect((await readAllBuildContentPages(repository)).globals).toEqual([]);
  expect(await repository.loadPublicMedia("media-2")).toBeNull();
  expect(await sql.all("select * from published_routes order by path")).toEqual(routesBefore);
  expect(await repository.publishedContentVersion()).toBe(version + 1);
});

contract(
  "rolls back global publication and unpublication at every checkpoint",
  async (runtime, expect) => {
    const publicationCheckpoints = PUBLICATION_CHECKPOINTS.filter(
      (checkpoint) => checkpoint !== "publish.route",
    );
    for (const checkpoint of publicationCheckpoints) {
      const { repository, sql } = await runtime.open({
        beforeMutation: (name) => {
          if (name === checkpoint) throw new Error(`injected ${checkpoint}`);
        },
        resolveModel: resolveRoute,
      });
      await seedModels(sql, "settings");
      await seedMedia(sql, "media-1");
      await repository.create({
        entry: globalEntry("settings", 1),
        mediaReferences: references("settings-block"),
      });
      const before = await lifecycleState(sql);
      await expect(
        repository.publish(publish("settings", 1, 2, "settings-published")),
        checkpoint,
      ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
      expect(await lifecycleState(sql), checkpoint).toEqual(before);
    }
    for (const checkpoint of UNPUBLICATION_CHECKPOINTS) {
      let armed = false;
      const { repository, sql } = await runtime.open({
        beforeMutation: (name) => {
          if (armed && name === checkpoint) throw new Error(`injected ${checkpoint}`);
        },
        resolveModel: resolveRoute,
      });
      await seedPublishedGlobal(repository, sql);
      const before = await lifecycleState(sql);
      armed = true;
      await expect(
        repository.unpublish(unpublishCommand("settings", "settings-published", 5)),
        checkpoint,
      ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
      expect(await lifecycleState(sql), checkpoint).toEqual(before);
    }
  },
);

/** A `posts` entry whose draft carries an SEO group. */
function seoEntry(id: string, seo: EntrySeo, updatedAt: number, slug = id): ContentEntry {
  const value = entry(id, "posts", { slug, title: id, updatedAt });
  return createContentEntry({ draft: { ...value.draft, seo }, id: value.id, model: value.model });
}

async function seoState(sql: ContractSql) {
  return {
    references: await sql.all(
      "select snapshot_id, source_key, field_path, media_id from content_media_references order by snapshot_id, source_key, field_path",
    ),
    seo: await sql.all("select id, revision, seo_json from content_snapshots order by id"),
    version: (await sql.get<{ version: number }>("select version from published_state"))?.version,
  };
}

contract(
  "persists and copies the SEO group through save, publish, revert and duplicate",
  async (runtime, expect) => {
    const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
    await seedModels(sql, "posts");
    for (const id of ["media-1", "media-2"]) await seedMedia(sql, id);
    const seo = { canonical: "https://example.com/a", image: mediaId("media-1"), title: "A" };
    await repository.create({
      entry: seoEntry("post", seo, 1, "post"),
      mediaReferences: [seoReference("media-1")],
    });
    expect(await sql.get("select seo_json from content_snapshots where id = 'post-draft'")).toEqual(
      { seo_json: '{"canonical":"https://example.com/a","image":"media-1","title":"A"}' },
    );

    const changedSeo = { image: mediaId("media-2"), noindex: true as const, title: "B" };
    await repository.saveCompleteDraft(
      save("post", 1, 2, {
        mediaReferences: [seoReference("media-2")],
        seo: changedSeo,
        slug: "post",
      }),
    );
    expect((await repository.load({ entryId: contentEntryId("post") }))!.draft.seo).toEqual(
      changedSeo,
    );
    await repository.publish(publish("post", 2, 3, "post-published"));
    const published = (await repository.load({ entryId: contentEntryId("post") }))!;
    expect(published.published!.seo).toEqual(changedSeo);
    expect(
      await sql.all(
        "select snapshot_id, media_id from content_media_references where source_key = '$seo' order by snapshot_id",
      ),
    ).toEqual([
      { media_id: "media-2", snapshot_id: "post-draft" },
      { media_id: "media-2", snapshot_id: "post-published" },
    ]);
    const publicEntry = await repository.loadPublic("/blog/post");
    expect(publicEntry!.entry.published!.seo).toEqual(changedSeo);
    expect(publicEntry!.media.map((media) => media.id)).toEqual(["media-2"]);
    const exported = await readAllBuildContentPages(repository);
    expect(exported.entries[0]!.entry.published!.seo).toEqual(changedSeo);
    expect(exported.entries[0]!.media.map((media) => media.id)).toEqual(["media-2"]);
    expect(await repository.loadPublicMedia(mediaId("media-2"))).not.toBeNull();
    expect(await repository.loadPublicMedia(mediaId("media-1"))).toBeNull();

    // Saving without a group clears it from the draft only.
    await repository.saveCompleteDraft(save("post", 2, 4, { slug: "post" }));
    const cleared = (await repository.load({ entryId: contentEntryId("post") }))!;
    expect(cleared.draft).not.toHaveProperty("seo");
    expect(cleared.published!.seo).toEqual(changedSeo);
    expect(
      await count(
        sql,
        "select count(*) as count from content_media_references where snapshot_id = 'post-draft'",
      ),
    ).toBe(0);

    await repository.revertDraft({
      entryId: contentEntryId("post"),
      expectedPublishedSnapshotId: contentSnapshotId("post-published"),
      expectedRevision: 3,
      revertedAt: unixMilliseconds(5),
      revertedBy: editor,
    });
    const reverted = (await repository.load({ entryId: contentEntryId("post") }))!;
    expect(reverted.draft.seo).toEqual(changedSeo);
    expect(
      await sql.all(
        "select source_key, media_id from content_media_references where snapshot_id = 'post-draft'",
      ),
    ).toEqual([{ media_id: "media-2", source_key: "$seo" }]);

    await repository.create({
      duplicateOf: { entryId: contentEntryId("post"), expectedRevision: 4 },
      entry: seoEntry("copy", changedSeo, 6, "copy"),
      mediaReferences: [seoReference("media-2")],
    });
    expect((await repository.load({ entryId: contentEntryId("copy") }))!.draft.seo).toEqual(
      changedSeo,
    );
    expect((await repository.loadMediaCatalogItem("media-2"))!.usageCount).toBe(2);
  },
);

contract(
  "SEO images protect media and appear in usage but stay private while draft-only",
  async (runtime, expect) => {
    const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
    await seedModels(sql, "posts");
    await seedMedia(sql, "media-1");
    await repository.create({
      entry: seoEntry("post", { image: mediaId("media-1") }, 1),
      mediaReferences: [seoReference("media-1")],
    });
    await expect(
      repository.markForDeletion({
        mediaId: mediaId("media-1"),
        requestedAt: unixMilliseconds(2),
        requestedBy: editor,
      }),
    ).rejects.toMatchObject({ code: "MEDIA_IN_USE" });
    expect((await repository.loadMediaCatalogItem("media-1"))!.usageCount).toBe(1);
    expect(await repository.loadMediaUsage({ limit: 50, mediaId: mediaId("media-1") })).toEqual([
      expect.objectContaining({
        entryId: "post",
        locations: [{ field: "image", source: "seo", states: ["draft"] }],
      }),
    ]);
    expect(await repository.loadPublicMedia(mediaId("media-1"))).toBeNull();
    expect((await readAllBuildContentPages(repository)).entries).toEqual([]);
  },
);

/** A `posts` configuration with SEO and a `note` block of the given definition. */
async function seoNoteConfig(
  note: BlockDefinition,
  version: number,
  overrides: Partial<CollectionModelInput> = {},
) {
  return defineConfig({
    blocks: [...Object.values(builtInBlocks), note],
    content: [
      defineCollection({
        blocks: ["richText", "note"],
        fields: { headline: field.text() },
        key: "posts",
        route: "/blog/:slug",
        seo: true,
        version,
        ...overrides,
      } as CollectionModelInput),
    ],
  });
}

async function syncSeoNotes(
  repository: ContractRepository,
  config: Awaited<ReturnType<typeof seoNoteConfig>>,
  at: number,
) {
  const prepared = await prepareConfigurationSynchronization({
    blocks: config.runtime.blocks,
    models: config.runtime.content,
    state: repository,
  });
  if (!prepared.plan.isValid) return { prepared };
  return {
    prepared,
    result: await applyPreparedConfigurationSynchronization({
      blocks: config.runtime.blocks,
      clock: { now: () => unixMilliseconds(at) },
      ids: { next: sequence(`sync-${at}`) },
      models: config.runtime.content,
      prepared,
      target: repository,
    }),
  };
}

async function seedSeoNotes(repository: ContractRepository, sql: ContractSql): Promise<void> {
  for (const id of ["m-1", "m-2"]) await seedMedia(sql, id);
  const value = entry("live", "posts", {
    blocks: [note("n1", { body: "Live", image: "m-1" })],
    fields: { headline: "Head" },
    slug: "live",
    title: "Live",
    updatedAt: 20,
  });
  await repository.create({
    entry: createContentEntry({
      draft: { ...value.draft, seo: { image: mediaId("m-2"), title: "Live SEO" } },
      id: value.id,
      model: value.model,
    }),
    mediaReferences: [
      { fieldPath: "image", mediaId: mediaId("m-1"), sourceKey: blockKey("n1") },
      seoReference("m-2"),
    ],
  });
  await repository.publish(publish("live", 1, 21, "live-published"));
}

contract(
  "block migrations and field rewrites during synchronization keep SEO groups",
  async (runtime, expect) => {
    const v1 = await seoNoteConfig(noteV1, 1);
    const { repository, sql } = await runtime.open({
      resolveModel: syncResolver(v1.runtime.content),
    });
    await syncSeoNotes(repository, v1, 10);
    await seedSeoNotes(repository, sql);
    const seoRows = () =>
      sql.all("select id, seo_json from content_snapshots where seo_json is not null order by id");
    const seoReferences = () =>
      sql.all(
        "select snapshot_id, media_id from content_media_references where source_key = '$seo' order by snapshot_id",
      );
    const rows = await seoRows();
    const references = await seoReferences();
    expect(rows).toHaveLength(2);
    expect(references).toHaveLength(2);

    const migrated = await syncSeoNotes(repository, await seoNoteConfig(noteV3(), 2), 30);
    expect(migrated.result).toMatchObject({ status: "applied" });
    expect(await seoRows()).toEqual(rows);
    expect(await seoReferences()).toEqual(references);

    const rewritten = await syncSeoNotes(
      repository,
      await seoNoteConfig(noteV3(), 3, {
        blocks: ["richText"],
        fields: { title: field.text({ renamedFrom: "headline" }) },
        removedBlocks: ["note"],
      }),
      40,
    );
    expect(rewritten.result).toMatchObject({ status: "applied" });
    const live = (await repository.load({ entryId: contentEntryId("live") }))!;
    expect(live.draft.fields).toEqual({ title: "Head" });
    expect(live.draft.blocks).toEqual([]);
    expect(live.published!.seo).toEqual({ image: "m-2", title: "Live SEO" });
    expect(await seoReferences()).toEqual(references);
  },
);

contract(
  "refuses disabling SEO with stored values and prunes them atomically with the hint",
  async (runtime, expect) => {
    const v1 = await seoNoteConfig(noteV1, 1);
    let armed = false;
    const { repository, sql } = await runtime.open({
      beforeMutation: (name) => {
        if (armed && name === "sync.model.remove-seo") throw new Error("injected remove-seo");
      },
      resolveModel: syncResolver(v1.runtime.content),
    });
    await syncSeoNotes(repository, v1, 10);
    await seedSeoNotes(repository, sql);
    const before = await seoState(sql);

    const unhinted = await syncSeoNotes(
      repository,
      await seoNoteConfig(noteV1, 2, { seo: false }),
      30,
    );
    expect(unhinted.prepared.plan.diagnostics).toMatchObject([
      {
        affectedCount: 2,
        code: "SEO_REMOVAL_HAS_DATA",
        snapshots: [
          { entryId: "live", state: "draft", title: "Live" },
          { entryId: "live", state: "published", title: "Live" },
        ],
      },
    ]);
    expect(unhinted.prepared.report.text).toContain("removedSeo: true");
    expect(await seoState(sql)).toEqual(before);

    const hinted = await seoNoteConfig(noteV1, 2, { removedSeo: true, seo: false });
    armed = true;
    await expect(syncSeoNotes(repository, hinted, 31)).rejects.toMatchObject({
      code: "CONTENT_INVALID_STATE",
    });
    expect(await seoState(sql)).toEqual(before);
    armed = false;

    const pruned = await syncSeoNotes(repository, hinted, 32);
    expect(pruned.prepared.report.text).toContain("planned SEO removal");
    expect(pruned.result).toMatchObject({ status: "applied", targetVersion: before.version! + 1 });
    const after = await seoState(sql);
    expect(after.seo.map((row) => row.seo_json)).toEqual([null, null]);
    expect(after.seo.map((row) => row.revision)).toEqual(before.seo.map((row) => row.revision));
    expect(after.references).toEqual(before.references.filter((row) => row.source_key !== "$seo"));
    expect((await repository.loadMediaCatalogItem("m-2"))!.usageCount).toBe(0);
    expect((await repository.loadMediaCatalogItem("m-1"))!.usageCount).toBe(1);
  },
);

contract(
  "media metadata of a published SEO image requests a build while a draft-only one does not",
  async (runtime, expect) => {
    const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
    await seedModels(sql, "posts");
    for (const id of ["media-1", "media-2"]) await seedMedia(sql, id);
    await repository.create({
      entry: seoEntry("live", { image: mediaId("media-1") }, 1),
      mediaReferences: [seoReference("media-1")],
    });
    await repository.publish(publish("live", 1, 2, "live-published"));
    await repository.create({
      entry: seoEntry("draft", { image: mediaId("media-2") }, 3),
      mediaReferences: [seoReference("media-2")],
    });
    // A draft-only use keeps the item off the public site.
    await repository.saveCompleteDraft(save("live", 1, 4, { slug: "live" }));
    const version = await repository.publishedContentVersion();
    const builds = await pendingBuilds(sql);

    const drafted = await repository.updateMediaMetadata(
      metadataUpdate("media-2", 1, 10, { alt: "Draft" }),
    );
    expect(drafted).not.toHaveProperty("targetVersion");
    expect(await repository.publishedContentVersion()).toBe(version);
    expect(await pendingBuilds(sql)).toEqual(builds);

    const live = await repository.updateMediaMetadata(
      metadataUpdate("media-1", 1, 11, { alt: "Share image" }),
    );
    expect(live.targetVersion).toBe(version + 1);
    const pending = await pendingBuilds(sql);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ reason: "media_metadata", targetVersion: version + 1 });
    expect(await repository.loadPublicMedia("media-1")).toMatchObject({ alt: "Share image" });
  },
);

// ---------------------------------------------------------------- block envelope

/** A hero block with envelope values; the repository stores what it receives. */
