import { prepareConfigurationSynchronization } from "@lacecms/application";

import { contentModelKey } from "@lacecms/domain";
import {
  type RepositoryContractCase,
  sequence,
  count,
  entry,
  syncPage,
  syncCollection,
  syncResolver,
  applySync,
  registerContract,
} from "../shared.js";

export const cases: RepositoryContractCase[] = [];
const contract = registerContract(cases);

contract(
  "applies guarded configuration sync atomically, coalesces build work, and rejects stale plans",
  async (runtime, expect) => {
    const models = [syncPage(), syncCollection()];
    const { repository, sql } = await runtime.open({
      nextId: sequence("outbox"),
      resolveModel: syncResolver(models),
    });
    await expect(applySync(repository, models, 10)).resolves.toMatchObject({
      status: "applied",
      targetVersion: 1,
    });
    expect(await repository.readConfigurationSyncState()).toMatchObject([
      { draftSnapshotCount: 1, entryCount: 1, key: "home", publishedSnapshotCount: 0 },
      { entryCount: 0, key: "posts" },
    ]);
    await expect(
      repository.list({
        limit: 1,
        listFields: [],
        modelKey: contentModelKey("home"),
        sort: "-updatedAt",
      }),
    ).resolves.toMatchObject({ items: [{ title: "home" }] });
    expect(await sql.get("select version from published_state")).toEqual({ version: 1 });
    expect(await count(sql, "select count(*) as count from outbox_events")).toBe(1);

    await expect(applySync(repository, models, 11)).resolves.toMatchObject({ status: "noop" });
    expect(await sql.get("select version from published_state")).toEqual({ version: 1 });

    const projectionUpdate = [syncPage(), syncCollection({ projectionHash: "projection-posts-2" })];
    await expect(applySync(repository, projectionUpdate, 12)).resolves.toMatchObject({
      status: "applied",
      targetVersion: 2,
    });
    expect(await sql.get("select version from published_state")).toEqual({ version: 2 });
    expect(await count(sql, "select count(*) as count from outbox_events")).toBe(1);

    const stale = await prepareConfigurationSynchronization({
      models: projectionUpdate,
      state: repository,
    });
    await sql.run(
      "update content_models set projection_hash = ? where key = ?",
      "changed-concurrently",
      "posts",
    );
    await expect(applySync(repository, projectionUpdate, 13, stale)).rejects.toMatchObject({
      code: "CONTENT_INVALID_STATE",
    });
    expect(await sql.get("select version from published_state")).toEqual({ version: 2 });
    expect(await sql.get("select projection_hash from content_models where key = 'posts'")).toEqual(
      { projection_hash: "changed-concurrently" },
    );

    const removal = [syncPage()];
    await sql.run(
      "update content_models set projection_hash = ? where key = ?",
      "projection-posts-2",
      "posts",
    );
    await expect(applySync(repository, removal, 14)).resolves.toMatchObject({
      status: "applied",
      targetVersion: 3,
    });
    expect(await sql.all("select key from content_models order by key")).toEqual([{ key: "home" }]);
  },
);

contract("rolls back a failed synchronized page singleton", async (runtime, expect) => {
  const models = [syncPage({ label: "Home" })];
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
  expect(await count(sql, "select count(*) as count from published_state")).toBe(0);
  expect(await count(sql, "select count(*) as count from outbox_events")).toBe(0);
});

contract(
  "renames a populated model through the key cascade without inferring a replacement",
  async (runtime, expect) => {
    const posts = syncCollection();
    const articles = syncCollection({ key: "articles", renamedFrom: "posts" });
    const { repository, sql } = await runtime.open({
      resolveModel: syncResolver([posts, articles]),
    });
    await applySync(repository, [posts], 10);
    await repository.create({
      entry: entry("post-entry", "posts", { title: "Post", updatedAt: 11 }),
      mediaReferences: [],
    });
    await expect(applySync(repository, [articles], 12)).resolves.toMatchObject({
      status: "applied",
    });
    expect(await sql.get("select key from content_models")).toEqual({ key: "articles" });
    expect(await sql.get("select model_key from content_entries")).toEqual({
      model_key: "articles",
    });
  },
);

contract("allows only one independently prepared sync apply to commit", async (runtime, expect) => {
  const models = [syncCollection()];
  const harness = await runtime.open({ resolveModel: syncResolver(models) });
  const first = harness.repository;
  const second = harness.reopen();
  const [firstPrepared, secondPrepared] = await Promise.all([
    prepareConfigurationSynchronization({ models, state: first }),
    prepareConfigurationSynchronization({ models, state: second }),
  ]);
  await expect(applySync(first, models, 10, firstPrepared)).resolves.toMatchObject({
    status: "applied",
  });
  await expect(applySync(second, models, 11, secondPrepared)).rejects.toMatchObject({
    code: "CONTENT_INVALID_STATE",
  });
  expect(await count(harness.sql, "select count(*) as count from content_models")).toBe(1);
  expect(await count(harness.sql, "select count(*) as count from outbox_events")).toBe(1);
});
