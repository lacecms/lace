import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import * as db from "@lacecms/db";
import { is } from "drizzle-orm";
import { SQLiteTable, getTableConfig } from "drizzle-orm/sqlite-core";
import { expect, test } from "vitest";

const directory = resolve(import.meta.dirname, "../docs/architecture");
const HISTORY = "history.md";
const MAX_TOTAL_PROSE_LINES = 2_500;
const MAX_FILE_LINES = 600;
const SECTION_COUNT = 26;
const CHANGE_CODE = /\b(?:CE|SM|LIST|CQ|MCP|RF)\d+[A-Z]?\b|\bStep \d+\b|\b\d{2}[A-H]\b/g;

const files = new Map(
  readdirSync(directory)
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((name) => [name, readFileSync(join(directory, name), "utf8")]),
);

function lines(source) {
  return source.replace(/\n$/, "").split("\n");
}

function mermaidBlocks(source) {
  return [...source.matchAll(/^```mermaid\n([\s\S]*?)^```$/gm)].map((match) => match[1]);
}

function proseLineCount(source) {
  let inside = false;
  let count = 0;
  for (const line of lines(source)) {
    if (!inside && line.startsWith("```mermaid")) inside = true;
    else if (inside && line.startsWith("```")) inside = false;
    else if (!inside) count += 1;
  }
  return count;
}

function schemaTables() {
  const tables = new Map();
  for (const value of Object.values(db)) {
    if (!is(value, SQLiteTable)) continue;
    const config = getTableConfig(value);
    const primaryKey = [
      ...config.columns.filter((column) => column.primary).map((column) => column.name),
      ...config.primaryKeys.flatMap((key) => key.columns.map((column) => column.name)),
    ];
    const foreignKeys = config.foreignKeys.map((key) => {
      const reference = key.reference();
      return {
        columns: reference.columns.map((column) => column.name),
        table: getTableConfig(reference.foreignTable).name,
      };
    });
    tables.set(config.name, { primaryKey, foreignKeys });
  }
  return tables;
}

function diagramTables() {
  const diagrams = [...files.values()]
    .flatMap(mermaidBlocks)
    .filter((block) => block.trimStart().startsWith("erDiagram"));
  expect(diagrams, "exactly one erDiagram in docs/architecture").toHaveLength(1);
  const entities = new Map();
  const relations = [];
  let current = null;
  for (const raw of diagrams[0].split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("%%") || line === "erDiagram") continue;
    const open = /^(\w+)\s*\{$/.exec(line);
    if (open) {
      current = { primaryKey: [], foreignKeyColumns: [] };
      entities.set(open[1], current);
      continue;
    }
    if (line === "}") {
      current = null;
      continue;
    }
    if (current) {
      const attribute = /^\w+\s+(\w+)(?:\s+((?:PK|FK|UK)(?:\s*,\s*(?:PK|FK|UK))*))?/.exec(line);
      expect(attribute, `unrecognized erDiagram attribute: ${line}`).not.toBeNull();
      const keys = (attribute[2] ?? "").split(/\s*,\s*/);
      if (keys.includes("PK")) current.primaryKey.push(attribute[1]);
      if (keys.includes("FK")) current.foreignKeyColumns.push(attribute[1]);
      continue;
    }
    const relation = /^(\w+)\s+[|}][o|]--[o|][|{]\s+(\w+)\s*:\s*"([^"]*)"$/.exec(line);
    expect(relation, `unrecognized erDiagram line: ${line}`).not.toBeNull();
    relations.push(`${relation[1]}(${relation[3]}) -> ${relation[2]}`);
  }
  return { entities, relations };
}

const sorted = (values) => [...values].sort();
const difference = (left, right) => sorted([...left].filter((value) => !right.has(value)));

test("the table diagram names every Drizzle table, primary key and foreign key", () => {
  const schema = schemaTables();
  const { entities, relations } = diagramTables();
  expect(schema.size, "tables exported by @lacecms/db").toBeGreaterThan(0);

  const schemaNames = new Set(schema.keys());
  const diagramNames = new Set(entities.keys());
  expect(difference(schemaNames, diagramNames), "schema tables missing from the diagram").toEqual(
    [],
  );
  expect(difference(diagramNames, schemaNames), "diagram tables the schema lacks").toEqual([]);

  const columnSet = (pick) =>
    new Set(
      [...schema].flatMap(([table, definition]) =>
        pick(definition).map((column) => `${table}.${column}`),
      ),
    );
  const diagramColumnSet = (pick) =>
    new Set(
      [...entities].flatMap(([table, entity]) =>
        pick(entity).map((column) => `${table}.${column}`),
      ),
    );

  const schemaPrimary = columnSet((definition) => definition.primaryKey);
  const diagramPrimary = diagramColumnSet((entity) => entity.primaryKey);
  expect(
    difference(schemaPrimary, diagramPrimary),
    "primary keys missing from the diagram",
  ).toEqual([]);
  expect(
    difference(diagramPrimary, schemaPrimary),
    "diagram primary keys the schema lacks",
  ).toEqual([]);

  const schemaForeign = columnSet((definition) =>
    definition.foreignKeys.flatMap((key) => key.columns),
  );
  const diagramForeign = diagramColumnSet((entity) => entity.foreignKeyColumns);
  expect(difference(schemaForeign, diagramForeign), "FK columns missing from the diagram").toEqual(
    [],
  );
  expect(difference(diagramForeign, schemaForeign), "diagram FK columns the schema lacks").toEqual(
    [],
  );

  const schemaRelations = new Set(
    [...schema].flatMap(([table, definition]) =>
      definition.foreignKeys.map((key) => `${table}(${key.columns.join(", ")}) -> ${key.table}`),
    ),
  );
  const diagramRelations = new Set(relations);
  expect(relations.length, "duplicate diagram relations").toBe(diagramRelations.size);
  expect(
    difference(schemaRelations, diagramRelations),
    "relations missing from the diagram",
  ).toEqual([]);
  expect(
    difference(diagramRelations, schemaRelations),
    "diagram relations the schema lacks",
  ).toEqual([]);
});

test("change codes appear only in the history file", () => {
  const found = [];
  for (const [name, source] of files) {
    if (name === HISTORY) continue;
    lines(source).forEach((line, index) => {
      const text = line.replace(/\]\([^)]*\)/g, "]");
      for (const match of text.matchAll(CHANGE_CODE)) {
        found.push(`${name}:${index + 1} ${match[0]}`);
      }
    });
  }
  expect(found, "roadmap change codes outside history.md").toEqual([]);
});

test("the section map matches the numbered section headings", () => {
  const headings = new Map();
  for (const [name, source] of files) {
    for (const match of source.matchAll(/^## (\d+)\. (.+)$/gm)) {
      const number = Number(match[1]);
      expect(headings.has(number), `section ${number} appears in more than one file`).toBe(false);
      headings.set(number, { file: name, title: match[2].trim() });
    }
  }
  expect(sorted([...headings.keys()].map(String)), "numbered sections").toEqual(
    sorted(Array.from({ length: SECTION_COUNT }, (_, index) => String(index + 1))),
  );

  const readme = files.get("README.md");
  const mapped = new Map();
  for (const match of readme.matchAll(/^\| (\d+)\. ([^|]+?) \| \[([^\]]+)\]\(([^)]+)\) \|$/gm)) {
    mapped.set(Number(match[1]), { file: match[4], title: match[2].trim() });
  }
  const mismatches = [];
  for (const [number, heading] of headings) {
    const row = mapped.get(number);
    if (!row) mismatches.push(`§${number} has no section map row`);
    else if (row.file !== heading.file)
      mismatches.push(`§${number} is in ${heading.file}, map says ${row.file}`);
    else if (row.title !== heading.title)
      mismatches.push(`§${number} is titled "${heading.title}", map says "${row.title}"`);
  }
  for (const number of mapped.keys()) {
    if (!headings.has(number)) mismatches.push(`map row §${number} has no section heading`);
  }
  expect(mismatches, "section map mismatches").toEqual([]);
});

test("architecture files stay within their size ceilings", () => {
  const oversized = [...files]
    .map(([name, source]) => [name, lines(source).length])
    .filter(([, count]) => count >= MAX_FILE_LINES)
    .map(([name, count]) => `${name}: ${count} lines (limit below ${MAX_FILE_LINES})`);
  expect(oversized, "oversized architecture files").toEqual([]);

  const total = [...files.values()].reduce((sum, source) => sum + proseLineCount(source), 0);
  expect(
    total,
    `architecture prose is ${total} lines outside Mermaid blocks (limit below ${MAX_TOTAL_PROSE_LINES})`,
  ).toBeLessThan(MAX_TOTAL_PROSE_LINES);
});
