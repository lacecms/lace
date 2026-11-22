import { ContentUseCases, contentModelRoute } from "@lacecms/application";
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
          details: { witness: [b0.id, a0.id, b0.id] },
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
async function interleave<Command, Result>(
  first: (dispatch: (input: Command) => Promise<Result>) => Promise<unknown>,
  second: (dispatch: (input: Command) => Promise<Result>) => Promise<unknown>,
  commitFirst: (input: Command) => Promise<Result>,
  commitSecond: (input: Command) => Promise<Result>,
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
