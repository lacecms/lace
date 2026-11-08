import { actorId, contentEntryId } from "@lacecms/domain";
import { expect, test } from "vitest";
import {
  BUILD_EXPORT_CANDIDATES_SQL,
  BUILD_EXPORT_FIRST_PAGE_VERSION_SQL,
  BUILD_EXPORT_VERSION_SQL,
  encodeBuildExportCursor,
} from "../builds/export.js";
import { SqlContentReader } from "./content-reader.js";
import type { ContentReadSql, SqlReadGroupRows, SqlReadStatement } from "./content-reader.js";

interface FakeOptions {
  readonly bindChunk?: number;
  readonly firstVersion?: number;
  readonly secondVersion?: number;
  readonly rows?: (sql: string, params: readonly unknown[]) => readonly unknown[];
}

/** Records every statement and read group the reader issues. */
function fakeSql(options: FakeOptions = {}) {
  const calls: { readonly sql: string; readonly params: readonly unknown[] }[] = [];
  const groups: (readonly SqlReadStatement[])[] = [];
  const answer = (statement: SqlReadStatement, version: number): readonly unknown[] => {
    if (
      statement.sql === BUILD_EXPORT_FIRST_PAGE_VERSION_SQL ||
      statement.sql === BUILD_EXPORT_VERSION_SQL
    )
      return [{ globals_bytes: 0, version }];
    if (statement.sql === BUILD_EXPORT_CANDIDATES_SQL) return [];
    return [];
  };
  const sql: ContentReadSql = {
    bindChunk: options.bindChunk ?? 200,
    all: async <Row>(text: string, ...params: readonly unknown[]) => {
      calls.push({ sql: text, params });
      return (options.rows?.(text, params) ?? []) as readonly Row[];
    },
    readGroups: async (first, next) => {
      groups.push(first);
      const firstRows: SqlReadGroupRows = first.map((statement) =>
        answer(statement, options.firstVersion ?? 3),
      );
      const second = next(firstRows);
      groups.push(second);
      const secondRows: SqlReadGroupRows = second.map((statement) =>
        answer(statement, options.secondVersion ?? options.firstVersion ?? 3),
      );
      return [firstRows, secondRows] as const;
    },
  };
  return { calls, groups, sql };
}

const noModels = () => undefined;

test("a build-export page is read through one two-group read", async () => {
  const fake = fakeSql();
  const page = await new SqlContentReader(fake.sql, noModels).exportBuildContentPage({
    limit: 10,
  });
  expect(page).toEqual({ entries: [], globals: [], version: 3 });
  expect(fake.calls).toEqual([]);
  expect(fake.groups.map((group) => group.length)).toEqual([2, 6]);
  expect(fake.groups[0]![0]!.sql).toBe(BUILD_EXPORT_FIRST_PAGE_VERSION_SQL);
  expect(fake.groups[1]![0]!.sql).toBe(BUILD_EXPORT_VERSION_SQL);
  expect(fake.groups[1]!.slice(1, 5).every((statement) => statement.params.length === 2)).toBe(
    true,
  );
});

test("a continuation page omits globals and fails before the second group on a stale cursor", async () => {
  const continued = fakeSql();
  await new SqlContentReader(continued.sql, noModels).exportBuildContentPage({
    after: encodeBuildExportCursor(3, "/a"),
    limit: 10,
  });
  expect(continued.groups.map((group) => group.length)).toEqual([2, 5]);
  expect(continued.groups[0]![1]!.params).toEqual(["/a", 11]);

  const stale = fakeSql({ firstVersion: 4 });
  await expect(
    new SqlContentReader(stale.sql, noModels).exportBuildContentPage({
      after: encodeBuildExportCursor(3, "/a"),
      limit: 10,
    }),
  ).rejects.toMatchObject({ code: "BUILD_EXPORT_VERSION_CHANGED" });
  expect(stale.groups).toHaveLength(1);
});

test("a version change observed by the second group fails the page", async () => {
  const fake = fakeSql({ firstVersion: 3, secondVersion: 4 });
  await expect(
    new SqlContentReader(fake.sql, noModels).exportBuildContentPage({ limit: 10 }),
  ).rejects.toMatchObject({ code: "BUILD_EXPORT_VERSION_CHANGED" });
  expect(fake.groups).toHaveLength(2);
});

test("identifier lists are chunked by the runtime bind chunk", async () => {
  const fake = fakeSql({
    bindChunk: 2,
    rows: (_sql, params) => params.map((id) => ({ id, name: `Name ${String(id)}` })),
  });
  const reader = new SqlContentReader(fake.sql, noModels);
  const actors = await reader.describeActors(["a", "b", "c", "a", "d", "e"].map(actorId));
  expect(fake.calls.map((call) => call.params)).toEqual([["a", "b"], ["c", "d"], ["e"]]);
  expect(actors.map((actor) => actor.displayName)).toEqual([
    "Name a",
    "Name b",
    "Name c",
    "Name a",
    "Name d",
    "Name e",
  ]);
});

test("single-row reads return the first row or null", async () => {
  const fake = fakeSql({
    rows: (sql) => (sql.includes("published_state") ? [{ version: 9 }] : []),
  });
  const reader = new SqlContentReader(fake.sql, noModels);
  expect(await reader.publishedContentVersion()).toBe(9);
  expect(await reader.loadMedia("missing")).toBeNull();
  expect(await reader.load({ entryId: contentEntryId("missing") })).toBeNull();
});
