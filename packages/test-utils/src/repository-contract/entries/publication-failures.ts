import { contentEntryId } from "@lacecms/domain";

import {
  type RepositoryContractCase,
  resolveRoute,
  count,
  seedModels,
  seedMedia,
  heroEntry,
  references,
  publish,
  registerContract,
} from "../shared.js";

export const cases: RepositoryContractCase[] = [];
const contract = registerContract(cases);

for (const fault of ["mutation", "commit"] as const) {
  contract(
    `rolls back publication after actual SQL ${fault} failure and retries safely`,
    async (runtime, expect) => {
      const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
      await seedModels(sql, "posts");
      await seedMedia(sql, "media-1");
      await repository.create({
        entry: heroEntry("post", "posts", 1),
        mediaReferences: references("post-block"),
      });
      if (fault === "commit") {
        await sql.run(
          "create table fault_commit (entry_id text references content_entries(id) deferrable initially deferred)",
        );
        await sql.run(
          "create trigger injected_sql_failure after insert on published_routes begin insert into fault_commit values ('missing-entry'); end",
        );
      } else {
        await sql.run(
          "create trigger injected_sql_failure before insert on published_routes begin select raise(abort, 'injected SQL failure'); end",
        );
      }
      const tables = [
        "content_entries",
        "content_snapshots",
        "content_blocks",
        "content_media_references",
        "published_routes",
        "published_state",
        "outbox_events",
        "site_builds",
        "idempotency_records",
        "mutation_guards",
      ];
      const snapshot = () =>
        Promise.all(
          tables.map(async (table) => [
            table,
            await sql.all(`select * from ${table} order by rowid`),
          ]),
        );
      const before = await snapshot();
      await expect(repository.publish(publish("post", 1, 2, "published"))).rejects.toMatchObject({
        code: "CONTENT_INVALID_STATE",
      });
      expect(await snapshot()).toEqual(before);
      if (fault === "commit") expect(await sql.all("select * from fault_commit")).toEqual([]);
      await sql.run("drop trigger injected_sql_failure");
      await repository.publish(publish("post", 1, 3, "retry-published"));
      expect((await repository.load({ entryId: contentEntryId("post") }))?.published).toBeDefined();
      expect(await count(sql, "select count(*) as count from published_routes")).toBe(1);
    },
  );
}
