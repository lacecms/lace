import {
  ContentUseCases,
  NODE_LIST_QUERY_LIMITS,
  prepareConfigurationSynchronization,
  resolveCollectionQuery,
} from "@lacecms/application";

import { defineCollection, defineConfig } from "@lacecms/config";
import type { CollectionModelInput } from "@lacecms/config";
import { field } from "@lacecms/content";
import type { JsonObject } from "@lacecms/content";
import { contentModelKey, unixMilliseconds } from "@lacecms/domain";

import {
  type RepositoryContractCase,
  editor,
  resolveRoute,
  sequence,
  base64Url,
  count,
  seedModels,
  entry,
  save,
  publish,
  syncResolver,
  applySync,
  registerContract,
} from "../shared.js";

export const cases: RepositoryContractCase[] = [];
const contract = registerContract(cases);

contract(
  "public query identity avoids builds and guards untrusted, mixed and stale updates",
  async (runtime, expect) => {
    const model = async (
      listOptions?: CollectionModelInput["listOptions"],
      seo: "first" | "second" = "first",
    ) =>
      (
        await defineConfig({
          content: [
            defineCollection({
              key: "queries",
              route: "/queries/:slug",
              version: 1,
              fields: { first: field.text(), second: field.text() },
              seo: { description: seo },
              ...(listOptions === undefined ? {} : { listOptions }),
            }),
          ],
        })
      ).runtime.content[0]!;
    const original = await model();
    const { repository, sql } = await runtime.open({
      resolveModel: syncResolver([original]),
      nextId: sequence("identity"),
    });
    await applySync(repository, [original], 10);
    const stable = async () => ({
      snapshots: await sql.all("select * from content_snapshots order by id"),
      published: await sql.all("select * from published_state"),
      outbox: await sql.all("select * from outbox_events order by id"),
    });
    const baseline = await stable();
    for (const options of [
      { searchableFields: ["first"] },
      { sortableFields: ["second", "first"] },
      { sortableFields: ["first", "second"] },
      undefined,
    ] as const) {
      const current = await model(options);
      const result = await applySync(repository, [current], 20);
      expect(result.targetVersion).toBeUndefined();
      expect(await stable()).toEqual(baseline);
      expect((await repository.readConfigurationSyncState())[0]).toMatchObject({
        publicProjectionHash: current.publicProjectionHash,
        publicProjectionSourceHash: current.projectionHash,
      });
      expect((await applySync(repository, [current], 21)).status).toBe("noop");
    }
    // An untrusted identity with an unchanged full projection is recorded without a
    // build; a concurrent recording makes the older baseline-only plan stale.
    await sql.run(
      "update content_models set public_projection_hash=null, public_projection_source_hash=null",
    );
    const seedPlan = await prepareConfigurationSynchronization({
      models: [original],
      state: repository,
    });
    expect(seedPlan.plan.operations).toMatchObject([{ action: "record-baseline" }]);
    await applySync(repository, [original], 30);
    await expect(applySync(repository, [original], 31, seedPlan)).rejects.toMatchObject({
      code: "CONFIGURATION_SYNC_STALE",
    });
    expect(await stable()).toEqual(baseline);
    // Without a trusted identity, any full projection change takes the conservative path,
    // even a query-only one.
    await sql.run(
      "update content_models set public_projection_hash=null, public_projection_source_hash=null",
    );
    const enabled = await model({ searchableFields: ["first"] });
    expect((await applySync(repository, [enabled], 32)).targetVersion).toBe(2);
    expect(await count(sql, "select count(*) as count from outbox_events")).toBe(1);
    expect((await applySync(repository, [enabled], 33)).status).toBe("noop");
    // SEO and query changes together retain the public build.
    const mixed = await model({ filterableFields: ["second"] }, "second");
    expect((await applySync(repository, [mixed], 40)).targetVersion).toBe(3);
    // A full identity written without the source association is untrusted.
    await sql.run("update content_models set projection_hash='foreign-change'");
    expect((await applySync(repository, [mixed], 50)).targetVersion).toBe(4);
    expect((await applySync(repository, [mixed], 51)).status).toBe("noop");
  },
);

contract(
  "public query identity rolls back a failing final sync mutation",
  async (runtime, expect) => {
    const make = async (label: string) =>
      (
        await defineConfig({
          content: [
            defineCollection({
              key: "queries",
              route: "/queries/:slug",
              version: 1,
              label,
              fields: { summary: field.text() },
              listOptions: { searchableFields: ["summary"] },
            }),
          ],
        })
      ).runtime.content[0]!;
    const before = await make("Before"),
      after = await make("After");
    const { repository, sql, reopen } = await runtime.open({
      resolveModel: syncResolver([before]),
      nextId: sequence("failure"),
    });
    await applySync(repository, [before], 10);
    const dump = async () => ({
      models: await sql.all("select * from content_models"),
      published: await sql.all("select * from published_state"),
      outbox: await sql.all("select * from outbox_events"),
    });
    const saved = await dump();
    const failed = reopen({
      beforeMutation: (checkpoint) => {
        if (checkpoint === "public-state") throw new Error("injected identity failure");
      },
    });
    await expect(applySync(failed, [after], 20)).rejects.toThrow();
    expect(await dump()).toEqual(saved);
  },
);

contract(
  "configured collection queries share typed predicates, literal LIKE and exact field paging",
  async (runtime, expect) => {
    const definitions = {
      text: field.text(),
      area: field.textarea(),
      link: field.url(),
      category: field.select({ options: ["a", "b", "c"] }),
      number: field.number(),
      flag: field.boolean(),
      date: field.date(),
      time: field.datetime(),
    };
    const keys = Object.keys(definitions) as (keyof typeof definitions)[];
    const model = (
      await defineConfig({
        content: [
          defineCollection({
            key: "posts",
            route: "/blog/:slug",
            version: 1,
            fields: definitions,
            listOptions: {
              sortableFields: keys,
              filterableFields: keys,
              searchableFields: ["text", "area"],
            },
          }),
        ],
      })
    ).runtime.content[0]!;
    const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
    await seedModels(sql, "posts");
    let state = 123456789;
    const prefix =
      "A" +
      Array.from({ length: 6000 }, () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return String.fromCharCode(33 + (state % 90));
      }).join("");
    const fixtures: readonly [string, JsonObject][] = [
      [
        "a",
        {
          text: "a",
          area: prefix + "a",
          link: "https://example.test/" + prefix + "a",
          category: "b",
          number: 0,
          flag: false,
          date: "2024-02-29",
          time: "2026-10-25T12:00:00+02:00",
        },
      ],
      [
        "b",
        {
          text: "A",
          area: prefix + "b",
          link: "https://example.test/" + prefix + "b",
          category: "a",
          number: 2,
          flag: true,
          date: "2025-01-01",
          time: "2026-10-25T10:00:00Z",
        },
      ],
      [
        "c",
        {
          text: "Москва Ёлка [2026]* Їжак Ђак",
          area: "СЕРБІЯ",
          category: "c",
          number: 10,
          flag: false,
          date: "2026-10-25",
          time: "2026-10-26T10:00:00Z",
        },
      ],
      ["d", {}],
      [
        "e",
        {
          text: "",
          area: "",
          link: "",
          category: "",
          number: null,
          flag: null,
          date: "",
          time: "",
        },
      ],
      ["f", { text: " ", number: 2, flag: false }],
    ];
    for (const [name, fields] of fixtures)
      await repository.create({
        entry: entry(name, "posts", {
          fields,
          title: name === "d" ? "Москва title" : name,
          slug: name,
          updatedAt: 1,
        }),
        mediaReferences: [],
      });
    const list = (
      sort = "-updatedAt",
      filters: unknown = [],
      other: Record<string, unknown> = {},
    ) =>
      repository.list({
        modelKey: contentModelKey("posts"),
        listFields: ["flag", "number"],
        limit: 1,
        sort: sort as never,
        query: resolveCollectionQuery(model, sort, filters)!,
        ...other,
      });
    const fold = (value: string) => value.replace(/[A-Z]/gu, (letter) => letter.toLowerCase());
    for (const key of keys)
      for (const descending of [false, true]) {
        const sort = `${descending ? "-" : ""}field:${key}`;
        const orderValue = (fields: JsonObject) => {
          const value = fields[key];
          return value === undefined || value === null || value === ""
            ? null
            : key === "time"
              ? Date.parse(value as string)
              : typeof value === "string"
                ? fold(value)
                : Number(value);
        };
        const expected = [...fixtures]
          .sort(([a, av], [b, bv]) => {
            const left = orderValue(av),
              right = orderValue(bv);
            if (left === null || right === null)
              return left === right
                ? (a < b ? -1 : 1) * (descending ? -1 : 1)
                : left === null
                  ? 1
                  : -1;
            const compare = left < right ? -1 : left > right ? 1 : a < b ? -1 : 1;
            return compare * (descending ? -1 : 1);
          })
          .map(([name]) => name);
        const collected: string[] = [];
        let after: string | undefined;
        do {
          const page = await list(sort, [], after === undefined ? {} : { after });
          expect(page.totals.all).toBe(6);
          collected.push(...page.items.map((item) => item.id));
          after = page.nextCursor;
          if (after) expect(after.length).toBeLessThanOrEqual(4096);
        } while (after);
        expect(collected).toEqual(expected);
      }
    const match = async (filters: unknown, q?: string) =>
      (await list("title", filters, { limit: 100, ...(q === undefined ? {} : { q }) })).items
        .map((item) => item.id)
        .sort();
    for (const [filters, expected] of [
      [[{ field: "number", op: "eq", value: 0 }], ["a"]],
      [[{ field: "flag", op: "eq", value: false }], ["a", "c", "f"]],
      [
        [
          { field: "number", op: "range", min: 2, max: 10 },
          { field: "category", op: "in", values: ["b", "a"] },
        ],
        ["b"],
      ],
      [[{ field: "text", op: "eq", value: "A" }], ["a", "b"]],
      [[{ field: "text", op: "contains", value: "Ёлка" }], ["c"]],
      [[{ field: "text", op: "contains", value: "ёЛКА" }], []],
      [[{ field: "area", op: "contains", value: "СЕРБІЯ" }], ["c"]],
      [[{ field: "area", op: "contains", value: "сербія" }], []],
      [[{ field: "text", op: "contains", value: "[2026]*" }], ["c"]],
      [[{ field: "text", op: "contains", value: "елка" }], []],
      [[{ field: "link", op: "contains", value: "https://EXAMPLE.test/" }], ["a", "b"]],
      [[{ field: "date", op: "range", from: "2024-02-29", to: "2025-01-01" }], ["a", "b"]],
      [
        [
          {
            field: "time",
            op: "range",
            from: "2026-10-25T12:00:00+02:00",
            to: "2026-10-25T10:00:00Z",
          },
        ],
        ["a", "b"],
      ],
      [[{ field: "flag", op: "isNotSet" }], ["d", "e"]],
      [[{ field: "number", op: "isSet" }], ["a", "b", "c", "f"]],
    ] as const) {
      expect(await match(filters)).toEqual(expected);
    }
    expect(await match([], "Москва")).toEqual(["c", "d"]);
    expect(await match([], "МОСКВА")).toEqual([]);
    expect(await match([], "Їжак Ђак")).toEqual(["c"]);
    const unconfigured = await repository.list({
      modelKey: contentModelKey("posts"),
      listFields: [],
      sort: "title",
      limit: 100,
      q: "Москва",
    });
    expect(unconfigured.items.map((item) => item.id)).toEqual(["d"]);
    expect(
      (
        await list("title", [{ field: "flag", op: "eq", value: false }], {
          limit: 1,
          status: "draft",
        })
      ).totals,
    ).toEqual({ all: 3, draft: 3, changed: 0, published: 0 });
    expect(
      (await list("title", [], { limit: 100 })).items.find((item) => item.id === "a")!.listValues,
    ).toEqual({ flag: false, number: 0 });
    for (const [key, value] of [
      ["date", "2026-02-30"],
      ["number", "0"],
      ["flag", 0],
      ["time", "2026-10-25T10:00:00Z"],
    ] as const) {
      const scalarPage = await list(`field:${key}`);
      const boundary = JSON.parse(
        atob(scalarPage.nextCursor!.replace(/-/gu, "+").replace(/_/gu, "/")),
      );
      await expect(
        list(`field:${key}`, [], { after: base64Url({ ...boundary, value }) }),
      ).rejects.toMatchObject({ pointer: "/after" });
    }
    const first = await list("field:area");
    const cursor = first.nextCursor!;
    const decoded = JSON.parse(atob(cursor.replace(/-/gu, "+").replace(/_/gu, "/"))) as Record<
      string,
      unknown
    >;
    for (const change of [
      { id: "absent" },
      { snapshot: "absent" },
      { revision: 99 },
      { rank: 1 },
      { type: "number" },
      { kind: "foreign" },
    ])
      await expect(
        list("field:area", [], { after: base64Url({ ...decoded, ...change }) }),
      ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE", pointer: "/after" });
    // Publication does not alter the current draft identity; public data stays immutable after an edit.
    const anchor = first.items[0]!.id;
    await repository.publish(publish(anchor, 1, 2));
    await expect(list("field:area", [], { after: cursor })).resolves.toMatchObject({
      totals: { published: 1 },
    });
    await expect(repository.saveCompleteDraft(save(anchor, 99, 3))).rejects.toThrow();
    await expect(list("field:area", [], { after: cursor })).resolves.toBeDefined();
    const loaded = await repository.load({ entryId: anchor });
    await repository.saveCompleteDraft(
      save(anchor, 1, 4, {
        fields: { ...loaded!.draft.fields, text: "Edited" },
        title: loaded!.draft.title,
      }),
    );
    await expect(list("field:area", [], { after: cursor })).rejects.toMatchObject({
      pointer: "/after",
    });
    expect((await repository.loadPublished({ entryId: anchor }))!.fields.text).toBe(
      loaded!.draft.fields.text,
    );
    // A deleted boundary is rejected even when no further items would match.
    const final = await list("field:area", [], { limit: 5 });
    const lastCursor = final.nextCursor!;
    const lastId = final.items.at(-1)!.id;
    const last = await repository.load({ entryId: lastId });
    await repository.delete({
      entryId: lastId,
      expectedRevision: last!.draft.revision,
      deletedAt: unixMilliseconds(5),
      deletedBy: editor,
    });
    await expect(list("field:area", [], { after: lastCursor })).rejects.toMatchObject({
      pointer: "/after",
    });
  },
);

contract(
  "a collection default sort pages like the explicit sort and binds omitted-sort cursors",
  async (runtime, expect) => {
    const configFor = (defaultSort?: "field:order" | "-field:order") =>
      defineConfig({
        content: [
          defineCollection({
            key: "posts",
            route: "/blog/:slug",
            version: 1,
            fields: { order: field.number() },
            listOptions: {
              sortableFields: ["order"],
              ...(defaultSort === undefined ? {} : { defaultSort }),
            },
          }),
        ],
      });
    const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
    await seedModels(sql, "posts");
    const fixtures: readonly [string, JsonObject][] = [
      ["a", { order: 10 }],
      ["b", {}],
      ["c", { order: 2 }],
      ["d", { order: 2 }],
    ];
    for (const [name, fields] of fixtures)
      await repository.create({
        entry: entry(name, "posts", { fields, title: name, slug: name, updatedAt: 1 }),
        mediaReferences: [],
      });
    const lister = async (defaultSort?: "field:order" | "-field:order") =>
      new ContentUseCases({
        clock: { now: () => unixMilliseconds(50) },
        config: (await configFor(defaultSort)).runtime,
        content: repository,
        media: repository,
        idGenerator: { next: sequence("default-sort") },
      });
    const ordered = await lister("field:order");
    type PageInput = Pick<Parameters<ContentUseCases["list"]>[0], "after" | "sort">;
    const page = (useCases: ContentUseCases, input: Partial<PageInput> = {}) =>
      useCases.list({ actor: editor, modelKey: "posts", limit: 2, ...input });
    // Missing values last, equal values by entry ID, the same as the explicit sort.
    const first = await page(ordered);
    expect(first.items.map((item) => item.id)).toEqual(["c", "d"]);
    const second = await page(ordered, { after: first.nextCursor! });
    expect(second.items.map((item) => item.id)).toEqual(["a", "b"]);
    const explicit = await page(ordered, { sort: "field:order" });
    expect(explicit.items).toEqual(first.items);
    // An explicit sort wins, and its cursor is not an omitted-sort cursor.
    const recent = await page(ordered, { sort: "-updatedAt" });
    await expect(page(ordered, { after: recent.nextCursor! })).rejects.toMatchObject({
      pointer: "/after",
    });
    // A changed default rejects the continuation of an omitted-sort page.
    for (const changed of [await lister("-field:order"), await lister()])
      await expect(page(changed, { after: first.nextCursor! })).rejects.toMatchObject({
        pointer: "/after",
      });
    expect((await page(await lister())).items).toHaveLength(2);
  },
);

contract(
  "bounded string anchors cover long text/select, replacement, foreign models and empty races",
  async (runtime, expect) => {
    const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
    await seedModels(sql, "posts", "settings");
    const long = Array.from({ length: 6000 }, (_, i) =>
      String.fromCharCode(65 + ((i * 7) % 26)),
    ).join("");
    const model = (
      await defineConfig({
        content: [
          defineCollection({
            key: "posts",
            route: "/blog/:slug",
            version: 1,
            fields: {
              text: field.text(),
              choice: field.select({ options: [long + "a", long + "b"] }),
            },
            listOptions: { sortableFields: ["text", "choice"] },
          }),
        ],
      })
    ).runtime.content[0]!;
    for (const [id, value] of [
      ["a", long + "a"],
      ["b", long + "b"],
      ["c", ""],
      ["d", null],
    ] as const)
      await repository.create({
        entry: entry(id, "posts", {
          updatedAt: 1,
          slug: id,
          fields: { text: value, choice: value },
        }),
        mediaReferences: [],
      });
    const list = (sort: string, after?: string, status?: "draft" | "published") =>
      repository.list({
        modelKey: contentModelKey("posts"),
        sort: sort as never,
        listFields: [],
        limit: 1,
        query: resolveCollectionQuery(model, sort, [])!,
        ...(after ? { after: after as never } : {}),
        ...(status ? { status } : {}),
      });
    for (const field of ["text", "choice"])
      for (const desc of [false, true]) {
        const sort = `${desc ? "-" : ""}field:${field}`;
        let after: string | undefined;
        const ids: string[] = [];
        do {
          const result = await list(sort, after);
          ids.push(...result.items.map((row) => row.id));
          after = result.nextCursor;
          if (after) {
            expect(after.length).toBeLessThanOrEqual(4096);
            expect(after).not.toContain(long);
          }
        } while (after);
        expect(ids).toEqual(desc ? ["b", "a", "d", "c"] : ["a", "b", "c", "d"]);
      }
    const first = await list("field:text", undefined, "draft"),
      cursor = first.nextCursor!;
    const anchor = first.items[0]!.id;
    // A foreign model fails even though the snapshot and revision still exist.
    await sql.run("update content_entries set model_key='settings' where id=?", anchor);
    await expect(list("field:text", cursor, "draft")).rejects.toMatchObject({ pointer: "/after" });
    await sql.run("update content_entries set model_key='posts' where id=?", anchor);
    await sql.run(
      "insert into content_snapshots (id, entry_id, revision, slug, title, fields_json, schema_version, created_at, updated_at, updated_by) select 'replacement', entry_id, revision, slug, title, fields_json, schema_version, created_at, updated_at, updated_by from content_snapshots where id=?",
      `${anchor}-draft`,
    );
    await sql.run("update content_entries set draft_snapshot_id='replacement' where id=?", anchor);
    await expect(list("field:text", cursor, "draft")).rejects.toMatchObject({ pointer: "/after" });
    await sql.run(
      "update content_entries set draft_snapshot_id=? where id=?",
      `${anchor}-draft`,
      anchor,
    );
    // An unchanged boundary may leave the status set; its order remains usable.
    await repository.publish(publish(anchor, 1, 2));
    const draftPage = await list("field:text", cursor, "draft");
    expect(draftPage.items[0]!.id).toBe("b");
    for (const id of ["b", "c", "d"]) await repository.publish(publish(id, 1, 2));
    expect((await list("field:text", cursor, "draft")).items).toEqual([]);
    // Races overlap the async fingerprint/planning phase and a successful draft revision update.
    // A single item statement must either see the old snapshot or reject, including zero matches.
    for (const status of ["draft"] as const) {
      const pending = list("field:text", cursor, status).then(
        (page) => ({ page }),
        (error) => ({ error }),
      );
      await sql.run(
        "update content_snapshots set revision=revision+1 where id=?",
        `${anchor}-draft`,
      );
      const result = await pending;
      if ("error" in result) expect(result.error).toMatchObject({ pointer: "/after" });
      else expect(result.page.items.every((row) => row.id !== anchor)).toBe(true);
      await expect(list("field:text", cursor, status)).rejects.toMatchObject({ pointer: "/after" });
      await sql.run("update content_snapshots set revision=1 where id=?", `${anchor}-draft`);
    }
  },
);

contract(
  "query performance is model-scoped with constant first/scalar/string statement counts at 1000 entries",
  async (runtime, expect) => {
    const { repository, sql, reads } = await runtime.open({ resolveModel: resolveRoute });
    await seedModels(sql, "posts", "settings");
    const model = (
      await defineConfig({
        content: [
          defineCollection({
            key: "posts",
            route: "/blog/:slug",
            version: 1,
            fields: { text: field.text(), n: field.number(), flag: field.boolean() },
            listOptions: {
              sortableFields: ["text", "n"],
              filterableFields: ["n", "flag", "text"],
              searchableFields: ["text"],
            },
          }),
        ],
      })
    ).runtime.content[0]!;
    // Set-based fixture loading avoids measuring editorial writes and includes one near-limit draft.
    await sql.run(`with recursive seq(n) as (values(0) union all select n+1 from seq where n<999)
    insert into content_entries (id,model_key,created_by,created_at,updated_at)
    select 'perf-'||printf('%04d',n), case when n%10=0 then 'settings' else 'posts' end,
    'editor',1,n+1 from seq`);
    await sql.run(`with recursive seq(n) as (values(0) union all select n+1 from seq where n<999)
    insert into content_snapshots (id,entry_id,revision,title,fields_json,schema_version,created_at,updated_at,updated_by)
    select 'perf-draft-'||n,'perf-'||printf('%04d',n),1,'Entry '||n,
    json_object('n',n,'flag',json(case when n%2=0 then 'true' else 'false' end),'text',
      case when n=999 then replace(hex(zeroblob(450000)),'0','x')||' needle' else 'Mixed Москва Launch '||printf('%04d',n) end),1,1,1,'editor' from seq`);
    await sql.run(
      "update content_entries set draft_snapshot_id='perf-draft-'||cast(substr(id,6) as integer)",
    );
    const list = (sort: string, limit: number, after?: string, filters: unknown = [], q?: string) =>
      repository.list({
        modelKey: contentModelKey("posts"),
        listFields: [],
        limit,
        sort: sort as never,
        query: resolveCollectionQuery(model, sort, filters)!,
        ...(after ? { after: after as never } : {}),
        ...(q ? { q } : {}),
      });
    const evidence: unknown[] = [];
    for (const sort of ["-updatedAt", "field:n", "field:text"])
      for (const limit of [1, 10, 100]) {
        reads.reset();
        const started = Date.now();
        const first = await list(sort, limit);
        const initial = reads.snapshot();
        expect(initial.statements).toBe(2);
        expect(first.totals.all).toBe(900);
        expect(first.items.length).toBe(limit);
        expect(initial.sql.every((statement) => statement.includes("e.model_key ="))).toBe(true);
        // Only projection JSON may cross the adapter boundary, never a full draft.
        expect(
          initial.sql.every((statement) => !statement.includes("d.fields_json as fields_json")),
        ).toBe(true);
        reads.reset();
        const next = await list(sort, limit, first.nextCursor!);
        const continuation = reads.snapshot();
        expect(continuation.statements).toBe(2);
        expect(next.items.length).toBe(limit);
        evidence.push({
          sort,
          limit,
          ms: Date.now() - started,
          first: initial.statements,
          continuation: continuation.statements,
          ...(initial.rowsRead === undefined
            ? {}
            : { firstRowsRead: initial.rowsRead, continuationRowsRead: continuation.rowsRead }),
        });
      }
    const far = await list(
      "field:n",
      10,
      undefined,
      [{ field: "n", op: "range", min: 990 }],
      "needle",
    );
    expect(far.items.map((row) => row.id)).toEqual(["perf-0999"]);
    // Default list preserves the existing model-entry index.
    const queryPlan = await sql.all<{ detail: string }>(
      "explain query plan select id from content_entries where model_key=? order by updated_at desc,id desc limit 10",
      "posts",
    );
    expect(queryPlan.some((row) => /index/iu.test(row.detail))).toBe(true);
    // Backend limits remain truthful: no partial page is substituted for a database error.
    expect(far.totals.all).toBe(1);
    runtime.recordEvidence?.(evidence);
  },
);

contract(
  "runtime LIKE policies count UTF-8 escapes before SQL while equality keeps 200 units",
  async (runtime, expect) => {
    const { repository, sql, reads } = await runtime.open({ resolveModel: resolveRoute });
    await seedModels(sql, "posts");
    const terms = [
      "a".repeat(48),
      "я".repeat(24),
      "%".repeat(24),
      "_".repeat(24),
      "\\".repeat(24),
      "aя".repeat(16),
      "😀".repeat(12),
      "я".repeat(200),
    ];
    await repository.create({
      entry: entry("budget", "posts", {
        updatedAt: 1,
        title: "Budget",
        fields: { text: terms.join(" separator ") },
      }),
      mediaReferences: [],
    });
    const model = (
      await defineConfig({
        content: [
          defineCollection({
            key: "posts",
            route: "/blog/:slug",
            version: 1,
            fields: { text: field.text() },
            listOptions: { filterableFields: ["text"], searchableFields: ["text"] },
          }),
        ],
      })
    ).runtime.content[0]!;
    const list = (q?: string, filters: unknown = []) =>
      repository.list({
        modelKey: contentModelKey("posts"),
        listFields: [],
        sort: "title",
        limit: 5,
        // Direct callers cannot relax an adapter's own policy.
        listQueryLimits: NODE_LIST_QUERY_LIMITS,
        query: resolveCollectionQuery(model, "title", filters)!,
        ...(q ? { q } : {}),
      });
    for (const value of terms.slice(0, -1)) {
      expect((await list(` ${value} `)).items.map((row) => row.id)).toEqual(["budget"]);
      expect(
        (await list(undefined, [{ field: "text", op: "contains", value }])).items.map(
          (row) => row.id,
        ),
      ).toEqual(["budget"]);
    }
    for (const value of [
      "a".repeat(49),
      "я".repeat(24) + "a",
      "%".repeat(24) + "a",
      "aя".repeat(16) + "a",
      "я".repeat(200),
    ]) {
      reads.reset();
      if (
        runtime.listQueryLimits?.maxLikePatternBytes !== undefined &&
        runtime.listQueryLimits.maxLikePatternBytes !== null
      ) {
        await expect(list(value)).rejects.toMatchObject({ pointer: "/q" });
        await expect(
          list(undefined, [{ field: "text", op: "contains", value }]),
        ).rejects.toMatchObject({ pointer: "/filters/0/value" });
        expect(reads.snapshot().statements).toBe(0);
      } else {
        await expect(list(value)).resolves.toBeDefined();
        await expect(
          list(undefined, [{ field: "text", op: "contains", value }]),
        ).resolves.toBeDefined();
      }
    }
    await sql.run(
      "update content_snapshots set fields_json=? where id='budget-draft'",
      JSON.stringify({ text: "я".repeat(200) }),
    );
    expect(
      (await list(undefined, [{ field: "text", op: "eq", value: "я".repeat(200) }])).items.map(
        (row) => row.id,
      ),
    ).toEqual(["budget"]);
  },
);

declare function atob(data: string): string;
