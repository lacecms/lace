// @ts-nocheck
// TODO(rf2): Type legacy SQLite/product harnesses, branded values and partial runtime adapters.
import { existsSync, mkdirSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import { migrateNodeDatabase, openNodeDatabase } from "./index.js";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, mkdirSync: vi.fn(actual.mkdirSync) };
});

test("explicit migration creates nested parents and preserves data on repeat", async () => {
  const root = await mkdtemp(join(tmpdir(), "lace-fresh-migrate-"));
  const path = join(root, "nested", "data", "lace.sqlite");
  try {
    const versions = migrateNodeDatabase(path);
    expect(versions.length).toBeGreaterThan(0);
    await writeFile(join(root, "nested", "data", "keep.txt"), "neighbour");
    const database = openNodeDatabase(path);
    try {
      database.connection
        .prepare(
          "insert into published_state (singleton_key, version, updated_at) values (1, 42, 0)",
        )
        .run();
    } finally {
      database.connection.close();
    }
    expect(migrateNodeDatabase(path)).toEqual(versions);
    const reopened = openNodeDatabase(path);
    try {
      expect(
        reopened.connection
          .prepare("select version from published_state where singleton_key = 1")
          .get(),
      ).toEqual({ version: 42 });
      expect(
        reopened.connection.prepare("select count(*) as count from __drizzle_migrations").get(),
      ).toEqual({ count: versions.length });
    } finally {
      reopened.connection.close();
    }
    expect(await readFile(join(root, "nested", "data", "keep.txt"), "utf8")).toBe("neighbour");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("memory migration never prepares directories", () => {
  vi.mocked(mkdirSync).mockClear();
  expect(migrateNodeDatabase(":memory:").length).toBeGreaterThan(0);
  expect(mkdirSync).not.toHaveBeenCalled();
});

test("blocked parent stops migration without changing existing files", async () => {
  const root = await mkdtemp(join(tmpdir(), "lace-blocked-migrate-"));
  const blocked = join(root, "blocked");
  try {
    await writeFile(blocked, "preserve me");
    expect(() => migrateNodeDatabase(join(blocked, "data/lace.sqlite"))).toThrow();
    expect(existsSync(join(blocked, "data/lace.sqlite"))).toBe(false);
    expect(await readFile(blocked, "utf8")).toBe("preserve me");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("parent created concurrently is accepted without replacement", async () => {
  const root = await mkdtemp(join(tmpdir(), "lace-race-migrate-"));
  const actual = await vi.importActual("node:fs");
  try {
    vi.mocked(mkdirSync).mockImplementationOnce((path, options) => {
      actual.mkdirSync(path, options);
      return actual.mkdirSync(path, options);
    });
    expect(migrateNodeDatabase(join(root, "nested/data/lace.sqlite")).length).toBeGreaterThan(0);
  } finally {
    vi.mocked(mkdirSync).mockImplementation(actual.mkdirSync);
    await rm(root, { recursive: true, force: true });
  }
});

test("Node migration refuses to report success over a foreign-key violation", async () => {
  const root = await mkdtemp(join(tmpdir(), "lace-fk-violation-"));
  const path = join(root, "lace.sqlite");
  try {
    migrateNodeDatabase(path);
    const database = openNodeDatabase(path);
    try {
      database.connection.pragma("foreign_keys = OFF");
      database.connection
        .prepare(
          "insert into content_entries (id, model_key, created_by, created_at, updated_at) values ('orphan', 'missing', 'admin', 1, 1)",
        )
        .run();
    } finally {
      database.connection.close();
    }
    expect(() => migrateNodeDatabase(path)).toThrow(/foreign-key violation/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a database migrated by an engine older than the baseline is refused unchanged", async () => {
  const { UnsupportedDatabaseError } = await import("./index.js");
  const root = await mkdtemp(join(tmpdir(), "lace-pre-baseline-"));
  const path = join(root, "lace.sqlite");
  try {
    const database = openNodeDatabase(path);
    try {
      database.connection.exec(
        "create table __drizzle_migrations (id integer primary key autoincrement, hash text not null, created_at numeric); insert into __drizzle_migrations (hash, created_at) values ('old', 1789240330790); create table content_models (key text primary key); insert into content_models values ('posts');",
      );
    } finally {
      database.connection.close();
    }
    const before = await readFile(path);
    let failure;
    try {
      migrateNodeDatabase(path);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(UnsupportedDatabaseError);
    expect(failure.message).toMatch(/older than the baseline/u);
    expect(failure.message).toMatch(/recreate/u);
    expect(await readFile(path)).toEqual(before);
    const reopened = openNodeDatabase(path);
    try {
      expect(
        reopened.connection.prepare("select count(*) as count from __drizzle_migrations").get(),
      ).toEqual({ count: 1 });
      expect(reopened.connection.prepare("select key from content_models").all()).toEqual([
        { key: "posts" },
      ]);
    } finally {
      reopened.connection.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
