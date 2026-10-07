import { expect, test } from "vitest";
import { openProductRuntime } from "./support/cross-runtime-fixture.mjs";
import { countingD1 } from "../packages/platform-cloudflare/src/d1-test-harness.mjs";

function maximalBlocks(label, count = 200) {
  return Array.from({ length: count }, (_, i) => ({
    key: `${label}-${i}`,
    type: "image",
    position: (i + 1) * 1000,
    schemaVersion: 1,
    data: { media: `budget-media-${i}`, alt: `${label} image ${i}` },
  }));
}
async function fixture() {
  let count, database;
  const f = await openProductRuntime("worker", {
    instrumentD1(db) {
      database = db;
      count = countingD1(db);
      return count.binding;
    },
  });
  const measurements = [];
  const measured = async (name, path, options, expectedStatus) => {
    await f.settle();
    count.stats.queries = 0;
    count.stats.maxParameters = 0;
    const response = await f.call(path, options);
    const text = await response.text();
    await f.settle();
    const result = {
      name,
      ...count.stats,
      bytes: Buffer.byteLength(text),
      status: response.status,
    };
    measurements.push(result);
    console.info(`34B D1 ${JSON.stringify(result)}`);
    expect(response.status, name).toBe(expectedStatus);
    expect(count.stats.queries, name).toBeLessThanOrEqual(50);
    expect(count.stats.maxParameters, name).toBeLessThanOrEqual(100);
    return JSON.parse(text);
  };
  return { ...f, count, database, measurements, measured };
}
async function seedMedia(db) {
  for (let offset = 0; offset < 200; offset += 50)
    await db.batch(
      Array.from({ length: 50 }, (_, i) =>
        db
          .prepare(
            "insert into media (id, storage_key, filename, mime_type, size, metadata_json, status, created_by, created_at, updated_at) values (?, ?, 'image.png', 'image/png', 1, '{}', 'active', 'budget-admin', 1, 1)",
          )
          .bind(`budget-media-${offset + i}`, `budget/${offset + i}`),
      ),
    );
}

test("34B authenticated D1 create/save/publish accepts 200 blocks/references within complete HTTP budgets and rejects 201", async () => {
  const f = await fixture();
  try {
    await seedMedia(f.database);
    const admin = { cookie: f.cookies.admin };
    const draft = (label, n = 200) => ({
      title: label,
      slug: "maximal",
      fields: { summary: label },
      blocks: maximalBlocks(label, n),
    });
    const created = await f.measured(
      "create-200",
      "/api/v1/admin/models/notes/entries",
      { ...admin, method: "POST", json: draft("created") },
      201,
    );
    expect(created.draft.blocks).toEqual(draft("created").blocks);
    const path = `/api/v1/admin/entries/${created.id}`;
    const saved = await f.measured(
      "save-200",
      path + "/draft",
      { ...admin, method: "PUT", json: { ...draft("saved"), expectedRevision: 1 } },
      200,
    );
    expect(saved.draft.blocks).toEqual(draft("saved").blocks);
    await f.measured(
      "publish-200",
      path + "/publish",
      { ...admin, method: "POST", json: { expectedRevision: 2 } },
      200,
    );
    const published = await f.measured(
      "public-200",
      "/api/v1/public/collections/notes/maximal",
      {},
      200,
    );
    expect(published.entry.published.blocks).toEqual(draft("saved").blocks);
    const refs = await f.database
      .prepare(
        "select source_key, media_id from content_media_references where snapshot_id = (select published_snapshot_id from content_entries where id = ?) order by source_key",
      )
      .bind(created.id)
      .all();
    expect(refs.results).toHaveLength(200);
    expect(new Set(refs.results.map((row) => row.media_id)).size).toBe(200);
    const before = await f.database
      .prepare(
        "select (select count(*) from content_entries) as entries, (select count(*) from content_snapshots) as snapshots, (select count(*) from content_blocks) as blocks, (select count(*) from content_media_references) as refs",
      )
      .first();
    await f.measured(
      "create-201-denied",
      "/api/v1/admin/models/notes/entries",
      { ...admin, method: "POST", json: { ...draft("oversize", 201), slug: "denied" } },
      422,
    );
    await f.measured(
      "save-201-denied",
      path + "/draft",
      { ...admin, method: "PUT", json: { ...draft("oversize", 201), expectedRevision: 2 } },
      422,
    );
    const last = "budget-media-199";
    for (const state of ["deleting", "missing"]) {
      await f.database
        .prepare("update media set status = 'deleting' where id = ?")
        .bind(last)
        .run();
      const bad = draft(state);
      if (state === "missing") bad.blocks.at(-1).data.media = "missing-last-chunk";
      await f.measured(
        `save-${state}-last-chunk`,
        path + "/draft",
        { ...admin, method: "PUT", json: { ...bad, expectedRevision: 2 } },
        422,
      );
      const intact = await (await f.call(path, admin)).json();
      expect(intact.draft.revision).toBe(2);
      expect(intact.draft.blocks).toEqual(draft("saved").blocks);
    }
    await f.database.prepare("update media set status = 'active' where id = ?").bind(last).run();
    expect(
      await f.database
        .prepare(
          "select (select count(*) from content_entries) as entries, (select count(*) from content_snapshots) as snapshots, (select count(*) from content_blocks) as blocks, (select count(*) from content_media_references) as refs",
        )
        .first(),
    ).toEqual(before);
    const duplicates = draft("duplicates");
    for (const block of duplicates.blocks) block.data.media = "budget-media-0";
    const repeated = await f.measured(
      "save-200-duplicate-ids",
      path + "/draft",
      { ...admin, method: "PUT", json: { ...duplicates, expectedRevision: 2 } },
      200,
    );
    expect(repeated.draft.blocks).toEqual(duplicates.blocks);
    expect(
      (
        await f.database
          .prepare("select * from content_media_references where snapshot_id = ?")
          .bind(repeated.draft.id)
          .all()
      ).results,
    ).toHaveLength(200);
  } finally {
    await f.close();
  }
}, 120000);

test("34B D1 exports 100/201/501 complete published entries across hydration chunks and near-limit JSON", async () => {
  const f = await fixture();
  try {
    await seedMedia(f.database);
    const issued = await f.call("/api/v1/admin/api-tokens", {
      cookie: f.cookies.admin,
      method: "POST",
      json: { name: "34b-budget" },
    });
    expect(issued.status).toBe(201);
    const token = (await issued.json()).token;
    const expected = [];
    let statements = [];
    const enqueue = async (sql, ...params) => {
      statements.push(f.database.prepare(sql).bind(...params));
      if (statements.length === 50) {
        await f.database.batch(statements);
        statements = [];
      }
    };
    const flush = async () => {
      if (statements.length) await f.database.batch(statements);
      statements = [];
    };
    for (const size of [100, 201, 501]) {
      for (let index = expected.length; index < size; index++) {
        const id = `export-${String(index).padStart(4, "0")}`;
        const fields = { summary: index === 0 ? "x".repeat(999900) : `Published summary ${index}` };
        const blocks =
          index < 2
            ? maximalBlocks(id)
            : [
                {
                  key: `${id}-hero`,
                  type: "hero",
                  schemaVersion: 1,
                  position: 1000,
                  data: { heading: `Published heading ${index}` },
                },
              ];
        if (index === 1) blocks[0].data.alt = "y".repeat(999900);
        expected.push({ id, path: `/notes/${id}`, title: `Published ${index}`, fields, blocks });
        await enqueue(
          "insert into content_entries (id, model_key, created_by, created_at, updated_at) values (?, 'notes', 'budget-admin', 1, 1)",
          id,
        );
        for (const state of ["draft", "published"])
          await enqueue(
            "insert into content_snapshots (id, entry_id, revision, slug, title, fields_json, schema_version, created_at, updated_at, updated_by) values (?, ?, 1, ?, ?, ?, 1, 1, 1, 'budget-admin')",
            `${id}-${state}`,
            id,
            id,
            state === "draft" ? "PRIVATE DRAFT SENTINEL" : `Published ${index}`,
            JSON.stringify(state === "draft" ? { summary: "PRIVATE DRAFT SENTINEL" } : fields),
          );
        await enqueue(
          "update content_entries set draft_snapshot_id = ?, published_snapshot_id = ? where id = ?",
          `${id}-draft`,
          `${id}-published`,
          id,
        );
        for (const block of blocks) {
          await enqueue(
            "insert into content_blocks values (?, ?, ?, ?, ?, ?, 1, 1)",
            `${id}-published`,
            block.key,
            block.type,
            block.position,
            block.schemaVersion,
            JSON.stringify(block.data),
          );
          if (block.type === "image")
            await enqueue(
              "insert into content_media_references values (?, ?, 'media', ?, 1)",
              `${id}-published`,
              block.key,
              block.data.media,
            );
        }
        await enqueue(
          "insert into published_routes values (?, ?, ?, 1)",
          `/notes/${id}`,
          id,
          `${id}-published`,
        );
      }
      await flush();
      const exported = await f.measured(
        `export-${size}`,
        "/api/v1/public/build-export",
        { headers: { authorization: `Bearer ${token}` } },
        200,
      );
      expect(exported.entries).toHaveLength(size);
      expect(f.count.stats.queries).toBeLessThanOrEqual(8 + 4 * Math.ceil(size / 100));
      expect(JSON.stringify(exported)).not.toContain("PRIVATE DRAFT SENTINEL");
      expect(
        exported.entries.map(({ path, entry }) => ({
          id: entry.id,
          path,
          title: entry.published.title,
          fields: entry.published.fields,
          blocks: entry.published.blocks,
        })),
      ).toEqual(expected);
      expect(
        exported.entries.every(
          ({ entry }) =>
            JSON.stringify(entry.draft.fields) === JSON.stringify(entry.published.fields) &&
            JSON.stringify(entry.draft.blocks) === JSON.stringify(entry.published.blocks),
        ),
      ).toBe(true);
      console.info(
        `34B export fixture ${JSON.stringify({ entries: size, maximalEntries: 2, mediaReferences: 400, fieldsJsonBytes: Buffer.byteLength(JSON.stringify(expected[0].fields)), blockJsonBytes: Buffer.byteLength(JSON.stringify(expected[1].blocks[0].data)) })}`,
      );
    }
  } finally {
    await f.close();
  }
}, 120000);
