import { ContentUseCases } from "@lacecms/application";
import { readAllBuildContentPages } from "../../delivery/build-export.js";
import { defineCollection, defineConfig, defineGlobal } from "@lacecms/config";

import { builtInBlocks, defineBlock, field } from "@lacecms/content";

import { blockKey, contentModelKey, unixMilliseconds } from "@lacecms/domain";

import {
  type ContractRepository,
  type RepositoryContractCase,
  editor,
  admin,
  resolveRoute,
  sequence,
  seedModels,
  entry,
  publish,
  registerContract,
} from "../shared.js";

export const cases: RepositoryContractCase[] = [];
const contract = registerContract(cases);

contract(
  "maintains internal-link projections with no writes for unchanged locations",
  async (runtime, expect) => {
    const definition = defineBlock({
      type: "nestedLinks",
      version: 1,
      fields: { links: field.list({ item: field.group({ fields: { url: field.url() } }) }) },
      settings: { note: field.text({ defaultValue: "entry:ignored" }) },
    });
    const config = await defineConfig({
      blocks: [definition],
      content: [
        defineCollection({
          key: "posts",
          version: 1,
          route: "/blog/:slug",
          blocks: [definition.type],
          fields: { url: field.url() },
        }),
      ],
    });
    const harness = await runtime.open({ resolveModel: resolveRoute });
    const { repository, sql } = harness;
    await seedModels(sql, "posts");
    await repository.create({
      entry: entry("target", "posts", { slug: "target", updatedAt: 1 }),
      mediaReferences: [],
    });
    await repository.publish(publish("target", 1, 2));
    const service = (content = repository) =>
      new ContentUseCases({
        clock: { now: () => unixMilliseconds(10) },
        config: config.runtime,
        content,
        media: repository,
        idGenerator: { next: sequence("links") },
      });
    const useCases = service();
    const created = await useCases.create({
      actor: editor,
      modelKey: "posts",
      title: "Source",
      slug: "source",
      fields: { url: "entry:target" },
      blocks: [
        {
          type: definition.type,
          key: blockKey("source-block"),
          schemaVersion: 1,
          position: 1000,
          hidden: true,
          data: { links: [{ url: "entry:target" }, { url: "/manual" }] },
        },
      ],
    });
    const rows = () =>
      sql.all(
        "select snapshot_id,source_key,area,field_path,target_entry_id,delivered from content_entry_link_references order by snapshot_id,source_key,field_path",
      );
    const graph = async () =>
      (await sql.get<{ revision: number }>(
        "select revision from content_link_state where singleton_key=1",
      ))!.revision;
    expect(await graph()).toBe(1);
    expect(await rows()).toEqual([
      {
        snapshot_id: created.draft.id,
        source_key: "$fields",
        area: "fields",
        field_path: "/url",
        target_entry_id: "target",
        delivered: 1,
      },
      {
        snapshot_id: created.draft.id,
        source_key: "source-block",
        area: "data",
        field_path: "/links/0/url",
        target_entry_id: "target",
        delivered: 0,
      },
    ]);
    await sql.run("create table link_write_probe (kind text)");
    for (const operation of ["insert", "delete", "update"])
      await sql.run(
        `create trigger link_probe_${operation} after ${operation} on content_entry_link_references begin insert into link_write_probe values ('reference'); end`,
      );
    await sql.run(
      "create trigger graph_probe after update on content_link_state begin insert into link_write_probe values ('graph'); end",
    );
    const saved = await useCases.save({
      ...created.draft,
      actor: editor,
      entryId: created.id,
      expectedRevision: 1,
      title: "Renamed source",
    });
    expect(saved.draft.revision).toBe(2);
    expect(await sql.all("select * from link_write_probe")).toEqual([]);
    expect(await graph()).toBe(1);
    const published = await useCases.publish({
      actor: admin,
      entryId: created.id,
      expectedRevision: 2,
    });
    expect(await graph()).toBe(2);
    expect(await rows()).toHaveLength(4);
    const delivered = [
      { sourceKey: "$fields", area: "fields", pointer: "/url", targetId: "target" },
    ];
    expect((await repository.loadPublic("/blog/source"))!.internalLinks).toEqual(delivered);
    expect(
      (await repository.listPublic({ modelKey: contentModelKey("posts"), limit: 20 })).items.find(
        (item) => item.entry.id === created.id,
      )!.internalLinks,
    ).toEqual(delivered);
    const pages = await readAllBuildContentPages(repository, 1);
    expect(pages.entries.find((item) => item.entry.id === created.id)!.internalLinks).toEqual(
      delivered,
    );
    expect(pages.entries.find((item) => item.entry.id === "target")!.internalLinks).toEqual([]);
    const reordered = await useCases.save({
      ...saved.draft,
      actor: editor,
      entryId: created.id,
      expectedRevision: 2,
      blocks: saved.draft.blocks.map((block) => ({
        ...block,
        hidden: false,
        data: { links: [{ url: "/manual" }, { url: "entry:target" }] },
      })),
    });
    expect(await graph()).toBe(3);
    expect(
      (await rows()).find((row) => row.snapshot_id === created.draft.id && row.area === "data"),
    ).toMatchObject({ field_path: "/links/1/url", delivered: 1 });
    expect((await repository.loadPublic("/blog/source"))!.internalLinks).toEqual(delivered);
    const reverted = await useCases.revertDraft({
      actor: editor,
      entryId: created.id,
      expectedRevision: reordered.draft.revision,
    });
    expect(reverted.draft.blocks[0]!.hidden).toBe(true);
    expect(await graph()).toBe(4);
    const duplicate = await useCases.duplicate({ actor: editor, entryId: created.id });
    expect(await graph()).toBe(5);
    expect(
      (await rows())
        .filter((row) => row.snapshot_id === duplicate.draft.id)
        .map((row) => row.source_key),
    ).toEqual(["$fields", duplicate.draft.blocks[0]!.key]);
    await useCases.unpublish({
      actor: admin,
      entryId: created.id,
      expectedPublishedSnapshotId: published.entry.published!.id,
    });
    expect(await graph()).toBe(6);
    expect(
      (await rows()).filter((row) => row.snapshot_id === published.entry.published!.id),
    ).toEqual([]);
    await useCases.delete({
      actor: editor,
      entryId: duplicate.id,
      expectedRevision: duplicate.draft.revision,
    });
    expect(await graph()).toBe(7);
    const before = {
      rows: await rows(),
      graph: await graph(),
      entry: await repository.load({ entryId: created.id }),
    };
    const failing = service(
      harness.reopen({
        beforeMutation: (checkpoint) => {
          if (checkpoint === "draft.internal-links.complete")
            throw new Error("injected link failure");
        },
      }),
    );
    await expect(
      failing.save({
        ...reverted.draft,
        actor: editor,
        entryId: created.id,
        expectedRevision: reverted.draft.revision,
        fields: {},
      }),
    ).rejects.toThrow();
    expect({
      rows: await rows(),
      graph: await graph(),
      entry: await repository.load({ entryId: created.id }),
    }).toEqual(before);
  },
);

contract(
  "pages indexed link targets and all impact locations at high fan-out",
  async (runtime, expect) => {
    const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
    await seedModels(sql, "posts", "settings");
    await repository.create({
      entry: entry("target", "posts", { slug: "target", updatedAt: 1 }),
      mediaReferences: [],
    });
    await repository.publish(publish("target", 1, 2));
    await repository.create({
      entry: entry("settings-entry", "settings", { updatedAt: 1 }),
      mediaReferences: [],
    });
    const ids = Array.from(
      { length: 1000 },
      (_, index) => `source-${String(index).padStart(4, "0")}`,
    );
    const json = JSON.stringify(ids);
    await sql.run(
      "insert into content_entries (id,model_key,created_by,created_at,updated_at) select value,'posts','editor',1,1 from json_each(?)",
      json,
    );
    await sql.run(
      `insert into content_snapshots (id,entry_id,revision,title,fields_json,schema_version,created_at,updated_at,updated_by)
    select value||'-draft',value,1,value,'{}',1,1,1,'editor' from json_each(?) union all
    select value||'-published',value,1,value,'{}',1,1,1,'editor' from json_each(?)`,
      json,
      json,
    );
    await sql.run(
      "update content_entries set draft_snapshot_id=id||'-draft',published_snapshot_id=id||'-published' where id in (select value from json_each(?))",
      json,
    );
    await sql.run(
      "insert into published_routes (path,entry_id,snapshot_id,updated_at) select '/sources/'||value,value,value||'-published',1 from json_each(?)",
      json,
    );
    await sql.run(
      "insert into content_entry_link_references select value||'-published','$fields','fields','/url','target',1 from json_each(?)",
      json,
    );
    await sql.run(
      "insert into content_entry_link_references select 'source-0000-published','block','data','/links/'||value||'/url','target',case when value=5 then 0 else 1 end from json_each(?)",
      JSON.stringify(Array.from({ length: 199 }, (_, i) => i)),
    );
    await sql.run("update content_snapshots set title='Wild%card' where id='source-0000-draft'");
    await sql.run("update content_snapshots set title='wild_card' where id='source-0001-draft'");
    await sql.run("update content_snapshots set title='日本語' where id='source-0002-draft'");
    const statuses = await repository.resolveLinkTargets([
      "target",
      "settings-entry",
      "missing",
      ...ids.slice(0, 197),
    ]);
    expect(Object.keys(statuses)).toHaveLength(200);
    expect(statuses.target).toMatchObject({ state: "published", path: "/blog/target" });
    expect(statuses["settings-entry"]).toEqual({
      id: "settings-entry",
      state: "non-routable",
      modelKey: "settings",
    });
    expect(statuses.missing).toEqual({ id: "missing", state: "missing" });
    expect(
      (await repository.listLinkTargets({ search: "  WILD%  ", limit: 20 })).items.map(
        (item) => item.id,
      ),
    ).toEqual([ids[0]]);
    expect(
      (await repository.listLinkTargets({ search: "wild_", limit: 20 })).items.map(
        (item) => item.id,
      ),
    ).toEqual([ids[1]]);
    expect(
      (await repository.listLinkTargets({ search: "日本", limit: 20 })).items.map(
        (item) => item.id,
      ),
    ).toEqual([ids[2]]);
    expect((await repository.listLinkTargets({ status: "unpublished", limit: 20 })).items).toEqual(
      [],
    );
    const picker = await repository.listLinkTargets({ limit: 2 });
    expect(picker.items).toHaveLength(2);
    const picker2 = await repository.listLinkTargets({ limit: 2, after: picker.nextCursor! });
    expect(
      picker2.items
        .map((item) => item.id)
        .some((id) => picker.items.some((item) => item.id === id)),
    ).toBe(false);
    await expect(
      repository.listLinkTargets({ search: "foreign", limit: 2, after: picker.nextCursor! }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    const query = { targetId: "target", action: "delete" as const, actorId: "admin", limit: 50 };
    const first = await repository.readLinkImpact(query);
    if (first.mode !== "sources") throw new Error("Expected sources");
    expect(first.hasPublishedUsages).toBe(true);
    expect(first.sources).toHaveLength(50);
    const dense = first.sources[0]!;
    expect(dense.locations).toHaveLength(10);
    let locationCursor = dense.nextLocationsCursor;
    const locations = [...dense.locations];
    while (locationCursor) {
      const page = await repository.readLinkImpact({
        ...query,
        sourceEntryId: dense.entryId,
        snapshotId: dense.snapshotId,
        locationsAfter: locationCursor,
      });
      if (page.mode !== "locations") throw new Error("Expected locations");
      expect(page.locations.length).toBeLessThanOrEqual(50);
      locations.push(...page.locations);
      locationCursor = page.nextCursor;
    }
    expect(locations).toHaveLength(200);
    expect(new Set(locations.map((location) => JSON.stringify(location))).size).toBe(200);
    let sourceCursor = first.nextCursor;
    const sources = [...first.sources];
    while (sourceCursor) {
      const page = await repository.readLinkImpact({ ...query, after: sourceCursor });
      if (page.mode !== "sources") throw new Error("Expected sources");
      sources.push(...page.sources);
      sourceCursor = page.nextCursor;
    }
    expect(sources).toHaveLength(1000);
    expect(new Set(sources.map((source) => source.snapshotId)).size).toBe(1000);
    await expect(
      repository.readLinkImpact({ ...query, action: "unpublish", after: first.nextCursor! }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    await expect(
      repository.readLinkImpact({
        ...query,
        sourceEntryId: "other",
        snapshotId: dense.snapshotId,
        locationsAfter: dense.nextLocationsCursor!,
      }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    await sql.run("update content_link_state set revision=revision+1 where singleton_key=1");
    await expect(
      repository.readLinkImpact({ ...query, after: first.nextCursor! }),
    ).rejects.toMatchObject({ code: "CONTENT_LINK_IMPACT_CHANGED" });
    const plan = await sql.all(
      "explain query plan select snapshot_id from content_entry_link_references where target_entry_id=? and snapshot_id>? order by snapshot_id limit 51",
      "target",
      "",
    );
    expect(JSON.stringify(plan)).toContain("content_entry_link_references_target_idx");
  },
);

contract(
  "validates delivered internal targets at publication including self links and final-state races",
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
        defineGlobal({ key: "settings", version: 1, blocks: [], fields: {} }),
      ],
    });
    const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
    await seedModels(sql, "posts", "settings");
    await repository.create({
      entry: entry("global-target", "settings", { updatedAt: 1 }),
      mediaReferences: [],
    });
    const useCases = new ContentUseCases({
      config: config.runtime,
      content: repository,
      media: repository,
      clock: { now: () => unixMilliseconds(10) },
      idGenerator: { next: sequence("target-policy") },
    });
    const create = (slug: string, url?: string) =>
      useCases.create({
        actor: editor,
        modelKey: "posts",
        title: slug,
        slug,
        fields: url === undefined ? {} : { url },
        blocks: [],
      });
    const target = await create("target");
    let source = await create("source", `entry:${target.id}`);
    const before = await repository.publishedContentVersion();
    await expect(
      useCases.publish({ actor: admin, entryId: source.id, expectedRevision: 1 }),
    ).rejects.toMatchObject({
      issues: [{ code: "internal_link_unavailable", path: ["fields", "url"] }],
    });
    expect(await repository.publishedContentVersion()).toBe(before);
    await expect(create("bad-global", "entry:global-target")).rejects.toMatchObject({
      issues: [{ code: "internal_link_non_routable", path: ["fields", "url"] }],
    });
    await useCases.publish({ actor: admin, entryId: target.id, expectedRevision: 1 });
    await useCases.publish({ actor: admin, entryId: source.id, expectedRevision: 1 });
    const targetWithReturn = await useCases.save({
      ...target.draft,
      actor: editor,
      entryId: target.id,
      expectedRevision: 1,
      fields: { url: `entry:${source.id}` },
    });
    await useCases.publish({
      actor: admin,
      entryId: target.id,
      expectedRevision: targetWithReturn.draft.revision,
    });
    const self = await create("self");
    const selfSaved = await useCases.save({
      ...self.draft,
      actor: editor,
      entryId: self.id,
      expectedRevision: 1,
      fields: { url: `entry:${self.id}` },
    });
    await expect(
      useCases.publish({
        actor: admin,
        entryId: self.id,
        expectedRevision: selfSaved.draft.revision,
      }),
    ).resolves.toMatchObject({ publication: "published" });
    const hidden = await useCases.create({
      actor: editor,
      modelKey: "posts",
      title: "Hidden",
      slug: "hidden",
      fields: {},
      blocks: [
        {
          key: blockKey("hidden-link"),
          type: "link",
          schemaVersion: 1,
          position: 1000,
          hidden: true,
          data: { label: "Missing", url: "entry:missing" },
        },
      ],
    });
    await expect(
      useCases.publish({ actor: admin, entryId: hidden.id, expectedRevision: 1 }),
    ).resolves.toMatchObject({ publication: "published" });
    const visible = await useCases.save({
      ...hidden.draft,
      actor: editor,
      entryId: hidden.id,
      expectedRevision: 1,
      blocks: hidden.draft.blocks.map((block) => ({ ...block, hidden: false })),
    });
    await expect(
      useCases.publish({
        actor: admin,
        entryId: hidden.id,
        expectedRevision: visible.draft.revision,
      }),
    ).rejects.toMatchObject({
      issues: [{ code: "internal_link_unavailable", path: ["blocks", 0, "data", "url"] }],
    });
    const conflicted = await create("self");
    await expect(
      useCases.publish({ actor: admin, entryId: conflicted.id, expectedRevision: 1 }),
    ).rejects.toMatchObject({ code: "CONTENT_ROUTE_CONFLICT" });
    // Final commit must refuse targets removed after application preflight.
    const raceTarget = await create("race-target");
    const racePublished = await useCases.publish({
      actor: admin,
      entryId: raceTarget.id,
      expectedRevision: 1,
    });
    source = await create("race-source", `entry:${raceTarget.id}`);
    const racePort = Object.create(repository) as ContractRepository;
    racePort.resolveLinkTargets = async (ids) => {
      const statuses = await repository.resolveLinkTargets(ids);
      await useCases.unpublish({
        actor: admin,
        entryId: raceTarget.id,
        expectedPublishedSnapshotId: racePublished.entry.published!.id,
      });
      return statuses;
    };
    const raceUseCases = new ContentUseCases({
      config: config.runtime,
      content: racePort,
      media: repository,
      clock: { now: () => unixMilliseconds(20) },
      idGenerator: { next: sequence("race") },
    });
    await expect(
      raceUseCases.publish({ actor: admin, entryId: source.id, expectedRevision: 1 }),
    ).rejects.toMatchObject({
      issues: [{ code: "internal_link_unavailable", path: ["fields", "url"] }],
    });
    expect((await repository.load({ entryId: source.id }))!.published).toBeUndefined();
    expect(await sql.all("pragma foreign_key_check")).toEqual([]);
  },
);
