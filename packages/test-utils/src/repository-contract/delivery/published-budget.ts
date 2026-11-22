import { MAX_PAGE_SIZE } from "@lacecms/content";
import { contentModelKey } from "@lacecms/domain";
import type { ContractSql, RepositoryContractCase } from "../shared.js";
import { registerContract, resolveRoute, seedModels } from "../shared.js";

export const cases: RepositoryContractCase[] = [];
const contract = registerContract(cases);

async function addPublicEntries(
  sql: ContractSql,
  model: "posts" | "testimonials",
  from: number,
  to: number,
) {
  await sql.run(
    `with recursive seq(n) as (values(?) union all select n+1 from seq where n<?)
      insert into content_entries (id,model_key,created_by,created_at,updated_at)
      select printf('budget-%s-%04d',?,n),?,'editor',n,n from seq`,
    from,
    to,
    model,
    model,
  );
  await sql.run(
    `insert into content_snapshots (id,entry_id,revision,title,fields_json,schema_version,created_at,updated_at,updated_by)
      select e.id||suffix,e.id,1,e.id,'{}',1,e.created_at,e.updated_at,'editor'
      from content_entries e cross join (select '-d' as suffix union all select '-p')
      where e.model_key=? and e.published_snapshot_id is null`,
    model,
  );
  await sql.run(
    `insert into content_blocks (snapshot_id,block_key,block_type,position,schema_version,data_json,created_at,updated_at)
      select id||'-p','visible','hero',1000,1,'{}',created_at,updated_at
      from content_entries where model_key=? and published_snapshot_id is null`,
    model,
  );
  if (model === "posts")
    await sql.run(
      `insert into published_routes (path,entry_id,snapshot_id,updated_at)
        select '/blog/'||id,id,id||'-p',updated_at
        from content_entries where model_key=? and published_snapshot_id is null`,
      model,
    );
  await sql.run(
    "update content_entries set draft_snapshot_id=id||'-d',published_snapshot_id=id||'-p' where model_key=? and published_snapshot_id is null",
    model,
  );
}

contract(
  "maximum public list pages keep fixed statement and binding counts",
  async (runtime, expect) => {
    const groupSizes: number[] = [];
    const { repository, sql, reads } = await runtime.open({
      resolveModel: resolveRoute,
      afterRead: (rows) => {
        groupSizes.push(rows.length);
      },
    });
    await seedModels(sql, "posts", "testimonials");

    const evidence = [];
    for (const model of ["posts", "testimonials"] as const) {
      const list =
        model === "posts"
          ? repository.listPublic.bind(repository)
          : repository.listPublicRecords.bind(repository);
      const limit = MAX_PAGE_SIZE;
      const input = { modelKey: contentModelKey(model), limit };
      const initial = limit * 2 + 1;
      for (const [from, to] of [
        [1, initial],
        [initial + 1, 1_000],
      ] as const) {
        await addPublicEntries(sql, model, from, to);
        groupSizes.length = 0;
        reads.reset();
        const first = await list(input);
        expect(first.items).toHaveLength(limit);
        expect(first.nextCursor).toBeDefined();
        expect(groupSizes).toEqual([limit + 1, limit, limit, 0]);
        const firstRead = reads.snapshot();
        expect(firstRead).toMatchObject({ statements: 4, maxParameters: 2 });
        const plans = [];
        if (from === 1)
          for (const [index, statement] of firstRead.sql.entries()) {
            const plan = await sql.all<{ detail: string }>(
              `explain query plan ${statement}`,
              model,
              index === 0 ? limit + 1 : limit,
            );
            plans.push(plan.map((row) => row.detail).join("\n"));
          }
        if (plans.length > 0) {
          expect(plans[1]).toMatch(/SEARCH s USING .*\(id=\?\)/u);
          expect(plans[1]).toMatch(
            /SEARCH content_entry_link_references USING .*\(snapshot_id=\?/u,
          );
          expect(plans[2]).toMatch(/SEARCH content_blocks USING .*\(snapshot_id=\?/u);
          expect(plans[3]).toMatch(/SEARCH r USING .*\(snapshot_id=\?/u);
        }
        groupSizes.length = 0;
        reads.reset();
        const next = await list({ ...input, after: first.nextCursor! });
        expect(next.items).toHaveLength(limit);
        expect(next.nextCursor).toBeDefined();
        expect(groupSizes).toEqual([limit + 1, limit, limit, 0]);
        const nextRead = reads.snapshot();
        expect(nextRead).toMatchObject({ statements: 4, maxParameters: 5 });
        if (runtime.publicReadOverlap === "batch") {
          expect(firstRead.batches).toBe(1);
          expect(nextRead.batches).toBe(1);
        }
        evidence.push({
          model,
          items: to,
          limit,
          statements: firstRead.statements,
          resultRows: groupSizes.reduce((sum, rows) => sum + rows, 0),
          firstRowsRead: firstRead.rowsRead,
          nextRowsRead: nextRead.rowsRead,
          firstBindings: firstRead.maxParameters,
          nextBindings: nextRead.maxParameters,
        });
      }
    }
    runtime.recordEvidence?.({ publicList: evidence });
  },
);
