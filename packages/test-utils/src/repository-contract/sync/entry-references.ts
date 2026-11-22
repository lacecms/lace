import { ContentUseCases } from "@lacecms/application";
import { defineCollection, defineConfig } from "@lacecms/config";
import { defineBlock, field } from "@lacecms/content";
import type { JsonObject } from "@lacecms/content";
import { contentEntryId, unixMilliseconds } from "@lacecms/domain";
import { admin, editor, entry, registerContract, sequence, syncResolver } from "../shared.js";
import type {
  ContractRepository,
  RepositoryContractCase,
  RepositoryContractRuntime,
  ContractModelKey,
} from "../shared.js";
import { block, noteState, prepareNotes, syncNotes } from "./fixtures.js";

export const cases: RepositoryContractCase[] = [];
const contract = registerContract(cases);

type Config = Awaited<ReturnType<typeof defineConfig>>;

async function open(runtime: RepositoryContractRuntime, config: Config) {
  const harness = await runtime.open({ resolveModel: syncResolver(config.runtime.content) });
  await syncNotes(harness.repository, config, 1);
  const useCases = new ContentUseCases({
    listQueryLimits: runtime.listQueryLimits,
    clock: { now: () => unixMilliseconds(5) },
    config: config.runtime,
    content: harness.repository,
    media: harness.repository,
    idGenerator: { next: sequence("reference-sync") },
  });
  const load = async (id: string) =>
    (await harness.repository.load({ entryId: contentEntryId(id) }))!;
  const create = (
    id: string,
    fields: JsonObject = {},
    blocks = [] as ReturnType<typeof block>[],
    model: ContractModelKey = "posts",
  ) =>
    harness.repository.create({
      entry: entry(id, model, { fields, blocks, updatedAt: 2 }),
      mediaReferences: [],
    });
  const save = async (
    id: string,
    fields: JsonObject,
    blocks?: readonly ReturnType<typeof block>[],
  ) => {
    const { draft } = await load(id);
    return useCases.save({
      ...draft,
      actor: editor,
      entryId: draft.entryId,
      expectedRevision: draft.revision,
      fields,
      blocks: blocks ?? draft.blocks,
    });
  };
  const publish = async (id: string) => {
    const { draft } = await load(id);
    return useCases.publish({
      entryId: draft.entryId,
      expectedRevision: draft.revision,
      actor: admin,
    });
  };
  const usages = () =>
    harness.sql.all(
      "select snapshot_id,source_key,field_path,target_entry_id,purpose from content_entry_link_references order by snapshot_id,source_key,field_path",
    );
  const state = async () => ({
    ...(await noteState(harness.sql)),
    usages: await usages(),
    graph: await harness.sql.all("select revision from content_link_state"),
  });
  return { ...harness, create, load, save, publish, state, usages };
}

const reference = () => field.reference({ models: ["posts"] });
const marker = field.text();
const profile = (withDefault = false) =>
  field.group({
    fields: {
      marker,
      ...(withDefault
        ? { selected: field.reference({ models: ["posts"], defaultValue: "a" }) }
        : {}),
    },
  });

contract(
  "checks typed defaults on the final overlay and guards an atomic edge reversal",
  async (runtime, expect) => {
    const config = await defineConfig({
      content: [
        defineCollection({
          key: "posts",
          version: 1,
          fields: { old: reference(), profile: profile() },
        }),
      ],
    });
    const { repository, sql, create, save, state, usages } = await open(runtime, config);
    await create("a");
    await create("b", { profile: { marker: "yes" } });
    await save("a", { old: "b" });
    const invalid = await defineConfig({
      content: [
        defineCollection({
          key: "posts",
          version: 2,
          fields: { old: reference(), profile: profile(true) },
        }),
      ],
    });
    const before = await state();
    const refused = await prepareNotes(repository, invalid);
    expect(refused.plan).toMatchObject({
      isValid: false,
      diagnostics: [
        {
          code: "REFERENCE_SYNC_INVALID",
          snapshots: [
            {
              entryId: "b",
              state: "draft",
              path: "/fields/profile/selected",
              reason: "reference_cycle",
            },
          ],
        },
      ],
    });
    expect(await state()).toEqual(before);
    await expect(syncNotes(repository, invalid, 10, refused)).rejects.toMatchObject({
      code: "CONTENT_INVALID_STATE",
    });

    const reversed = await defineConfig({
      content: [
        defineCollection({
          key: "posts",
          version: 2,
          removedFields: ["old"],
          fields: { profile: profile(true) },
        }),
      ],
    });
    const prepared = await prepareNotes(repository, reversed);
    expect(prepared.plan.isValid).toBe(true);
    await sql.run("update content_link_state set revision=revision+1");
    const intervening = await state();
    await expect(syncNotes(repository, reversed, 11, prepared)).rejects.toMatchObject({
      code: "CONFIGURATION_SYNC_STALE",
    });
    expect(await state()).toEqual(intervening);
    await expect(syncNotes(repository, reversed, 12)).resolves.toMatchObject({ status: "applied" });
    expect(await usages()).toEqual([
      {
        snapshot_id: "b-draft",
        source_key: "$fields",
        field_path: "/profile/selected",
        target_entry_id: "a",
        purpose: "reference",
      },
    ]);
  },
);

const referenceBlock = (version: 1 | 2 | 3, unsafe = false) =>
  defineBlock({
    type: "refBlock",
    version,
    fields: { selected: reference(), next: marker },
    ...(version === 1
      ? {}
      : {
          migrations: {
            ...(version !== 3
              ? {}
              : {
                  2: ({ data }: { data: JsonObject }) => ({
                    data: data.next === undefined ? {} : { next: data.next },
                  }),
                }),
            [version]: ({ data }: { data: JsonObject }) => ({
              data:
                (unsafe || version === 3) && data.next !== undefined
                  ? { next: data.next, selected: data.next }
                  : data.next === undefined
                    ? {}
                    : { next: data.next },
            }),
          },
        }),
  });

async function migrationConfig(version: 1 | 2 | 3, unsafe = false) {
  return defineConfig({
    blocks: [referenceBlock(version, unsafe)],
    content: [defineCollection({ key: "posts", version, blocks: ["refBlock"] })],
  });
}

contract(
  "refuses opposite-phase block migration orders and resumes a safe staged sync",
  async (runtime, expect) => {
    const config = await migrationConfig(1);
    const { repository, reopen, create, publish, save, state, usages } = await open(
      runtime,
      config,
    );
    const card = (data: JsonObject) => block("stable", "refBlock", 1000, data);
    await create("a", {}, [card({ next: "b" })]);
    await create("b", {}, [card({})]);
    await publish("a");
    await save("b", {}, [card({ selected: "a" })]);
    await publish("b");
    await save("b", {}, [card({ next: "a" })]);
    await save("a", {}, [card({ selected: "b" })]);

    const before = await state();
    const impossible = await migrationConfig(2, true);
    const refused = await prepareNotes(repository, impossible);
    expect(refused.plan).toMatchObject({
      isValid: false,
      diagnostics: [
        {
          code: "REFERENCE_SYNC_STAGES_REQUIRED",
          snapshots: [
            { entryId: "a", state: "published", blockKey: "stable", path: "/data/selected" },
          ],
        },
      ],
    });
    expect(refused.report.text).toContain("Split the migration into stages");
    await expect(syncNotes(repository, impossible, 10, refused)).rejects.toMatchObject({
      code: "CONTENT_INVALID_STATE",
    });
    expect(await state()).toEqual(before);

    const removals = await migrationConfig(2);
    const prepared = await prepareNotes(repository, removals);
    expect(prepared.plan.isValid).toBe(true);
    let checkpoints = 0;
    const failing = reopen({
      beforeMutation: (name) => {
        if (name.startsWith("sync.migration.") && ++checkpoints === 3) throw new Error("interrupt");
      },
    });
    await expect(syncNotes(failing, removals, 11, prepared)).rejects.toMatchObject({
      code: "CONTENT_INVALID_STATE",
    });
    const partial = await state();
    expect(partial.version).toBe(before.version);
    expect(partial.outbox).toBe(before.outbox);
    expect(partial.usages).toMatchObject([
      { snapshot_id: "reference-sync-2", target_entry_id: "a" },
    ]);
    expect(partial.blocks.filter((item) => item.schema_version === 2)).toHaveLength(2);
    await expect(syncNotes(repository, removals, 12)).resolves.toMatchObject({
      migrated: { blocks: 2, drafts: 1, published: 1 },
      status: "applied",
    });
    expect(await usages()).toEqual([]);
    const replacement = await migrationConfig(3);
    await expect(syncNotes(repository, replacement, 13)).resolves.toMatchObject({
      status: "applied",
    });
    expect(await usages()).toMatchObject([
      { snapshot_id: "b-draft", target_entry_id: "a" },
      { snapshot_id: "reference-sync-1", target_entry_id: "b" },
    ]);
  },
);

contract(
  "validates target changes and rewrites typed usages without imposing URL route guards",
  async (runtime, expect) => {
    const posts = (version: number, target: string, optionalModel = true) => ({
      key: "posts",
      version,
      fields: {
        profile: field.group({
          fields: {
            selected: field.reference({ models: optionalModel ? [target, "posts"] : [target] }),
          },
        }),
        link: field.url(),
      },
    });
    const v1 = await defineConfig({
      content: [
        defineCollection(posts(1, "testimonials")),
        defineCollection({ key: "testimonials", version: 1, route: "/reviews/:slug" }),
      ],
    });
    const { repository, sql, create, save, usages, state } = await open(runtime, v1);
    await create("review", {}, [], "testimonials");
    await create("source");
    await save("source", { profile: { selected: "review" }, link: "entry:review" });
    const v2 = await defineConfig({
      content: [
        defineCollection(posts(1, "testimonials")),
        defineCollection({ key: "testimonials", version: 2 }),
      ],
    });
    expect((await prepareNotes(repository, v2)).plan.diagnostics).toMatchObject([
      { code: "ROUTE_REMOVAL_HAS_SLUGS_OR_LINKS" },
    ]);
    await save("source", { profile: { selected: "review" } });
    await expect(syncNotes(repository, v2, 10)).resolves.toMatchObject({ status: "applied" });
    expect(await usages()).toMatchObject([
      { field_path: "/profile/selected", target_entry_id: "review", purpose: "reference" },
    ]);

    const v3 = await defineConfig({
      content: [
        defineCollection(posts(2, "reviews")),
        defineCollection({ key: "reviews", version: 3, renamedFrom: "testimonials" }),
      ],
    });
    await expect(syncNotes(repository, v3, 11)).resolves.toMatchObject({ status: "applied" });
    expect(await sql.all("select id,model_key from content_entries where id='review'")).toEqual([
      { id: "review", model_key: "reviews" },
    ]);
    await sql.run("delete from content_entries where id='review'");
    const narrowed = await defineConfig({
      content: [
        defineCollection(posts(3, "reviews", false)),
        defineCollection({ key: "reviews", version: 3 }),
      ],
    });
    const before = await state();
    expect((await prepareNotes(repository, narrowed)).plan).toMatchObject({
      isValid: false,
      diagnostics: [
        {
          code: "REFERENCE_SYNC_INVALID",
          snapshots: [
            {
              entryId: "source",
              path: "/fields/profile/selected",
              reason: "reference_target_missing",
            },
          ],
        },
      ],
    });
    expect(await state()).toEqual(before);

    const moved = await defineConfig({
      content: [
        defineCollection({
          key: "posts",
          version: 3,
          fields: {
            link: field.url(),
            review: field.group({
              renamedFrom: "profile",
              fields: {
                selected: field.reference({ models: ["reviews", "posts"] }),
              },
            }),
          },
        }),
        defineCollection({ key: "reviews", version: 3 }),
      ],
    });
    await expect(syncNotes(repository, moved, 12)).resolves.toMatchObject({ status: "applied" });
    expect(await usages()).toMatchObject([
      { field_path: "/review/selected", target_entry_id: "review" },
    ]);
    const pruned = await defineConfig({
      content: [
        defineCollection({
          key: "posts",
          version: 4,
          removedFields: ["review"],
          fields: { link: field.url() },
        }),
        defineCollection({ key: "reviews", version: 3 }),
      ],
    });
    await expect(syncNotes(repository, pruned, 13)).resolves.toMatchObject({ status: "applied" });
    expect(await usages()).toEqual([]);
  },
);

contract(
  "guards publication availability again when applying typed backfill",
  async (runtime, expect) => {
    const v1 = await defineConfig({
      content: [
        defineCollection({ key: "posts", version: 1 }),
        defineCollection({ key: "testimonials", version: 1 }),
      ],
    });
    const { repository, sql, create, publish, state } = await open(runtime, v1);
    await create("review", {}, [], "testimonials");
    await create("source");
    await publish("source");
    const v2 = await defineConfig({
      content: [
        defineCollection({
          key: "posts",
          version: 2,
          fields: {
            selected: field.reference({ models: ["testimonials"], defaultValue: "review" }),
          },
        }),
        defineCollection({ key: "testimonials", version: 1 }),
      ],
    });
    expect((await prepareNotes(repository, v2)).plan.diagnostics).toMatchObject([
      {
        code: "REFERENCE_SYNC_INVALID",
        snapshots: [
          {
            entryId: "source",
            state: "published",
            path: "/fields/selected",
            reason: "reference_target_unpublished",
          },
        ],
      },
    ]);
    await publish("review");
    const plan = await prepareNotes(repository, v2);
    expect(plan.plan.isValid).toBe(true);
    // A leaf publication can disappear without adding or removing outgoing edges.
    const racing: ContractRepository = Object.assign(
      Object.create(repository) as ContractRepository,
      {
        async applyConfigurationSynchronization(
          input: Parameters<ContractRepository["applyConfigurationSynchronization"]>[0],
        ) {
          await sql.run("update content_entries set published_snapshot_id=null where id='review'");
          return repository.applyConfigurationSynchronization(input);
        },
      },
    );
    await expect(syncNotes(racing, v2, 10, plan)).rejects.toMatchObject({
      code: "CONFIGURATION_SYNC_STALE",
    });
    expect((await state()).usages).toEqual([]);
  },
);

contract(
  "reports the combined reference occurrence limit during sync check",
  async (runtime, expect) => {
    const list = field.list({ item: field.url(), maxItems: 100 });
    const v1 = await defineConfig({
      content: [
        defineCollection({
          key: "posts",
          version: 1,
          route: "/posts/:slug",
          fields: { links: list, moreLinks: list },
        }),
      ],
    });
    const { repository, create, save, state } = await open(runtime, v1);
    await create("target");
    await create("source");
    const links = Array.from({ length: 100 }, () => "entry:target");
    await save("source", { links, moreLinks: links });
    const v2 = await defineConfig({
      content: [
        defineCollection({
          key: "posts",
          version: 2,
          route: "/posts/:slug",
          fields: {
            links: list,
            moreLinks: list,
            selected: field.reference({ models: ["posts"], defaultValue: "target" }),
          },
        }),
      ],
    });
    const before = await state();
    expect((await prepareNotes(repository, v2)).plan).toMatchObject({
      isValid: false,
      diagnostics: [
        {
          code: "REFERENCE_SYNC_INVALID",
          snapshots: [
            {
              entryId: "source",
              state: "draft",
              reason: "too_many_internal_links",
            },
          ],
        },
      ],
    });
    expect(await state()).toEqual(before);
  },
);
