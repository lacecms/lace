// @ts-nocheck
// TODO(rf2): Type legacy model evidence, partial synchronization ports and detached plan fixtures.
import { expect, test } from "vitest";
import {
  checkConfigurationSynchronization,
  contentSyncActor,
  createConfigurationSyncSingletonEntry,
  applyPreparedConfigurationSynchronization,
  planConfigurationSynchronization,
  renderConfigurationSyncPlanJson,
  renderConfigurationSyncPlanText,
  reportConfigurationSynchronization,
  prepareConfigurationSynchronization,
} from "../index.js";
import { defineCollection, defineConfig, defineGlobal, definePage } from "@lacecms/config";
import { field } from "@lacecms/content";

function model(overrides = {}) {
  return {
    key: "posts",
    kind: "collection",
    projectionHash: "projection-a",
    structureHash: "structure-a",
    version: 1,
    ...overrides,
  };
}

function stored(overrides = {}) {
  return {
    draftSnapshotCount: 0,
    entryCount: 0,
    key: "posts",
    kind: "collection",
    projectionHash: "projection-a",
    publishedSnapshotCount: 0,
    structureHash: "structure-a",
    version: 1,
    ...overrides,
  };
}

test("plans creates, no-ops, display changes, and compatible version updates", () => {
  const created = planConfigurationSynchronization({ models: [model()], storedModels: [] });
  expect(created).toMatchObject({
    diagnostics: [],
    isValid: true,
    operations: [{ action: "create", model: { key: "posts" } }],
    requiresApply: true,
  });

  const unchanged = planConfigurationSynchronization({
    models: [model()],
    storedModels: [stored()],
  });
  expect(unchanged).toMatchObject({ diagnostics: [], isValid: true, operations: [] });
  expect(checkConfigurationSynchronization(unchanged).exitCode).toBe(0);

  const display = planConfigurationSynchronization({
    models: [model({ projectionHash: "projection-b" })],
    storedModels: [stored()],
  });
  expect(display.operations).toMatchObject([{ action: "label-update", model: { key: "posts" } }]);

  const version = planConfigurationSynchronization({
    models: [model({ structureHash: "structure-b", version: 2 })],
    storedModels: [stored()],
  });
  expect(version.operations).toMatchObject([{ action: "version-update", model: { version: 2 } }]);
});

test("rejects kind changes, version regressions, and unversioned structure changes", () => {
  for (const candidate of [
    model({ kind: "page" }),
    model({ version: 0 }),
    model({ structureHash: "structure-b" }),
  ]) {
    const plan = planConfigurationSynchronization({
      models: [candidate],
      storedModels: [stored()],
    });
    expect(plan.isValid).toBe(false);
    expect(plan.requiresApply).toBe(false);
    expect(plan.operations).toMatchObject([
      { action: "incompatible-change", model: { key: "posts" } },
    ]);
  }
});

test("requires explicit safe renames and protects stored entries and snapshots", () => {
  const renamed = planConfigurationSynchronization({
    models: [model({ key: "articles", renamedFrom: "posts" })],
    storedModels: [stored({ entryCount: 1 })],
  });
  expect(renamed).toMatchObject({
    diagnostics: [],
    isValid: true,
    operations: [{ action: "rename", model: { key: "articles" }, renamedFrom: "posts" }],
  });

  const replacement = planConfigurationSynchronization({
    models: [model({ key: "articles" })],
    storedModels: [stored({ entryCount: 1 })],
  });
  expect(replacement).toMatchObject({
    isValid: false,
    operations: [
      { action: "create", model: { key: "articles" } },
      { action: "blocked-removal", model: { key: "posts" } },
    ],
  });

  const emptyRemoval = planConfigurationSynchronization({ models: [], storedModels: [stored()] });
  expect(emptyRemoval).toMatchObject({
    diagnostics: [],
    isValid: true,
    operations: [{ action: "remove", model: { key: "posts" } }],
  });

  const snapshotChange = planConfigurationSynchronization({
    models: [model({ structureHash: "structure-b", version: 2 })],
    storedModels: [stored({ draftSnapshotCount: 1, publishedSnapshotCount: 2 })],
  });
  expect(snapshotChange).toMatchObject({
    isValid: false,
    operations: [{ action: "incompatible-change", model: { key: "posts" } }],
  });
  expect(snapshotChange.diagnostics[0].message).toContain("draft=1, published=2");
});

test("refuses kind changes involving globals and blocks removing a synchronized global", () => {
  for (const [configured, storedKind] of [
    ["global", "page"],
    ["page", "global"],
    ["collection", "global"],
    ["global", "collection"],
  ]) {
    const plan = planConfigurationSynchronization({
      models: [model({ key: "settings", kind: configured })],
      storedModels: [stored({ entryCount: 1, key: "settings", kind: storedKind })],
    });
    expect(plan.isValid).toBe(false);
    expect(plan.operations).toMatchObject([
      { action: "incompatible-change", model: { key: "settings" } },
    ]);
    expect(plan.diagnostics[0].code).toBe("MODEL_KIND_CHANGED");
  }
  const renamed = planConfigurationSynchronization({
    models: [model({ key: "settings", kind: "global", renamedFrom: "posts" })],
    storedModels: [stored({ entryCount: 1 })],
  });
  expect(renamed).toMatchObject({
    isValid: false,
    diagnostics: [{ code: "RENAME_KIND_CHANGED" }],
  });
  const removed = planConfigurationSynchronization({
    models: [],
    storedModels: [stored({ entryCount: 1, key: "settings", kind: "global" })],
  });
  expect(removed).toMatchObject({
    isValid: false,
    operations: [{ action: "blocked-removal", model: { key: "settings" } }],
  });
});

test("materializes a global singleton entry for a created global", async () => {
  const settings = {
    ...defineGlobal({
      fields: { siteName: field.text({ defaultValue: "Lace" }) },
      key: "settings",
      label: "Site settings",
      version: 1,
    }),
    projectionHash: "projection-settings",
    structureHash: "structure-settings",
  };
  const entry = createConfigurationSyncSingletonEntry({
    appliedAt: 1,
    entryId: "entry-settings",
    model: settings,
    snapshotId: "snapshot-settings",
  });
  expect(entry.entry.model).toEqual({ key: "settings", kind: "global" });
  expect(entry.entry.draft).toMatchObject({
    blocks: [],
    fields: { siteName: "Lace" },
    title: "Site settings",
  });
  expect(entry.entry.draft).not.toHaveProperty("slug");
  const prepared = await prepareConfigurationSynchronization({
    models: [settings],
    state: {
      async readConfigurationSyncState() {
        return [];
      },
    },
  });
  let received;
  await applyPreparedConfigurationSynchronization({
    clock: { now: () => 1 },
    ids: {
      next: (() => {
        let id = 0;
        return () => `id-${++id}`;
      })(),
    },
    models: [settings],
    prepared,
    target: {
      async applyConfigurationSynchronization(input) {
        received = input;
        return { operations: input.plan.operations, status: "applied", targetVersion: 1 };
      },
    },
  });
  expect(received.singletonEntries.map((item) => item.modelKey)).toEqual(["settings"]);
  expect(() =>
    createConfigurationSyncSingletonEntry({
      appliedAt: 1,
      entryId: "entry-posts",
      model: {
        ...defineCollection({ key: "posts", route: "/p/:slug", version: 1 }),
        projectionHash: "p",
        structureHash: "s",
      },
      snapshotId: "snapshot-posts",
    }),
  ).toThrow(/page and global/u);
});

test("rejects duplicate and ambiguous synchronization identity evidence", () => {
  const duplicateStored = planConfigurationSynchronization({
    models: [],
    storedModels: [stored(), stored({ projectionHash: "projection-b" })],
  });
  expect(duplicateStored).toMatchObject({
    isValid: false,
    diagnostics: [{ code: "DUPLICATE_STORED_MODEL", modelKey: "posts" }],
  });

  const missingRename = planConfigurationSynchronization({
    models: [model({ key: "articles", renamedFrom: "missing" })],
    storedModels: [],
  });
  expect(missingRename).toMatchObject({
    isValid: false,
    diagnostics: [{ code: "RENAME_SOURCE_MISSING", relatedModelKey: "missing" }],
  });

  const configuredRenameSource = planConfigurationSynchronization({
    models: [model(), model({ key: "articles", renamedFrom: "posts" })],
    storedModels: [stored()],
  });
  expect(configuredRenameSource).toMatchObject({
    isValid: false,
    diagnostics: [{ code: "RENAME_SOURCE_STILL_CONFIGURED", modelKey: "articles" }],
  });
});

test("renders canonical deterministic reports and check outcomes", () => {
  const input = {
    models: [model({ key: "zebra" }), model({ key: "articles" })],
    storedModels: [stored({ key: "zebra" }), stored({ key: "articles" })],
  };
  const first = planConfigurationSynchronization(input);
  const second = planConfigurationSynchronization({
    models: [...input.models].reverse(),
    storedModels: [...input.storedModels].reverse(),
  });
  expect(renderConfigurationSyncPlanJson(first)).toBe(renderConfigurationSyncPlanJson(second));
  expect(renderConfigurationSyncPlanText(first)).toContain("Apply required: no");
  expect(reportConfigurationSynchronization(first).check.exitCode).toBe(0);

  const pending = planConfigurationSynchronization({ models: [model()], storedModels: [] });
  expect(checkConfigurationSynchronization(pending).exitCode).toBe(1);
});

test("reordering configured models does not change synchronization classification", async () => {
  const page = definePage({ key: "home", path: "/", version: 1, blocks: [] });
  const collection = defineCollection({
    key: "posts",
    route: "/blog/:slug",
    version: 1,
    blocks: [],
  });
  const before = await defineConfig({ content: [collection, page] });
  const after = await defineConfig({ content: [page, collection] });
  const storedModels = before.runtime.content.map((item) =>
    stored({
      key: item.key,
      kind: item.kind,
      version: item.version,
      projectionHash: item.projectionHash,
      structureHash: item.structureHash,
    }),
  );
  expect(planConfigurationSynchronization({ models: after.runtime.content, storedModels })).toEqual(
    planConfigurationSynchronization({ models: before.runtime.content, storedModels }),
  );
});

test("prepares a detached dry run and materializes page defaults only for apply", async () => {
  const page = {
    ...definePage({
      fields: {
        greeting: field.text({ defaultValue: "Hello" }),
        required: field.text({ required: true }),
      },
      key: "home",
      path: "/",
      version: 1,
    }),
    projectionHash: "projection-home",
    structureHash: "structure-home",
  };
  const state = {
    async readConfigurationSyncState() {
      return [];
    },
  };
  const prepared = await prepareConfigurationSynchronization({ models: [page], state });
  expect(prepared.report.check.exitCode).toBe(1);
  expect(prepared.storedModels).toEqual([]);
  const pageEntry = createConfigurationSyncSingletonEntry({
    appliedAt: 1,
    entryId: "entry-home",
    model: page,
    snapshotId: "snapshot-home",
  });
  expect(pageEntry.entry.draft).toMatchObject({
    blocks: [],
    fields: { greeting: "Hello" },
    title: "home",
    updatedBy: contentSyncActor,
  });

  let received;
  await applyPreparedConfigurationSynchronization({
    clock: { now: () => 1 },
    ids: {
      next: (() => {
        let id = 0;
        return () => `id-${++id}`;
      })(),
    },
    models: [page],
    prepared,
    target: {
      async applyConfigurationSynchronization(input) {
        received = input;
        return { operations: input.plan.operations, status: "applied", targetVersion: 1 };
      },
    },
  });
  expect(received.singletonEntries[0].entry.draft.fields).toEqual({ greeting: "Hello" });
});

test("plans a list-field change as a projection-only label update", async () => {
  const collection = (listFields) =>
    defineCollection({
      fields: { author: field.text() },
      key: "posts",
      ...(listFields === undefined ? {} : { listFields }),
      route: "/blog/:slug",
      version: 1,
    });
  const [before, after] = await Promise.all([
    defineConfig({ content: [collection()] }),
    defineConfig({ content: [collection(["author"])] }),
  ]);
  const storedModel = before.content[0];
  const plan = planConfigurationSynchronization({
    models: after.content,
    storedModels: [
      {
        draftSnapshotCount: 3,
        entryCount: 3,
        key: storedModel.key,
        kind: storedModel.kind,
        projectionHash: storedModel.projectionHash,
        publishedSnapshotCount: 2,
        structureHash: storedModel.structureHash,
        version: storedModel.version,
      },
    ],
  });
  expect(plan.isValid).toBe(true);
  expect(plan.operations).toMatchObject([{ action: "label-update", model: { key: "posts" } }]);
});
