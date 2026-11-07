import {
  applyPreparedConfigurationSynchronization,
  ContentUseCases,
  prepareConfigurationSynchronization,
} from "@lacecms/application";

import { defineCollection, defineConfig, defineGlobal, definePage } from "@lacecms/config";

import { builtInBlocks, defineBlock, field } from "@lacecms/content";
import type { JsonObject } from "@lacecms/content";
import {
  actorId,
  blockKey,
  contentEntryId,
  contentModelKey,
  contentSnapshotId,
  unixMilliseconds,
} from "@lacecms/domain";

import {
  type RepositoryContractCase,
  editor,
  admin,
  resolveRoute,
  sequence,
  count,
  seedModels,
  entry,
  publish,
  registerContract,
} from "../shared.js";

export const cases: RepositoryContractCase[] = [];
const contract = registerContract(cases);

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
