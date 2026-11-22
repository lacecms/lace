import { expect, onTestFinished, test } from "vitest";
import { writeFile } from "node:fs/promises";
import { defineCollection, defineConfig } from "@lacecms/config";
import { defineBlock, field } from "@lacecms/content";
import { createCloudflareWorker } from "./index.js";
import {
  D1_MAX_BATCH_STATEMENTS,
  D1_MAX_BOUND_PARAMETERS,
  D1_QUERY_BUDGET,
} from "./d1/database.js";
import type { D1Database } from "./d1/database.js";
import { countingD1 } from "./test-support/d1-test-harness.js";
import { createWorkerFixture, origin } from "./test-support/worker-harness.js";
import { object, string } from "./test-support/json.js";

const modelKey = "notes";
const reference = () => field.reference({ models: [modelKey] });

async function makeConfig() {
  const card = defineBlock({
    type: "referenceCard",
    version: 1,
    fields: { image: field.media(), related: reference(), url: field.url() },
  });
  return defineConfig({
    blocks: [card],
    content: [
      defineCollection({
        key: modelKey,
        version: 1,
        route: "/notes/:slug",
        blocks: [card.type],
        fields: { related: field.list({ item: reference() }) },
      }),
    ],
  });
}

const deep = (index: number) => `deep-${index}`;
const wide = (index: number) => `wide-${index}`;
async function seedGraph(db: D1Database) {
  const ids = [
    ...Array.from({ length: 2049 }, (_, index) => deep(index + 1)),
    ...Array.from({ length: 2048 }, (_, index) => wide(index)),
  ];
  const data = ids.map((id, index) => {
    const row = Number(id.split("-")[1]);
    if (index < 2049) return [id, row === 2049 ? [] : [deep(row + 1)]];
    if (row === 0) return [id, Array.from({ length: 24 }, (_, branch) => wide(branch + 1))];
    if (row <= 24) {
      const start = 25 + (row - 1) * 85;
      const targets = Array.from({ length: Math.max(0, Math.min(85, 2048 - start)) }, (_, leaf) =>
        wide(start + leaf),
      );
      return [id, [...new Set([...targets, wide(2047)])]];
    }
    return [id, []];
  });
  const body = JSON.stringify(data);
  await db.batch([
    db
      .prepare(`insert into content_entries (id,model_key,created_by,created_at,updated_at)
      select value ->> 0,'notes','admin',1,1 from json_each(?)`)
      .bind(body),
    db
      .prepare(`insert into content_snapshots
      (id,entry_id,revision,slug,title,fields_json,schema_version,created_at,updated_at,updated_by)
      select (j.value ->> 0)||prefix,(j.value ->> 0),1,j.value ->> 0,j.value ->> 0,
        json_object('related',json(j.value -> 1)),1,1,1,'admin'
      from json_each(?) j cross join (select '-draft' as prefix union all select '-published')`)
      .bind(body),
    db
      .prepare(`update content_entries set draft_snapshot_id=id||'-draft',published_snapshot_id=id||'-published'
      where id in (select value ->> 0 from json_each(?))`)
      .bind(body),
    db
      .prepare(`insert into published_routes (path,entry_id,snapshot_id,updated_at)
      select '/notes/'||(value ->> 0),value ->> 0,(value ->> 0)||'-published',1 from json_each(?)`)
      .bind(body),
    db
      .prepare(`insert into content_entry_link_references
      (snapshot_id,source_key,area,field_path,target_entry_id,delivered,purpose)
      select (j.value ->> 0)||prefix,'$fields','fields','/related/'||t.key,t.value,1,'reference'
      from json_each(?) j cross join json_each(j.value -> 1) t
      cross join (select '-draft' as prefix union all select '-published')`)
      .bind(body),
  ]);
}

test("complete Worker reference invocations stay inside the D1 statement and bind ceilings", async () => {
  const cleanups: Array<() => unknown> = [];
  onTestFinished(async () => {
    for (const cleanup of cleanups.reverse()) await cleanup();
  });
  const fixture = await createWorkerFixture(createCloudflareWorker, cleanups, {
    config: await makeConfig(),
  });
  await fixture.signIn();
  const db = fixture.local.database;
  await seedGraph(db);
  await fixture.settle();
  const media = Array.from({ length: 200 }, (_, index) => `mixed-${index}`);
  await db
    .prepare(`insert into media
    (id,storage_key,filename,mime_type,size,width,height,metadata_json,status,created_by,created_at,updated_at)
    select value,'media/'||value,'image.png','image/png',1,1,1,'{}','active','admin',1,1 from json_each(?)`)
    .bind(JSON.stringify(media))
    .run();
  const counted = countingD1(db);
  const measurements: { name: string; queries: number; batch: number; binds: number }[] = [];
  const samples = new Map<string, readonly unknown[]>();
  const binding = {
    ...counted.binding,
    prepare: (sql: string) => {
      const statement = counted.binding.prepare(sql);
      if (
        !sql.startsWith("with recursive") ||
        !sql.includes("content_entry_link_references_outgoing_idx")
      )
        return statement;
      return {
        ...statement,
        bind: (...params: unknown[]) => {
          if (!samples.has(sql)) samples.set(sql, params);
          return statement.bind(...params);
        },
      };
    },
  };
  const env = { ...fixture.env, DB: binding };
  const create = "/api/v1/admin/models/notes/entries";
  async function invoke(
    name: string,
    path: string,
    method: string,
    body: unknown,
    status: number,
    headers: Record<string, string> = {},
  ) {
    Object.assign(counted.stats, { queries: 0, maxBatchStatements: 0, maxParameters: 0 });
    const pending: Promise<unknown>[] = [];
    const response = await fixture.worker.fetch(
      new Request(`${origin}${path}`, {
        method,
        headers: {
          cookie: string(fixture.cookie),
          "content-type": "application/json",
          "cf-connecting-ip": "203.0.113.200",
          ...headers,
        },
        body: JSON.stringify(body),
      }),
      env,
      { waitUntil: (task) => pending.push(task) },
    );
    const json = object(await response.json());
    while (pending.length) await Promise.all(pending.splice(0));
    expect(response.status, `${name}: ${JSON.stringify(json)}`).toBe(status);
    const result = {
      name,
      queries: counted.stats.queries,
      batch: counted.stats.maxBatchStatements,
      binds: counted.stats.maxParameters,
    };
    expect(result.queries, name).toBeLessThanOrEqual(D1_QUERY_BUDGET);
    expect(result.batch, name).toBeLessThanOrEqual(D1_MAX_BATCH_STATEMENTS);
    expect(result.binds, name).toBeLessThanOrEqual(D1_MAX_BOUND_PARAMETERS);
    measurements.push(result);
    return json;
  }
  const mixed = {
    title: "Maximum mixed references",
    slug: "max-mixed",
    fields: {},
    blocks: media.map((image, index) => ({
      key: `card-${index}`,
      type: "referenceCard",
      schemaVersion: 1,
      position: (index + 1) * 1000,
      data: {
        image,
        ...(index < 100 ? { related: deep(1950 + index) } : { url: `entry:${deep(index)}` }),
      },
    })),
  };
  const source = await invoke("mixed-create", create, "POST", mixed, 201);
  const path = `/api/v1/admin/entries/${string(source.id)}`;
  await invoke("mixed-save", `${path}/draft`, "PUT", { ...mixed, expectedRevision: 1 }, 200);
  await invoke("mixed-stale-save", `${path}/draft`, "PUT", { ...mixed, expectedRevision: 1 }, 409);
  const invalid = {
    ...mixed,
    blocks: mixed.blocks.map((item, index) =>
      index === 0 ? { ...item, data: { ...item.data, related: "unknown-id" } } : item,
    ),
  };
  const invalidResult = await invoke(
    "mixed-missing-target",
    `${path}/draft`,
    "PUT",
    { ...invalid, expectedRevision: 2 },
    422,
  );
  expect(invalidResult).toMatchObject({
    error: {
      details: { issues: [{ code: "reference_target_missing", path: "/blocks/0/data/related" }] },
    },
  });
  const publishKey = { "idempotency-key": "maximum-reference-publication" };
  await invoke(
    "mixed-publish",
    `${path}/publish`,
    "POST",
    { expectedRevision: 2 },
    200,
    publishKey,
  );
  await invoke(
    "mixed-publish-replay",
    `${path}/publish`,
    "POST",
    { expectedRevision: 2 },
    200,
    publishKey,
  );
  await invoke("mixed-duplicate", `${path}/duplicate`, "POST", {}, 201);
  await invoke("mixed-revert", `${path}/revert`, "POST", { expectedRevision: 2 }, 200);

  const selection = (target: string) => ({
    title: "Reachability",
    fields: { related: [target] },
    blocks: [],
  });
  const deepEntry = await invoke("deep-2048", create, "POST", selection(deep(2)), 201);
  await invoke("wide-2048", create, "POST", selection(wide(0)), 201);
  const deepPath = `/api/v1/admin/entries/${string(deepEntry.id)}/draft`;
  const over = await invoke(
    "deep-2049-rejected",
    deepPath,
    "PUT",
    { ...selection(deep(1)), expectedRevision: 1 },
    422,
  );
  expect(over).toMatchObject({
    error: { details: { issues: [{ code: "reference_graph_limit" }] } },
  });
  const cycle = await invoke(
    "cycle-rejected",
    deepPath,
    "PUT",
    {
      ...selection(string(deepEntry.id)),
      expectedRevision: 1,
    },
    422,
  );
  expect(cycle).toMatchObject({ error: { details: { issues: [{ code: "reference_cycle" }] } } });
  expect(
    await db
      .prepare("select revision from content_snapshots where entry_id=?")
      .bind(deepEntry.id)
      .first(),
  ).toEqual({ revision: 1 });

  const plans = new Set<string>();
  for (const [sql, params] of samples) {
    const explained = await db
      .prepare(`explain query plan ${sql}`)
      .bind(...params)
      .all<{ detail: string }>();
    for (const { detail } of explained.results)
      if (detail.includes("content_entry_link_references")) plans.add(detail);
  }
  expect([...plans].join("\n")).toMatch(
    /SEARCH r USING COVERING INDEX content_entry_link_references_outgoing_idx/u,
  );
  const evidence = { measurements, plans: [...plans] };
  if (process.env.LACE_REL1B_EVIDENCE)
    await writeFile(process.env.LACE_REL1B_EVIDENCE, JSON.stringify(evidence, null, 2));
  console.info("REL1B Worker invocation evidence", JSON.stringify(evidence));
});
