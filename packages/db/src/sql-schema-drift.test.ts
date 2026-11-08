import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { expect, test } from "vitest";
import {
  BLOCK_COLUMNS_SQL,
  BLOCK_COPY_COLUMNS_SQL,
  checkedInMigrations,
  ENTRY_COLUMNS_SQL,
  MEDIA_COLUMNS_SQL,
  SNAPSHOT_COLUMNS_SQL,
} from "./index.js";

test("shared SQL column lists match the migrated schema", async () => {
  const database = new DatabaseSync(":memory:");
  try {
    for (const migration of checkedInMigrations) {
      database.exec(
        await readFile(new URL(`../drizzle/${migration.name}`, import.meta.url), "utf8"),
      );
    }
    const lists = [
      {
        name: "ENTRY_COLUMNS_SQL",
        statement: ENTRY_COLUMNS_SQL,
        tables: { "": "content_entries" },
      },
      {
        name: "SNAPSHOT_COLUMNS_SQL",
        statement: SNAPSHOT_COLUMNS_SQL,
        tables: { s: "content_snapshots", u: "user" },
      },
      { name: "BLOCK_COLUMNS_SQL", statement: BLOCK_COLUMNS_SQL, tables: { "": "content_blocks" } },
      {
        name: "BLOCK_COPY_COLUMNS_SQL",
        statement: `select ${BLOCK_COPY_COLUMNS_SQL} from content_blocks`,
        tables: { "": "content_blocks" },
      },
      {
        name: "MEDIA_COLUMNS_SQL",
        statement: `select ${MEDIA_COLUMNS_SQL} from media m`,
        tables: { m: "media" },
      },
    ];
    for (const { name, statement, tables } of lists) {
      const selected = /^select\s+([\s\S]+?)\s+from\s/iu.exec(statement)?.[1];
      expect(selected, `${name} has a SELECT list`).toBeDefined();
      for (const item of selected!.split(",")) {
        const match = /^\s*(?:(\w+)\.)?(\w+)\s*$/u.exec(item);
        expect(match, `${name} has an unrecognized column: ${item}`).not.toBeNull();
        const alias = match![1] ?? "";
        const column = match![2]!;
        const table = (tables as Record<string, string>)[alias];
        expect(table, `${name} has unknown alias ${alias}`).toBeDefined();
        const columns = database.prepare(`pragma table_info("${table}")`).all();
        expect(
          columns.some((row) => row.name === column),
          `${name}: ${table}.${column} is missing`,
        ).toBe(true);
      }
      expect(() => database.prepare(statement), `${name} must prepare`).not.toThrow();
    }
  } finally {
    database.close();
  }
});
