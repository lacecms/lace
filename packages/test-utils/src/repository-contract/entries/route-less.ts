import { readAllBuildContentPages } from "../../delivery/build-export.js";
import { prepareConfigurationSynchronization } from "@lacecms/application";
import {
  blockKey,
  contentEntryId,
  contentModelKey,
  mediaId,
  unixMilliseconds,
} from "@lacecms/domain";
import {
  type ContractRepository,
  type ContractSql,
  type RepositoryContractCase,
  count,
  editor,
  entry,
  heroBlock,
  publish,
  registerContract,
  resolveRoute,
  seedMedia,
  seedModels,
  sequence,
  syncResolver,
  applySync,
} from "../shared.js";
import { unpublishCommand } from "./fixtures.js";
import { evolvingPosts } from "../sync/fixtures.js";

export const cases: RepositoryContractCase[] = [];
const contract = registerContract(cases);

/** One published post at `/blog/post`, three published testimonials and a draft one. */
async function seedRecords(repository: ContractRepository, sql: ContractSql): Promise<void> {
  await seedModels(sql, "posts", "testimonials");
  for (const id of ["media-1", "media-2"]) await seedMedia(sql, id);
  await repository.create({
    entry: entry("post", "posts", { slug: "post", updatedAt: 1 }),
    mediaReferences: [],
  });
  await repository.publish(publish("post", 1, 2, "post-published"));
  for (const [id, at, image] of [
    ["t-b", 4, "media-1"],
    ["t-a", 3, undefined],
    ["t-c", 5, "media-2"],
  ] as const) {
    await repository.create({
      entry: entry(id, "testimonials", {
        blocks: image === undefined ? [] : [heroBlock(`${id}-block`, image)],
        fields: { quote: id },
        updatedAt: at,
      }),
      mediaReferences:
        image === undefined
          ? []
          : [{ fieldPath: "image", mediaId: mediaId(image), sourceKey: blockKey(`${id}-block`) }],
    });
    await repository.publish(publish(id, 1, at * 10, `${id}-published`));
  }
  await repository.create({
    entry: entry("t-draft", "testimonials", { fields: { quote: "draft" }, updatedAt: 6 }),
    mediaReferences: [],
  });
}

contract(
  "publishes route-less entries without routes and requests builds",
  async (runtime, expect) => {
    const { repository, sql } = await runtime.open({
      nextId: sequence("outbox"),
      resolveModel: resolveRoute,
    });
    await seedRecords(repository, sql);
    expect(await count(sql, "select count(*) as count from published_routes")).toBe(1);
    const version = async () =>
      (await sql.get<{ version: number }>("select version from published_state"))!.version;
    // One route, three records: four publications advanced the state.
    expect(await version()).toBe(4);
    expect(
      await count(
        sql,
        "select count(*) as count from outbox_events where type = 'site.build.requested' and processed_at is null",
      ),
    ).toBe(1);
    const loaded = await repository.load({ entryId: contentEntryId("t-a") });
    expect(loaded).toMatchObject({ model: { key: "testimonials", kind: "collection" } });
    expect(loaded!.model).not.toHaveProperty("route");
    expect(loaded!.published).not.toHaveProperty("slug");

    await repository.unpublish(unpublishCommand("t-a", "t-a-published", 100));
    expect(await version()).toBe(5);
    expect(await count(sql, "select count(*) as count from published_routes")).toBe(1);
    await repository.delete({
      deletedAt: unixMilliseconds(101),
      deletedBy: editor,
      entryId: contentEntryId("t-a"),
      expectedRevision: 1,
    });
    expect(await repository.load({ entryId: contentEntryId("t-a") })).toBeNull();
  },
);

contract("reads route-less records newest publication first", async (runtime, expect) => {
  const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
  await seedRecords(repository, sql);
  const modelKey = contentModelKey("testimonials");
  const first = await repository.listPublicRecords({ limit: 2, modelKey });
  expect(first.items.map((item) => String(item.entry.id))).toEqual(["t-c", "t-b"]);
  expect(first.items[0]!.media.map((media) => String(media.id))).toEqual(["media-2"]);
  const second = await repository.listPublicRecords({
    after: first.nextCursor!,
    limit: 2,
    modelKey,
  });
  expect(second.items.map((item) => String(item.entry.id))).toEqual(["t-a"]);
  expect(second.nextCursor).toBeUndefined();
  // Routed reads never see records, and records never include routed entries.
  expect((await repository.listPublic({ limit: 10, modelKey })).items).toEqual([]);
  expect(
    (await repository.listPublicRecords({ limit: 10, modelKey: contentModelKey("posts") })).items,
  ).toEqual([]);
});

contract("exports records after the routed entries across pages", async (runtime, expect) => {
  const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
  await seedRecords(repository, sql);
  const paged = await readAllBuildContentPages(repository, 2);
  expect(
    paged.pages.map((page) => [
      page.entries.map((item) => item.path),
      page.records.map((item) => String(item.entry.id)),
    ]),
  ).toEqual([
    [["/blog/post"], ["t-a"]],
    [[], ["t-b", "t-c"]],
  ]);
  expect(paged.pages[0]!.globals).toEqual([]);
  expect(
    paged.pages[1]!.records.map((item) => item.media.map((media) => String(media.id))),
  ).toEqual([["media-1"], ["media-2"]]);
  const whole = await readAllBuildContentPages(repository, 100);
  expect(whole.pages).toHaveLength(1);
  expect(whole.records.map((item) => String(item.entry.id))).toEqual(["t-a", "t-b", "t-c"]);
  expect(whole.records[0]!.entry.published).not.toHaveProperty("slug");
});

contract("route-less entries are not routable link targets", async (runtime, expect) => {
  const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
  await seedRecords(repository, sql);
  // Persistence reports no published route; the application marks them non-routable.
  expect(await repository.resolveLinkTargets(["t-a"])).toMatchObject({
    "t-a": { id: "t-a", modelKey: "testimonials", state: "unpublished" },
  });
  const listed = await repository.listLinkTargets({
    excludedModelKeys: ["testimonials"],
    limit: 50,
  });
  expect(listed.items.map((item) => item.id)).toEqual(["post"]);
  const unfiltered = await repository.listLinkTargets({ limit: 50 });
  expect(unfiltered.items.map((item) => item.id).sort()).toEqual([
    "post",
    "t-a",
    "t-b",
    "t-c",
    "t-draft",
  ]);
});

contract("synchronization guards removing a collection route", async (runtime, expect) => {
  const routed = await evolvingPosts();
  // Explicitly route-less: the override removes the fixture's route.
  const routeLess = await evolvingPosts({ route: undefined, version: 2 } as unknown as {
    readonly version: number;
  });
  const { repository } = await runtime.open({
    nextId: sequence("outbox"),
    resolveModel: syncResolver([routed]),
  });
  await applySync(repository, [routed], 10);
  const plan = async () =>
    (await prepareConfigurationSynchronization({ models: [routeLess], state: repository })).plan;

  await repository.create({
    entry: entry("target", "posts", { title: "Target", updatedAt: 11 }),
    mediaReferences: [],
  });
  await repository.create({
    entry: entry("slugged", "posts", { slug: "slugged", title: "Slugged", updatedAt: 12 }),
    mediaReferences: [],
  });
  await repository.create({
    entry: entry("source", "posts", {
      fields: { summary: "entry:target" },
      title: "Source",
      updatedAt: 13,
    }),
    internalLinks: [
      {
        area: "fields",
        delivered: true,
        pointer: "/summary",
        sourceKey: "$fields",
        targetId: "target",
      },
    ],
    mediaReferences: [],
  });
  const refused = await plan();
  expect(refused.isValid).toBe(false);
  expect(refused.diagnostics).toMatchObject([
    { affectedCount: 2, code: "ROUTE_REMOVAL_HAS_SLUGS_OR_LINKS" },
  ]);
  expect(refused.diagnostics[0]!.snapshots!.map((snapshot) => snapshot.entryId).sort()).toEqual([
    "slugged",
    "target",
  ]);

  await repository.publish(publish("slugged", 1, 20, "slugged-published"));
  expect((await plan()).diagnostics.map((value) => value.code)).toContain(
    "ROUTE_CHANGE_HAS_PUBLISHED",
  );
});
