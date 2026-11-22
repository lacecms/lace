import {
  ContentLinkUseCases,
  ContentReferenceUseCases,
  ContentUseCases,
  contentModelRoute,
  opaqueCursor,
} from "@lacecms/application";
import { defineCollection, defineConfig } from "@lacecms/config";
import { defineBlock, field } from "@lacecms/content";
import type { JsonObject } from "@lacecms/content";
import { blockKey, unixMilliseconds } from "@lacecms/domain";
import type { ContentBlock, ContentEntry } from "@lacecms/domain";
import { admin, editor, registerContract, seedModels, sequence } from "../shared.js";
import type {
  ContractRepository,
  RepositoryContractCase,
  RepositoryContractRuntime,
} from "../shared.js";

export const cases: RepositoryContractCase[] = [];
const contract = registerContract(cases);

async function setup(runtime: RepositoryContractRuntime) {
  const link = () => field.reference({ models: ["posts", "testimonials"] });
  const block = defineBlock({
    type: "referenceCard",
    version: 1,
    fields: {
      values: field.list({ item: field.group({ fields: { entry: link() } }) }),
    },
  });
  const config = await defineConfig({
    blocks: [block],
    content: [
      defineCollection({
        key: "posts",
        version: 1,
        blocks: [block.type],
        route: "/blog/:slug",
        fields: { related: field.list({ item: link() }), other: link(), url: field.url() },
      }),
      defineCollection({ key: "testimonials", version: 1, fields: {} }),
    ],
  });
  const models = new Map(config.runtime.content.map((model) => [String(model.key), model]));
  const harness = await runtime.open({
    resolveModel: (key) => (models.has(key) ? contentModelRoute(models.get(key)!) : undefined),
  });
  await seedModels(harness.sql, "posts", "testimonials");
  for (const model of models.values())
    await harness.sql.run(
      "update content_models set structure_hash=? where key=?",
      model.structureHash,
      model.key,
    );
  const id = sequence("references");
  const use = (repository: ContractRepository = harness.repository) =>
    new ContentUseCases({
      listQueryLimits: runtime.listQueryLimits,
      clock: { now: () => unixMilliseconds(10) },
      config: config.runtime,
      content: repository,
      media: repository,
      idGenerator: { next: id },
    });
  const service = use();
  const create = (title: string, fields: JsonObject = {}, blocks: readonly ContentBlock[] = []) =>
    service.create({ actor: editor, modelKey: "posts", title, slug: title, fields, blocks });
  const save = (
    entry: ContentEntry,
    fields: JsonObject,
    blocks = entry.draft.blocks,
    writer = service,
  ) =>
    writer.save({
      ...entry.draft,
      actor: editor,
      entryId: entry.id,
      expectedRevision: entry.draft.revision,
      fields,
      blocks,
    });
  const publish = (entry: ContentEntry, writer = service, idempotencyKey?: string) =>
    writer.publish({
      entryId: entry.id,
      actor: admin,
      expectedRevision: entry.draft.revision,
      ...(idempotencyKey ? { idempotencyKey } : {}),
    });
  const rows = (entry: ContentEntry) =>
    harness.sql.all(
      "select rowid,source_key,field_path,target_entry_id from content_entry_link_references where snapshot_id=? order by source_key,field_path",
      entry.draft.id,
    );
  return { ...harness, block, config, create, save, publish, rows, service, use };
}

contract(
  "writes typed references across independent draft and publication phases",
  async (runtime, expect) => {
    const { create, save, publish, rows, service, sql, repository, block } = await setup(runtime);
    const target = await service.create({
      actor: editor,
      modelKey: "testimonials",
      title: "Review",
      fields: {},
      blocks: [],
    });
    const a0 = await create("first");
    const b0 = await create("second");
    const a1 = await save(a0, { related: [b0.id] });
    await publish(b0);
    await publish(a1);
    const a2 = await save(a1, {});
    const b1 = await save(b0, { related: [a0.id] });
    await expect(publish(b1)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      issues: [
        {
          code: "reference_cycle",
          path: ["fields", "related", 0],
          details: {
            witness: [b0.id, a0.id, b0.id],
            truncated: false,
            publishFirst: { entryId: a0.id, title: "first" },
          },
        },
      ],
    });
    await expect(
      service.revertDraft({ actor: editor, entryId: a0.id, expectedRevision: a2.draft.revision }),
    ).rejects.toMatchObject({
      issues: [{ code: "reference_cycle", path: ["fields", "related", 0] }],
    });
    await publish(a2);
    await publish(b1);
    const hidden: ContentBlock = {
      type: block.type,
      key: blockKey("original"),
      schemaVersion: 1,
      position: 1000,
      hidden: true,
      settings: {},
      data: { values: [{ entry: target.id }] },
    };
    const c0 = await create("third", { related: [target.id] }, [hidden]);
    await expect(publish(c0)).rejects.toMatchObject({
      issues: [{ code: "reference_target_unpublished", path: ["fields", "related", 0] }],
    });
    await publish(target);
    const cPublished = await publish(c0, service, "reference-replay");
    // Simulate a removed target publication to exercise replay before target checks.
    await sql.run("update content_entries set published_snapshot_id=null where id=?", target.id);
    const replay = await publish(c0, service, "reference-replay");
    expect(replay.publication).toBe("replayed");
    expect(replay.entry.published!.id).toBe(cPublished.entry.published!.id);
    const duplicate = await service.duplicate({ actor: editor, entryId: c0.id });
    expect(duplicate.draft.fields).toEqual(c0.draft.fields);
    expect(duplicate.draft.blocks[0]!.key).not.toBe(hidden.key);
    expect(await rows(duplicate)).toMatchObject([
      { source_key: "$fields", field_path: "/related/0", target_entry_id: target.id },
      {
        source_key: duplicate.draft.blocks[0]!.key,
        field_path: "/values/0/entry",
        target_entry_id: target.id,
      },
    ]);
    expect((await repository.loadPublic("/blog/third"))!.internalLinks).toEqual([]);
    expect(await repository.load({ entryId: b0.id })).toMatchObject({
      published: { fields: { related: [a0.id] } },
    });
  },
);

contract(
  "retains existing orphan selections at their declared field without rewriting unchanged usage rows",
  async (runtime, expect) => {
    const { create, save, rows, service, sql } = await setup(runtime);
    const target = await create("target");
    const another = await create("another");
    const source = await create("source", { related: [target.id, another.id] });
    await sql.run("delete from content_entries where id=?", target.id);
    const initial = await rows(source);
    await sql.run("create table reference_write_probe (kind text)");
    for (const operation of ["insert", "delete", "update"])
      await sql.run(`create trigger typed_reference_probe_${operation} after ${operation} on content_entry_link_references
      begin insert into reference_write_probe values ('usage'); end`);
    await sql.run(`create trigger typed_reference_graph_probe after update on content_link_state
    begin insert into reference_write_probe values ('graph'); end`);
    const titleOnly = await service.save({
      ...source.draft,
      title: "New title",
      actor: editor,
      entryId: source.id,
      expectedRevision: 1,
    });
    expect(await rows(source)).toEqual(initial);
    expect(await sql.all("select * from reference_write_probe")).toEqual([]);
    const reordered = await save(titleOnly, { related: [another.id, target.id] });
    expect(reordered.draft.fields.related).toEqual([another.id, target.id]);
    await expect(save(reordered, { related: [target.id, target.id] })).rejects.toMatchObject({
      issues: [{ code: "reference_target_missing", path: ["fields", "related", 1] }],
    });
    await expect(save(reordered, { other: target.id })).rejects.toMatchObject({
      issues: [{ code: "reference_target_missing", path: ["fields", "other"] }],
    });
    await expect(save(titleOnly, { other: target.id })).rejects.toMatchObject({
      code: "CONTENT_REVISION_CONFLICT",
    });
    await expect(service.duplicate({ actor: editor, entryId: source.id })).rejects.toMatchObject({
      issues: [{ code: "reference_target_missing", path: ["fields", "related", 1] }],
    });
  },
);

/** Let both callers prepare their commands, then exercise a chosen commit order. */
async function interleave<FirstCommand, FirstResult, SecondCommand, SecondResult>(
  first: (dispatch: (input: FirstCommand) => Promise<FirstResult>) => Promise<unknown>,
  second: (dispatch: (input: SecondCommand) => Promise<SecondResult>) => Promise<unknown>,
  commitFirst: (input: FirstCommand) => Promise<FirstResult>,
  commitSecond: (input: SecondCommand) => Promise<SecondResult>,
): Promise<PromiseSettledResult<unknown>[]> {
  const ready = Promise.withResolvers<void>();
  const committed = Promise.withResolvers<void>();
  const a = first(async (input) => {
    await ready.promise;
    return commitFirst(input);
  }).finally(() => committed.resolve());
  const b = second(async (input) => {
    ready.resolve();
    await committed.promise;
    return commitSecond(input);
  }).finally(() => ready.resolve());
  return Promise.allSettled([a, b]);
}

contract(
  "rejects a concurrent closing typed edge in either draft or publication commit order",
  async (runtime, expect) => {
    for (const reverse of [false, true]) {
      const { create, save, publish, use, reopen, sql } = await setup(runtime);
      const first = reopen();
      const second = reopen();
      const a = await create("a");
      const b = await create("b");
      const draftAttempts = [
        { entry: a, target: b.id },
        { entry: b, target: a.id },
      ];
      if (reverse) draftAttempts.reverse();
      const saveCandidate =
        (index: number) => (dispatch: ContractRepository["saveCompleteDraft"]) =>
          save(
            draftAttempts[index]!.entry,
            { related: [draftAttempts[index]!.target] },
            undefined,
            use(
              Object.assign(Object.create(index === 0 ? first : second) as ContractRepository, {
                saveCompleteDraft: dispatch,
              }),
            ),
          );
      const before = await sql.get<{ revision: number }>("select revision from content_link_state");
      const outcomes = await interleave(
        saveCandidate(0),
        saveCandidate(1),
        first.saveCompleteDraft.bind(first),
        second.saveCompleteDraft.bind(second),
      );
      expect(outcomes).toMatchObject([
        { status: "fulfilled" },
        {
          status: "rejected",
          reason: {
            code: "VALIDATION_FAILED",
            issues: [{ code: "reference_cycle", path: ["fields", "related", 0] }],
          },
        },
      ]);
      expect(await sql.get("select revision from content_link_state")).toEqual({
        revision: before!.revision + 1,
      });

      const x = await create("x");
      const y = await create("y");
      const z = await create("z");
      await publish(x);
      await publish(y);
      const z1 = await save(z, { related: [x.id] });
      await publish(z1);
      await save(z1, {});
      const publishAttempts = [
        await save(x, { related: [y.id] }),
        await save(y, { related: [z.id] }),
      ];
      if (reverse) publishAttempts.reverse();
      const publishCandidate = (index: number) => (dispatch: ContractRepository["publish"]) =>
        publish(
          publishAttempts[index]!,
          use(
            Object.assign(Object.create(index === 0 ? first : second) as ContractRepository, {
              publish: dispatch,
            }),
          ),
        );
      const version = await first.publishedContentVersion();
      const published = await interleave(
        publishCandidate(0),
        publishCandidate(1),
        first.publish.bind(first),
        second.publish.bind(second),
      );
      expect(published).toMatchObject([
        { status: "fulfilled" },
        {
          status: "rejected",
          reason: { code: "VALIDATION_FAILED", issues: [{ code: "reference_cycle" }] },
        },
      ]);
      expect(await second.publishedContentVersion()).toBe(version + 1);
    }
  },
);

contract(
  "rolls back typed usage, snapshots and public work after injected entry write faults",
  async (runtime, expect) => {
    const { create, save, publish, reopen, sql, use } = await setup(runtime);
    const target = await create("target");
    await publish(target);
    const source = await create("source");
    const state = async () =>
      Promise.all([
        sql.all("select * from content_entries order by id"),
        sql.all("select * from content_snapshots order by id"),
        sql.all(
          "select * from content_entry_link_references order by snapshot_id,source_key,field_path",
        ),
        sql.all("select * from content_link_state"),
        sql.all("select * from published_state"),
        sql.all("select * from outbox_events order by id"),
        sql.all("select * from idempotency_records order by scope,key"),
        sql.all("select * from preview_capture_state"),
        sql.all("select * from mutation_guards"),
      ]);
    const failedAt = (checkpoint: string) =>
      use(
        reopen({
          beforeMutation: (name) => {
            if (name === checkpoint) throw new Error("inject reference write failure");
          },
        }),
      );
    const before = await state();
    await expect(
      save(source, { related: [target.id] }, undefined, failedAt("draft.internal-links.complete")),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    expect(await state()).toEqual(before);

    const saved = await save(source, { related: [target.id] });
    const beforePublication = await state();
    await expect(
      publish(saved, failedAt("build-outbox"), "rollback-reference"),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    expect(await state()).toEqual(beforePublication);
    await expect(publish(saved, undefined, "rollback-reference")).resolves.toMatchObject({
      publication: "published",
    });
  },
);

contract(
  "searches and resolves typed reference targets across publication states",
  async (runtime, expect) => {
    const { create, publish, repository, service, sql } = await setup(runtime);
    await seedModels(sql, "settings");
    const makeReview = (title: string) =>
      service.create({ actor: editor, modelKey: "testimonials", title, fields: {}, blocks: [] });
    const first = await makeReview("Wild% First");
    const second = await makeReview("wild% Second");
    const wildcard = await makeReview("Wild_ Third");
    const post = await create("post");
    await publish(first);
    await publish(post);
    await sql.run(
      "insert into content_entries (id,model_key,created_by,created_at,updated_at) values ('settings','settings','admin',1,1)",
    );

    const queries = new ContentReferenceUseCases(repository);
    const viewer = { ...editor, role: "viewer" } as const;
    const query = { modelKey: "testimonials", search: "  WILD%  ", limit: 1 };
    const page = await queries.list(viewer, query);
    expect(page.items).toEqual([
      {
        id: first.id,
        title: "Wild% First",
        modelKey: "testimonials",
        modelKind: "collection",
        state: "published",
      },
    ]);
    const next = { ...query, after: page.nextCursor! };
    expect((await queries.list(viewer, next)).items).toMatchObject([
      { id: second.id, state: "unpublished" },
    ]);
    await expect(queries.list(viewer, { ...next, modelKey: "posts" })).rejects.toMatchObject({
      code: "CONTENT_INVALID_STATE",
    });
    await expect(queries.list(viewer, { ...next, search: "Wild_" })).rejects.toMatchObject({
      code: "CONTENT_INVALID_STATE",
    });
    await expect(
      queries.list(viewer, { ...query, after: opaqueCursor("bad") }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    expect((await queries.list(viewer, { ...query, search: "Wild_" })).items).toMatchObject([
      { id: wildcard.id },
    ]);
    expect((await queries.list(viewer, { modelKey: "settings", limit: 20 })).items).toEqual([]);
    expect(
      await queries.resolve(viewer, [first.id, second.id, post.id, "missing", "settings"]),
    ).toMatchObject({
      [first.id]: { state: "published" },
      [second.id]: { state: "unpublished" },
      [post.id]: { state: "published", path: "/blog/post" },
      missing: { id: "missing", state: "missing" },
      settings: { id: "settings", state: "ineligible" },
    });
    const urlQueries = new ContentLinkUseCases(repository, ["testimonials"]);
    expect((await urlQueries.list(viewer, { modelKey: "testimonials", limit: 20 })).items).toEqual(
      [],
    );
    const maxIds = Array.from({ length: 200 }, (_, index) => `missing-${index}`);
    expect(Object.keys(await queries.resolve(viewer, maxIds))).toHaveLength(200);
    expect(() => queries.resolve(viewer, [...maxIds, "extra"])).toThrow();
    expect(() => queries.resolve(viewer, [first.id, first.id])).toThrow();
  },
);

contract(
  "pages direct typed impact by source and location without traversing ancestors",
  async (runtime, expect) => {
    const { create, save, publish, repository, block } = await setup(runtime);
    const anna = await create("anna");
    await publish(anna);
    const review = await create("review", { other: anna.id });
    const publishedReview = await publish(review);
    const page = await create("page", { other: review.id });
    await publish(page);
    const query = { action: "delete", targetId: anna.id, actorId: admin.id, limit: 50 } as const;
    const direct = await repository.readReferenceImpact(query);
    expect(direct).toMatchObject({ hasPublishedBlockers: true, hasDraftUsages: true });
    expect(direct).not.toHaveProperty("receipt");
    if (direct.mode !== "sources") throw new Error("Expected source page");
    expect(direct.sources).toHaveLength(2);
    expect(direct.sources.every((source) => source.entryId === review.id)).toBe(true);
    expect(direct.sources.find((source) => source.phase === "published")).toMatchObject({
      title: "review",
      modelKey: "posts",
      snapshotId: publishedReview.entry.published!.id,
      locations: [{ sourceKey: "$fields", area: "fields", pointer: "/other", delivered: true }],
    });

    const hidden = await create("hidden", {}, [
      {
        type: block.type,
        key: blockKey("hidden-card"),
        schemaVersion: 1,
        position: 1000,
        hidden: true,
        settings: {},
        data: { values: [{ entry: anna.id }] },
      },
    ]);
    const hiddenPublished = await publish(hidden);
    await save(hidden, {}, []);
    await create("url-only", { url: `entry:${anna.id}` });
    const many = await create("many-locations", {
      related: Array.from({ length: 25 }, () => anna.id),
    });
    for (let i = 0; i < 52; i++) await create(`additional-${i}`, { other: anna.id });

    const first = await repository.readReferenceImpact(query);
    if (first.mode !== "sources") throw new Error("Expected source page");
    expect(first.sources).toHaveLength(50);
    expect(first).toMatchObject({ hasPublishedBlockers: true, hasDraftUsages: true });
    const rest = await repository.readReferenceImpact({ ...query, after: first.nextCursor! });
    if (rest.mode !== "sources") throw new Error("Expected source page");
    const sources = [...first.sources, ...rest.sources];
    expect(sources).toHaveLength(56);
    expect(new Set(sources.map((source) => source.snapshotId)).size).toBe(sources.length);
    expect(sources.find((source) => source.entryId === hidden.id)).toMatchObject({
      phase: "published",
      snapshotId: hiddenPublished.entry.published!.id,
      locations: [
        {
          sourceKey: "hidden-card",
          area: "data",
          pointer: "/values/0/entry",
          delivered: false,
        },
      ],
    });
    const group = sources.find((source) => source.entryId === many.id)!;
    expect(group.locations).toHaveLength(10);
    const locations = {
      ...query,
      sourceEntryId: many.id,
      snapshotId: group.snapshotId,
      limit: 7,
      locationsAfter: group.nextLocationsCursor!,
    };
    const pointers = group.locations.map((item) => item.pointer);
    let locationPage = await repository.readReferenceImpact(locations);
    while (locationPage.mode === "locations") {
      pointers.push(...locationPage.locations.map((item) => item.pointer));
      if (!locationPage.nextCursor) break;
      locationPage = await repository.readReferenceImpact({
        ...locations,
        locationsAfter: locationPage.nextCursor,
      });
    }
    expect(new Set(pointers)).toEqual(
      new Set(Array.from({ length: 25 }, (_, i) => `/related/${i}`)),
    );
    await expect(
      repository.readReferenceImpact({ ...locations, action: "unpublish" }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    await expect(
      repository.readReferenceImpact({ ...locations, snapshotId: review.draft.id }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    await save(many, { related: [anna.id] });
    await expect(repository.readReferenceImpact(locations)).rejects.toMatchObject({
      code: "CONTENT_REFERENCE_IMPACT_CHANGED",
    });
    await expect(
      repository.readReferenceImpact({ ...query, after: first.nextCursor! }),
    ).rejects.toMatchObject({ code: "CONTENT_REFERENCE_IMPACT_CHANGED" });

    const reviewWithoutAnna = await save(review, {});
    expect(await repository.readReferenceImpact(query)).toMatchObject({
      hasPublishedBlockers: true,
    });
    await publish(reviewWithoutAnna);
    expect(await repository.readReferenceImpact(query)).toMatchObject({
      hasPublishedBlockers: false,
      hasDraftUsages: true,
      receipt: expect.any(String),
    });
  },
);

contract(
  "blocks delivered reference removal and enforces independent draft reviews atomically",
  async (runtime, expect) => {
    const { create, save, publish, service, repository, sql, block } = await setup(runtime);
    const target = await create("target");
    let targetPublication = (await publish(target)).entry.published!.id;
    const source = await create("referring", { other: target.id });
    const deletion = { actor: admin, entryId: target.id, expectedRevision: target.draft.revision };
    const unpublish = (key?: string) =>
      service.unpublish({
        actor: admin,
        entryId: target.id,
        expectedPublishedSnapshotId: targetPublication,
        ...(key === undefined ? {} : { idempotencyKey: key }),
      });
    const impact = { action: "delete", actorId: admin.id, targetId: target.id, limit: 20 } as const;
    const versions = async () => ({
      state: await sql.all("select version from published_state"),
      graph: await sql.all("select revision from content_link_state"),
      work: await sql.all("select id, payload_json from outbox_events order by id"),
    });
    const initial = await versions();
    await expect(service.delete(deletion)).rejects.toMatchObject({
      code: "CONTENT_REFERENCE_REVIEW_REQUIRED",
    });
    expect(await versions()).toEqual(initial);
    expect(await unpublish("withdraw")).toMatchObject({ unpublication: "unpublished" });
    const withdrawn = await versions();
    expect(await unpublish("withdraw")).toMatchObject({ unpublication: "replayed" });
    expect(await versions()).toEqual(withdrawn);
    expect((await repository.load({ entryId: source.id }))!.draft.fields).toEqual({
      other: target.id,
    });
    targetPublication = (await publish(target)).entry.published!.id;
    const before = await repository.readReferenceImpact(impact);
    const acknowledgment = { receipt: before.receipt!, acknowledgeDraftReferences: true } as const;

    await publish(source);
    const current = await versions();
    await expect(
      service.delete({ ...deletion, referenceImpact: acknowledgment }),
    ).rejects.toMatchObject({ code: "CONTENT_REFERENCES_IN_USE" });
    await expect(unpublish()).rejects.toMatchObject({ code: "CONTENT_REFERENCES_IN_USE" });
    await expect(service.delete({ ...deletion, actor: editor })).rejects.toMatchObject({
      code: "AUTHORIZATION_DENIED",
    });
    expect(await versions()).toEqual(current);
    const removed = await save(source, {});
    await expect(unpublish()).rejects.toMatchObject({ code: "CONTENT_REFERENCES_IN_USE" });
    await publish(removed);

    const hiddenSource = await create("hidden", {}, [
      {
        type: block.type,
        key: blockKey("card"),
        schemaVersion: 1,
        position: 1000,
        hidden: true,
        settings: {},
        data: { values: [{ entry: target.id }] },
      },
    ]);
    await publish(hiddenSource);
    await save(hiddenSource, {}, []);
    const informational = await repository.readReferenceImpact(impact);
    expect(informational).toMatchObject({ hasPublishedBlockers: false, hasDraftUsages: false });
    expect(informational).not.toHaveProperty("receipt");

    const typed = await create("draft-only", { other: target.id });
    const url = await create("url", { url: `entry:${target.id}` });
    await publish(url);
    const urlImpact = await repository.readLinkImpact(impact);
    const linkImpact = { receipt: urlImpact.receipt, acknowledgePublishedLinks: true } as const;
    const reviewed = await repository.readReferenceImpact(impact);
    const referenceImpact = {
      receipt: reviewed.receipt!,
      acknowledgeDraftReferences: true,
    } as const;
    const both = { ...deletion, linkImpact, referenceImpact };
    const mixed = await versions();
    await expect(service.delete({ ...deletion, linkImpact })).rejects.toMatchObject({
      code: "CONTENT_REFERENCE_REVIEW_REQUIRED",
    });
    await expect(service.delete({ ...deletion, referenceImpact })).rejects.toMatchObject({
      code: "CONTENT_LINKS_IN_USE",
    });
    await expect(
      service.delete({ ...both, referenceImpact: acknowledgment }),
    ).rejects.toMatchObject({ code: "CONTENT_REFERENCE_IMPACT_CHANGED" });
    await expect(
      service.delete({
        ...both,
        referenceImpact: { ...referenceImpact, receipt: linkImpact.receipt },
      }),
    ).rejects.toMatchObject({ code: "CONTENT_REFERENCE_IMPACT_CHANGED" });
    const otherAdmin = { ...admin, id: editor.id };
    await expect(service.delete({ ...both, actor: otherAdmin })).rejects.toMatchObject({
      code: "CONTENT_REFERENCE_IMPACT_CHANGED",
    });
    await expect(service.delete({ ...both, expectedRevision: 99 })).rejects.toMatchObject({
      code: "CONTENT_REVISION_CONFLICT",
    });
    expect(await versions()).toEqual(mixed);

    const revised = await save(target, {});
    const revisedDeletion = { ...both, expectedRevision: revised.draft.revision };
    await expect(service.delete(revisedDeletion)).rejects.toMatchObject({
      code: "CONTENT_REFERENCE_IMPACT_CHANGED",
    });
    const latestReference = await repository.readReferenceImpact(impact);
    const latestLink = await repository.readLinkImpact(impact);
    await service.delete({
      ...revisedDeletion,
      linkImpact: { ...linkImpact, receipt: latestLink.receipt },
      referenceImpact: { ...referenceImpact, receipt: latestReference.receipt! },
    });
    expect(await repository.load({ entryId: target.id })).toBeNull();
    expect((await repository.load({ entryId: typed.id }))!.draft).toMatchObject({
      fields: { other: target.id },
      revision: typed.draft.revision,
    });
    expect((await repository.load({ entryId: url.id }))!.published?.fields).toEqual({
      url: `entry:${target.id}`,
    });
    expect(
      (await repository.load({ entryId: hiddenSource.id }))!.published?.blocks[0]!.data,
    ).toEqual({
      values: [{ entry: target.id }],
    });
    await expect(publish(typed)).rejects.toMatchObject({
      issues: [{ code: "reference_target_missing", path: ["fields", "other"] }],
    });
    await save(typed, {});
  },
);

contract(
  "finds the publish-first source beyond the bounded cycle witness",
  async (runtime, expect) => {
    const { create, save, publish } = await setup(runtime);
    const target = await create("target");
    await publish(target);
    const sources = [];
    let downstream = target.id;
    for (let i = 0; i < 19; i++) {
      const source = await create(`chain-${i}`, { related: [downstream] });
      await publish(source);
      sources.unshift(source);
      downstream = source.id;
    }
    const correction = await save(sources.at(-1)!, {});
    await save(sources[0]!, { other: sources[1]!.id }); // Same edge at a different location.
    const reversed = await save(target, { related: [downstream] });
    await expect(publish(reversed)).rejects.toMatchObject({
      issues: [
        {
          code: "reference_cycle",
          path: ["fields", "related", 0],
          details: {
            witness: [target.id, ...sources.slice(0, 14).map((source) => source.id), target.id],
            truncated: true,
            publishFirst: { entryId: correction.id, title: "chain-0" },
          },
        },
      ],
    });
    await publish(correction);
    await publish(reversed);
  },
);

contract(
  "allows only one of a source publication and reviewed target deletion",
  async (runtime, expect) => {
    for (const removeFirst of [false, true]) {
      const { create, publish, reopen, repository, use, sql } = await setup(runtime);
      const target = await create("target");
      const source = await create("source", { other: target.id });
      await publish(target);
      const before = await repository.publishedContentVersion();
      const read = await repository.readReferenceImpact({
        action: "delete",
        targetId: target.id,
        actorId: admin.id,
        limit: 20,
      });
      const publisher = reopen();
      const remover = reopen();
      const publishSource = (dispatch: ContractRepository["publish"]) =>
        publish(
          source,
          use(
            Object.assign(Object.create(publisher) as ContractRepository, {
              publish: dispatch,
            }),
          ),
          "publish-in-race",
        );
      const deleteTarget = (dispatch: ContractRepository["delete"]) =>
        use(
          Object.assign(Object.create(remover) as ContractRepository, { delete: dispatch }),
        ).delete({
          actor: admin,
          entryId: target.id,
          expectedRevision: target.draft.revision,
          referenceImpact: { receipt: read.receipt!, acknowledgeDraftReferences: true },
        });
      const publishCommand = publisher.publish.bind(publisher);
      const deleteCommand = remover.delete.bind(remover);
      const outcomes = removeFirst
        ? await interleave(deleteTarget, publishSource, deleteCommand, publishCommand)
        : await interleave(publishSource, deleteTarget, publishCommand, deleteCommand);
      expect(outcomes).toMatchObject([
        { status: "fulfilled" },
        {
          status: "rejected",
          reason: removeFirst
            ? { code: "VALIDATION_FAILED", issues: [{ code: "reference_target_missing" }] }
            : { code: "CONTENT_REFERENCES_IN_USE" },
        },
      ]);
      expect(await repository.publishedContentVersion()).toBe(before + 1);
      const savedSource = await repository.load({ entryId: source.id });
      const savedTarget = await repository.load({ entryId: target.id });
      expect(savedSource?.draft.fields).toEqual({ other: target.id });
      expect(savedTarget === null).toBe(removeFirst);
      expect(savedSource?.published === undefined).toBe(removeFirst);
      expect(await sql.get("select count(*) as count from idempotency_records")).toEqual({
        count: removeFirst ? 0 : 1,
      });
    }
  },
);
