import { DatabaseSync } from "node:sqlite";
import type { SnapshotEntryReference } from "@lacecms/content";
import { expect, test } from "vitest";
import {
  referenceGraphIssue,
  referenceGraphGuard,
  referenceGraphQuery,
  referenceTargetsQuery,
  replaceInternalLinkStatements,
} from "@lacecms/db";
import type { InvalidReferenceRow, ReferenceGraphRow, ReferencePhase } from "@lacecms/db";
import { migrationStatements, openLocalD1 } from "./test-support/d1-test-harness.js";

const selection = (targetId: string, index = 0, delivered = true): SnapshotEntryReference => ({
  targetId,
  models: ["posts"],
  purpose: "reference",
  sourceKey: "$fields",
  area: "fields",
  pointer: `/related/${index}`,
  delivered,
});

interface Runner {
  run(sql: string, ...params: readonly unknown[]): Promise<void>;
  all<Row>(sql: string, ...params: readonly unknown[]): Promise<readonly Row[]>;
}

async function exercise({ run, all }: Runner): Promise<void> {
  await run(`insert into content_models
    (key,kind,label,config_version,structure_hash,projection_hash,created_at,updated_at)
    values ('posts','collection','Posts',1,'s','p',1,1), ('other','collection','Other',1,'s','p',1,1)`);
  await run(`with recursive numbers(id) as (values (0) union all select id+1 from numbers where id<2050)
    insert into content_entries (id,model_key,created_by,created_at,updated_at)
    select 'n'||id,'posts','admin',1,1 from numbers union all select 'other','other','admin',1,1`);
  await run(`insert into content_snapshots
    (id,entry_id,revision,title,fields_json,schema_version,created_at,updated_at,updated_by)
    select id||phase,id,1,id,'{}',1,1,1,'admin' from content_entries
    cross join (select 'd' as phase union all select 'p')`);
  await run(`update content_entries set draft_snapshot_id=id||'d',
    published_snapshot_id=case when id='n2050' then null else id||'p' end`);
  await run(`with recursive numbers(id) as (values (1) union all select id+1 from numbers where id<2048)
    insert into content_entry_link_references
    (snapshot_id,source_key,area,field_path,target_entry_id,delivered,purpose)
    select 'n'||id||'d','$fields','fields','/related/0','n'||(id+1),1,'reference' from numbers`);
  const link = (source: string, target: string, index: number, delivered = 1) =>
    run(`insert into content_entry_link_references values
      ('${source}','$fields','fields','/related/${index}','${target}',${delivered},'reference')`);
  const proof = async (phase: ReferencePhase, target: string) => {
    const query = referenceGraphQuery(
      "n0",
      phase,
      [{ entryId: "n0", references: [selection(target), selection(target, 1)] }],
      true,
    );
    const [row] = await all<ReferenceGraphRow>(query.sql, ...query.params);
    return referenceGraphIssue(row!, "n0");
  };

  expect(await proof("draft", "n0")).toEqual({
    kind: "cycle",
    targetId: "n0",
    witness: ["n0", "n0"],
    truncated: false,
  });
  expect(await proof("draft", "n2")).toBeUndefined();
  const indexed = referenceGraphQuery("n0", "draft", [
    { entryId: "n0", references: [selection("n2")] },
  ]);
  expect(
    JSON.stringify(await all(`explain query plan ${indexed.sql}`, ...indexed.params)),
  ).toContain("SEARCH r USING COVERING INDEX content_entry_link_references_outgoing_idx");

  expect(await proof("draft", "n1")).toEqual({ kind: "limit", targetId: "n1" });
  const guardedLink = async (target: string) => {
    const guard = referenceGraphGuard(
      referenceGraphQuery("n0", "draft", [{ entryId: "n0", references: [selection(target)] }]),
    );
    for (const statement of replaceInternalLinkStatements("n0d", [selection(target)], guard.sql))
      await run(statement.sql, ...statement.params, ...guard.params);
  };
  await guardedLink("n1");
  expect(
    await all("select target_entry_id from content_entry_link_references where snapshot_id='n0d'"),
  ).toEqual([]);
  expect(await all("select revision from content_link_state")).toEqual([{ revision: 0 }]);
  await guardedLink("n2");
  expect(
    await all(
      "select target_entry_id,purpose from content_entry_link_references where snapshot_id='n0d'",
    ),
  ).toEqual([{ target_entry_id: "n2", purpose: "reference" }]);
  expect(await all("select revision from content_link_state")).toEqual([{ revision: 1 }]);
  // Changing only the purpose is a tuple replacement.
  for (const statement of replaceInternalLinkStatements("n0d", [
    { ...selection("n2"), purpose: "url" },
  ]))
    await run(statement.sql, ...statement.params);
  expect(
    await all(
      "select target_entry_id,purpose from content_entry_link_references where snapshot_id='n0d'",
    ),
  ).toEqual([{ target_entry_id: "n2", purpose: "url" }]);
  expect(await all("select revision from content_link_state")).toEqual([{ revision: 2 }]);

  await link("n2049d", "n0", 0, 0);
  expect(await proof("draft", "n2049")).toMatchObject({ witness: ["n0", "n2049", "n0"] });
  expect(await proof("draft", "n3")).toMatchObject({
    witness: ["n0", ...Array.from({ length: 14 }, (_, index) => `n${index + 3}`), "n0"],
    truncated: true,
  });
  expect(await proof("published", "n2049")).toBeUndefined();

  await link("n2049p", "n0", 0);
  await link("n2048p", "n2049", 0);
  await link("n2047p", "n2048", 0);
  await link("n2047p", "n2049", 1);
  expect(await proof("published", "n2047")).toMatchObject({
    witness: ["n0", "n2047", "n2048", "n2049", "n0"],
  });
  const reversal = referenceGraphQuery(
    "n0",
    "published",
    [
      { entryId: "n0", references: [selection("n2047")] },
      { entryId: "n2049", references: [] },
    ],
    true,
  );
  expect(await all(reversal.sql, ...reversal.params)).toMatchObject([{ cycle: 0, over_limit: 0 }]);

  await link("n0d", "missing", 1);
  const invalid = referenceTargetsQuery(
    [selection("missing"), selection("missing", 1), selection("other", 2), selection("n2050", 3)],
    "draft",
    "n0d",
  );
  expect(await all<InvalidReferenceRow>(invalid.sql, ...invalid.params)).toEqual([
    { index: 1, code: "reference_target_missing" },
    { index: 2, code: "reference_target_model" },
  ]);
  const unpublished = referenceTargetsQuery([selection("n2050")], "published");
  expect(await all(unpublished.sql, ...unpublished.params)).toEqual([
    { index: 0, code: "reference_target_unpublished" },
  ]);
}

test("SQLite and D1 prove the same bounded prospective reference graphs", async () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    for (const statement of await migrationStatements()) sqlite.exec(statement);
    await exercise({
      run: async (sql, ...params) => {
        sqlite.prepare(sql).run(...(params as string[]));
      },
      all: async <Row>(sql: string, ...params: readonly unknown[]) =>
        sqlite.prepare(sql).all(...(params as string[])) as Row[],
    });
  } finally {
    sqlite.close();
  }
  const { database, dispose } = await openLocalD1();
  try {
    await exercise({
      run: async (sql, ...params) => {
        await database
          .prepare(sql)
          .bind(...params)
          .run();
      },
      all: async <Row>(sql: string, ...params: readonly unknown[]) =>
        (
          await database
            .prepare(sql)
            .bind(...params)
            .all<Row>()
        ).results,
    });
  } finally {
    await dispose();
  }
});
