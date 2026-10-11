import { expect, test, vi } from "vitest";
import { definePage, defineConfig } from "@lacecms/config";
import { defineCollection } from "@lacecms/config";
import { unixMilliseconds } from "@lacecms/domain";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  migrateNodeDatabase,
  NodeContentRepository,
  openNodeDatabase,
  runLocalContentSync,
} from "@lacecms/platform-node";
import { loadProjectConfig } from "../dist/project-config.js";

const config = await defineConfig({
  content: [definePage({ key: "home", path: "/", version: 1 })],
});

function fixture(storedModels = []) {
  const messages = [];
  const target = {
    readConfigurationSyncState: vi.fn(async () => storedModels),
    applyConfigurationSynchronization: vi.fn(async () => ({ status: "applied", operations: [] })),
  };
  const input = {
    clock: { now: () => unixMilliseconds(10) },
    ids: { next: () => "sync-id" },
    models: config.runtime.content,
    target,
    write: (message) => messages.push(message),
  };
  return { input, messages, target };
}

test("prints the plan before guarded apply and check never mutates", async () => {
  const value = fixture();
  expect(await runLocalContentSync({ ...value.input, check: true })).toBe(1);
  expect(value.messages[0]).toContain("create home");
  expect(value.target.applyConfigurationSynchronization).not.toHaveBeenCalled();
  expect(await runLocalContentSync({ ...value.input, check: false })).toBe(0);
  expect(value.target.applyConfigurationSynchronization).toHaveBeenCalledOnce();
  expect(value.messages.at(-1)).toBe("Synchronization applied.");
});

test("invalid and stale plans report recovery without a successful apply", async () => {
  const value = fixture([
    {
      key: "home",
      kind: "page",
      version: 2,
      structureHash: "old",
      projectionHash: "old",
      entryCount: 1,
      draftSnapshotCount: 1,
      publishedSnapshotCount: 0,
    },
  ]);
  expect(await runLocalContentSync({ ...value.input, check: false })).toBe(1);
  expect(value.messages.join("\n")).toContain("VERSION_REGRESSION");
  expect(value.target.applyConfigurationSynchronization).not.toHaveBeenCalled();

  const stale = fixture();
  stale.target.applyConfigurationSynchronization.mockRejectedValueOnce(new Error("plan is stale"));
  expect(await runLocalContentSync({ ...stale.input, check: false })).toBe(1);
  expect(stale.messages.at(-1)).toContain("Rerun pnpm content:sync");
});

test("local flow syncs migrated SQLite once, changes safely, and preserves blocked or check state", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lace-local-sync-"));
  try {
    const path = join(directory, "lace.sqlite");
    migrateNodeDatabase(path);
    const database = openNodeDatabase(path);
    try {
      const repository = new NodeContentRepository(database.connection, () => undefined);
      let nextId = 0;
      const common = {
        clock: { now: () => unixMilliseconds(10) },
        ids: { next: () => `entry-${++nextId}` },
        target: repository,
        write: () => undefined,
      };
      const initial = await defineConfig({
        content: [
          definePage({ key: "home", path: "/", version: 1 }),
          defineCollection({ key: "posts", route: "/blog/:slug", version: 1 }),
        ],
      });
      const first = { ...common, models: initial.runtime.content };
      expect(await runLocalContentSync({ ...first, check: true })).toBe(1);
      expect(await repository.readConfigurationSyncState()).toEqual([]);
      expect(await runLocalContentSync({ ...first, check: false })).toBe(0);
      expect(await repository.readConfigurationSyncState()).toMatchObject([
        { key: "home", entryCount: 1, draftSnapshotCount: 1 },
        { key: "posts", entryCount: 0 },
      ]);
      expect(
        database.connection.prepare("select count(*) as count from content_entries").get(),
      ).toEqual({ count: 1 });
      expect(await runLocalContentSync({ ...first, check: false })).toBe(0);
      expect(database.connection.prepare("select version from published_state").get()).toEqual({
        version: 1,
      });
      expect(
        database.connection.prepare("select count(*) as count from outbox_events").get(),
      ).toEqual({ count: 1 });

      const changed = await defineConfig({
        content: [
          definePage({ key: "home", path: "/", version: 1 }),
          defineCollection({ key: "posts", label: "Articles", route: "/blog/:slug", version: 1 }),
        ],
      });
      const update = { ...common, models: changed.runtime.content };
      expect(await runLocalContentSync({ ...update, check: true })).toBe(1);
      expect(database.connection.prepare("select version from published_state").get()).toEqual({
        version: 1,
      });
      expect(await runLocalContentSync({ ...update, check: false })).toBe(0);
      expect(database.connection.prepare("select version from published_state").get()).toEqual({
        version: 2,
      });
      expect(
        database.connection.prepare("select count(*) as count from outbox_events").get(),
      ).toEqual({ count: 1 });

      const unsafe = await defineConfig({
        content: [
          defineCollection({ key: "home", route: "/home/:slug", version: 2 }),
          defineCollection({ key: "posts", label: "Articles", route: "/blog/:slug", version: 1 }),
        ],
      });
      expect(
        await runLocalContentSync({ ...common, check: false, models: unsafe.runtime.content }),
      ).toBe(1);
      expect(database.connection.prepare("select version from published_state").get()).toEqual({
        version: 2,
      });
      expect(
        database.connection.prepare("select count(*) as count from content_entries").get(),
      ).toEqual({ count: 1 });
      expect(
        database.connection.prepare("select count(*) as count from outbox_events").get(),
      ).toEqual({ count: 1 });
    } finally {
      database.connection.close();
    }
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("the checked-in project configuration creates editable page drafts", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lace-project-sync-"));
  try {
    const path = join(directory, "lace.sqlite");
    migrateNodeDatabase(path);
    const database = openNodeDatabase(path);
    try {
      const repository = new NodeContentRepository(database.connection, () => undefined);
      const project = await loadProjectConfig();
      let nextId = 0;
      expect(
        await runLocalContentSync({
          check: false,
          clock: { now: () => unixMilliseconds(10) },
          ids: { next: () => `project-${++nextId}` },
          models: project.runtime.content,
          target: repository,
          write: () => undefined,
        }),
      ).toBe(0);
      expect(await repository.readConfigurationSyncState()).toMatchObject([
        { key: "about", entryCount: 1, draftSnapshotCount: 1 },
        { key: "home", entryCount: 1, draftSnapshotCount: 1 },
        { key: "notes", entryCount: 0 },
        { key: "posts", entryCount: 0 },
      ]);
    } finally {
      database.connection.close();
    }
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});
