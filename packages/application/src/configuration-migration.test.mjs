import { expect, test } from "vitest";
import { defineCollection, defineConfig } from "@lacecms/config";
import { builtInBlocks, defineBlock, field } from "@lacecms/content";
import {
  applyPreparedConfigurationSynchronization,
  planConfigurationSynchronization,
  planEntryMigration,
  prepareConfigurationSynchronization,
  renderConfigurationSyncPlanJson,
} from "../dist/index.js";

const noteV1 = defineBlock({
  fields: { body: field.text({ required: true }), image: field.media() },
  type: "note",
  version: 1,
});

function noteV3(migrations = {}) {
  return defineBlock({
    fields: {
      cover: field.media(),
      text: field.text({ maxLength: 20, required: true }),
    },
    migrations: {
      2: ({ data: { body, image, ...rest } }) => ({
        data: {
          ...rest,
          ...(image === undefined ? {} : { cover: image }),
          ...(body === undefined ? {} : { quote: body }),
        },
      }),
      3: ({ data: { quote, ...rest } }) => ({
        data: quote === undefined ? rest : { ...rest, text: quote },
      }),
      ...migrations,
    },
    type: "note",
    version: 3,
  });
}

async function config(block, version) {
  return defineConfig({
    blocks: [block],
    content: [
      defineCollection({
        blocks: ["note"],
        fields: { summary: field.text() },
        key: "posts",
        route: "/blog/:slug",
        version,
      }),
    ],
  });
}

function block(key, data, schemaVersion = 1, envelope = {}) {
  return {
    data,
    hidden: false,
    key,
    position: Number(key.slice(1)),
    schemaVersion,
    settings: {},
    type: "note",
    ...envelope,
  };
}

function snap(id, state, revision, blocks, references = []) {
  return { blocks, fields: {}, references, revision, snapshotId: id, state, title: `Title ${id}` };
}

/** In-memory synchronization store with guarded block-migration writes. */
function store(baseline, entries, options = {}) {
  const writes = [];
  const finals = [];
  let unitsWritten = 0;
  const snapshots = () =>
    entries
      .flatMap((entry) =>
        [entry.draft, entry.published].filter(Boolean).map((snapshot) => ({ entry, snapshot })),
      )
      .sort((left, right) => left.snapshot.snapshotId.localeCompare(right.snapshot.snapshotId));
  const fingerprint = () =>
    snapshots()
      .map(
        ({ snapshot }) => `${snapshot.snapshotId}:${snapshot.revision}:${snapshot.updatedAt ?? 0}`,
      )
      .join(",");
  return {
    entries,
    finals,
    writes,
    async readConfigurationSyncState() {
      return [
        {
          draftSnapshotCount: entries.filter((entry) => entry.draft).length,
          entryCount: entries.length,
          key: baseline.key,
          kind: baseline.kind,
          projectionHash: baseline.projectionHash,
          publishedSnapshotCount: entries.filter((entry) => entry.published).length,
          snapshotFingerprint: fingerprint(),
          structure: baseline.structure,
          structureHash: baseline.structureHash,
          version: baseline.version,
        },
      ];
    },
    async readConfigurationSyncSnapshots() {
      return {
        items: snapshots().map(({ entry, snapshot }) => ({
          blocks: snapshot.blocks.map(({ key, schemaVersion, type, data, settings, hidden }) => ({
            data,
            settings,
            hidden,
            key,
            schemaVersion,
            type,
          })),
          entryId: entry.entryId,
          fields: snapshot.fields,
          references: snapshot.references,
          revision: snapshot.revision,
          snapshotId: snapshot.snapshotId,
          state: snapshot.state,
          title: snapshot.title,
        })),
      };
    },
    async readConfigurationSyncMigrationEntries({ after, limit, targets }) {
      const stale = (snapshot) =>
        snapshot?.blocks.some((value) =>
          targets.some(
            (target) => target.type === value.type && target.version !== value.schemaVersion,
          ),
        );
      const matching = entries
        .filter(
          (entry) =>
            entry.entryId > (after ?? "") && (stale(entry.draft) || stale(entry.published)),
        )
        .sort((left, right) => left.entryId.localeCompare(right.entryId));
      const items = matching.slice(0, limit).map((entry) => structuredClone(entry));
      return matching.length > limit ? { items, next: items.at(-1).entryId } : { items };
    },
    async applyConfigurationSyncBlockMigrations(input) {
      writes.push(input);
      const counts = { blocks: 0, drafts: 0, published: 0 };
      for (const unit of input.units) {
        if (options.failAfterUnits !== undefined && unitsWritten >= options.failAfterUnits) {
          throw new Error("Injected failure; the synchronization plan is stale.");
        }
        const entry = entries.find((value) => value.entryId === unit.entryId);
        for (const migration of unit.snapshots) {
          const snapshot = entry[migration.state];
          if (snapshot.revision !== migration.expectedRevision) {
            throw new Error("Block migration guard failed; the synchronization plan is stale.");
          }
          for (const migrated of migration.blocks) {
            const stored = snapshot.blocks.find((value) => value.key === migrated.key);
            stored.data = migrated.data;
            stored.schemaVersion = migrated.schemaVersion;
            stored.settings = migrated.settings;
          }
          const keys = new Set(migration.blocks.map((value) => value.key));
          snapshot.references = [
            ...snapshot.references.filter((reference) => !keys.has(reference.sourceKey)),
            ...migration.references,
          ];
          snapshot.revision = migration.revision;
          snapshot.updatedAt = input.migratedAt;
          if (migration.updatedBy !== undefined) snapshot.updatedBy = migration.updatedBy;
          counts.blocks += migration.blocks.length;
          counts[migration.state === "draft" ? "drafts" : "published"] += 1;
        }
        unitsWritten += 1;
      }
      return counts;
    },
    async applyConfigurationSynchronization(input) {
      finals.push(input);
      return { operations: input.plan.operations, status: "applied", targetVersion: 2 };
    },
  };
}

function seed() {
  return [
    {
      draft: snap("d1", "draft", 1, [block("b1", { body: "draft only" })]),
      entryId: "e1",
    },
    {
      draft: snap(
        "d2",
        "draft",
        3,
        [block("b1", { body: "same", image: "m1" }), block("b2", {}, 3)],
        [{ fieldPath: "image", mediaId: "m1", sourceKey: "b1" }],
      ),
      entryId: "e2",
      published: snap(
        "p2",
        "published",
        3,
        [block("b1", { body: "same", image: "m1" }), block("b2", {}, 3)],
        [{ fieldPath: "image", mediaId: "m1", sourceKey: "b1" }],
      ),
    },
    {
      draft: snap("d3", "draft", 5, [block("b1", { body: "newer draft" }, 2)]),
      entryId: "e3",
      published: snap("p3", "published", 4, [block("b1", { body: "older" })]),
    },
  ].map((entry) => {
    for (const snapshot of [entry.draft, entry.published].filter(Boolean)) {
      snapshot.blocks = snapshot.blocks.map((value) =>
        value.schemaVersion === 2 ? { ...value, data: { quote: value.data.body } } : value,
      );
    }
    return entry;
  });
}

test("plans entry migrations with the revision rule and published snapshots first", () => {
  const definitions = new Map([["note", noteV3()]]);
  const [draftOnly, inSync, changed] = seed();

  expect(planEntryMigration(draftOnly, definitions, "system:content-sync").unit).toEqual({
    entryId: "e1",
    snapshots: [
      {
        blocks: [
          {
            data: { text: "draft only" },
            expectedSchemaVersion: 1,
            key: "b1",
            schemaVersion: 3,
            settings: {},
          },
        ],
        expectedRevision: 1,
        references: [],
        revision: 2,
        snapshotId: "d1",
        state: "draft",
        updatedBy: "system:content-sync",
      },
    ],
  });

  const synced = planEntryMigration(inSync, definitions, "system:content-sync").unit;
  expect(synced.snapshots.map((value) => [value.state, value.revision])).toEqual([
    ["published", 4],
    ["draft", 4],
  ]);
  expect(synced.snapshots[0]).toMatchObject({
    draftGuard: { revision: 3, snapshotId: "d2" },
    references: [{ fieldPath: "cover", mediaId: "m1", sourceKey: "b1" }],
  });
  expect(synced.snapshots[0].blocks.map((value) => value.key)).toEqual(["b1"]);
  expect(synced.snapshots[0]).not.toHaveProperty("updatedBy");

  const diverged = planEntryMigration(changed, definitions, "system:content-sync");
  expect(diverged.unit.snapshots.map((value) => [value.state, value.revision])).toEqual([
    ["published", 4],
    ["draft", 6],
  ]);
  expect(diverged.unit.snapshots[0]).not.toHaveProperty("draftGuard");
  expect(diverged.unit.snapshots[1].blocks[0]).toMatchObject({
    data: { text: "newer draft" },
    expectedSchemaVersion: 2,
  });
  expect(diverged.blocks).toEqual([
    { fromVersion: 1, state: "published", type: "note" },
    { fromVersion: 2, state: "draft", type: "note" },
  ]);
});

test("validates migrated drafts and published snapshots in their own modes", () => {
  const definitions = new Map([["note", noteV3()]]);
  const draft = planEntryMigration(
    { draft: snap("d", "draft", 1, [block("b1", {})]), entryId: "e" },
    definitions,
    "system:content-sync",
  );
  expect(draft.findings).toEqual([]);
  expect(draft.unit.snapshots[0].blocks[0].data).toEqual({});

  const published = planEntryMigration(
    { entryId: "e", published: snap("p", "published", 1, [block("b1", {})]) },
    definitions,
    "system:content-sync",
  );
  expect(published.unit).toBeUndefined();
  expect(published.findings).toEqual([
    {
      kind: "invalid",
      reference: {
        blockKey: "b1",
        entryId: "e",
        path: "data.text",
        reason: "missing_required_field",
        schemaVersion: 1,
        state: "published",
        title: "Title p",
      },
      type: "note",
    },
  ]);

  const foreign = planEntryMigration(
    {
      draft: snap("d", "draft", 1, [block("b1", { body: "x", image: "unknown" })]),
      entryId: "e",
    },
    definitions,
    "system:content-sync",
  );
  expect(foreign.findings).toMatchObject([
    {
      kind: "invalid",
      reference: { path: "data.cover", reason: "media_not_previously_referenced" },
    },
  ]);

  const references = Array.from({ length: 200 }, (_, index) => ({
    fieldPath: "image",
    mediaId: "m1",
    sourceKey: `x${index}`,
  }));
  const crowded = planEntryMigration(
    {
      draft: snap("d", "draft", 1, [block("b1", { body: "x", image: "m1" })], references),
      entryId: "e",
    },
    definitions,
    "system:content-sync",
  );
  expect(crowded.findings).toMatchObject([
    { kind: "invalid", reference: { reason: "media references would exceed 200" } },
  ]);
});

test("validates hidden published blocks in draft mode and migrates settings", () => {
  const definitions = new Map([["note", noteV3()]]);
  const hidden = planEntryMigration(
    {
      entryId: "e",
      published: snap("p", "published", 1, [block("b1", {}, 1, { anchor: "a", hidden: true })]),
    },
    definitions,
    "system:content-sync",
  );
  expect(hidden.findings).toEqual([]);
  expect(hidden.unit.snapshots[0].blocks[0]).toMatchObject({ data: {}, settings: {} });

  const themed = (migration) =>
    new Map([
      [
        "note",
        defineBlock({
          fields: { text: field.text() },
          migrations: { 2: migration },
          settings: {
            align: field.select({ defaultValue: "left", options: ["left", "center"] }),
            theme: field.text({ defaultValue: "light" }),
          },
          type: "note",
          version: 2,
        }),
      ],
    ]);
  const stored = block("b1", { text: "x" }, 1, { settings: { tone: "dark" } });
  const renamed = planEntryMigration(
    { draft: snap("d", "draft", 1, [stored]), entryId: "e" },
    themed(({ data, settings: { tone, ...rest } }) => ({
      data,
      settings: { ...rest, theme: tone },
    })),
    "system:content-sync",
  );
  expect(renamed.findings).toEqual([]);
  // New settings receive their declared defaults.
  expect(renamed.unit.snapshots[0].blocks[0].settings).toEqual({ align: "left", theme: "dark" });

  const kept = planEntryMigration(
    { draft: snap("d", "draft", 1, [stored]), entryId: "e" },
    themed((value) => value),
    "system:content-sync",
  );
  expect(kept.findings).toMatchObject([
    { kind: "invalid", reference: { path: "settings.tone", reason: "unknown_field" } },
  ]);

  const bare = planEntryMigration(
    { draft: snap("d", "draft", 1, [stored]), entryId: "e" },
    themed(({ data }) => data),
    "system:content-sync",
  );
  expect(bare.findings).toMatchObject([{ kind: "invalid", type: "note" }]);
});

test("refuses failed, missing and ahead migrations and plans valid ones from evidence", async () => {
  const baseline = (await config(noteV1, 1)).runtime.content[0];
  const target = await config(noteV3(), 2);
  const model = target.runtime.content[0];
  const state = store(baseline, seed());

  const prepared = await prepareConfigurationSynchronization({
    blocks: target.runtime.blocks,
    models: [model],
    state,
  });
  expect(prepared.plan.isValid).toBe(true);
  expect(prepared.plan.operations[0].evolution.migrations).toEqual([
    {
      blockType: "note",
      blocks: 5,
      draft: 3,
      fromVersions: [1, 2],
      published: 2,
      toVersion: 3,
    },
  ]);
  expect(prepared.report.text).toContain(
    "migration block-definition-changed block note (version 1,2 -> 3; affected: draft=3, published=2)",
  );
  expect(prepared.report.text).toContain(
    "planned block migrations: note 1,2 -> 3 (draft=3, published=2, blocks=5)",
  );
  const replanned = planConfigurationSynchronization({
    evidence: prepared.evidence,
    models: [model],
    storedModels: prepared.storedModels,
  });
  expect(renderConfigurationSyncPlanJson(replanned)).toBe(
    renderConfigurationSyncPlanJson(prepared.plan),
  );
  await expect(prepareConfigurationSynchronization({ models: [model], state })).rejects.toThrow(
    "block registry is required",
  );

  const throwing = await config(
    noteV3({
      3: () => {
        throw new Error("boom");
      },
    }),
    2,
  );
  const failed = await prepareConfigurationSynchronization({
    blocks: throwing.runtime.blocks,
    models: [throwing.runtime.content[0]],
    state,
  });
  expect(failed.plan.diagnostics).toMatchObject([
    {
      affectedCount: 5,
      blockType: "note",
      changeClass: "migration",
      code: "BLOCK_MIGRATION_FAILED",
    },
  ]);
  expect(failed.report.text).toContain(
    'draft e1 "Title d1" block b1 v1: Block note migration to version 3 threw. boom',
  );

  const onlyThree = defineBlock({
    fields: noteV3().fields,
    migrations: { 3: (value) => value },
    type: "note",
    version: 3,
  });
  const missingConfig = await config(onlyThree, 2);
  const missing = await prepareConfigurationSynchronization({
    blocks: missingConfig.runtime.blocks,
    models: [missingConfig.runtime.content[0]],
    state,
  });
  expect(missing.plan.diagnostics.map((value) => value.code)).toEqual([
    "BLOCK_MIGRATION_INVALID",
    "BLOCK_MIGRATION_MISSING",
  ]);

  const v2 = defineBlock({
    fields: { quote: field.text() },
    migrations: { 2: ({ data: { body, ...rest } }) => ({ data: { ...rest, quote: body } }) },
    type: "note",
    version: 2,
  });
  const ahead = store(baseline, [
    { draft: snap("d9", "draft", 1, [block("b1", { text: "x" }, 3)]), entryId: "e9" },
  ]);
  const downgrade = await config(v2, 2);
  const refused = await prepareConfigurationSynchronization({
    blocks: downgrade.runtime.blocks,
    models: [downgrade.runtime.content[0]],
    state: ahead,
  });
  expect(refused.plan.diagnostics).toMatchObject([
    { code: "BLOCK_VERSION_AHEAD", affectedCount: 1 },
  ]);

  const sameVersion = defineBlock({ fields: { other: field.text() }, type: "note", version: 1 });
  const unversioned = await config(sameVersion, 2);
  const blocked = await prepareConfigurationSynchronization({
    blocks: unversioned.runtime.blocks,
    models: [unversioned.runtime.content[0]],
    state,
  });
  expect(blocked.plan.diagnostics).toMatchObject([{ code: "BLOCK_DEFINITION_CHANGE_HAS_BLOCKS" }]);
  expect(blocked.plan.diagnostics[0].message).toContain(
    "Increase the block version and declare migrations.",
  );
});

test("migrates in units, re-prepares, and resumes after an interruption", async () => {
  const baseline = (await config(noteV1, 1)).runtime.content[0];
  const target = await config(noteV3(), 2);
  const model = target.runtime.content[0];
  const clock = { now: () => 500 };
  const ids = { next: () => "id" };

  const interrupted = store(baseline, seed(), { failAfterUnits: 1 });
  const prepared = await prepareConfigurationSynchronization({
    blocks: target.runtime.blocks,
    models: [model],
    state: interrupted,
  });
  await expect(
    applyPreparedConfigurationSynchronization({
      blocks: target.runtime.blocks,
      clock,
      ids,
      models: [model],
      prepared,
      target: interrupted,
    }),
  ).rejects.toThrow("stale");
  expect(interrupted.finals).toEqual([]);
  expect(interrupted.entries[0].draft.blocks[0].schemaVersion).toBe(3);
  expect(interrupted.entries[1].draft.blocks[0].schemaVersion).toBe(1);

  const resumed = store(baseline, interrupted.entries);
  const rerun = await applyPreparedConfigurationSynchronization({
    blocks: target.runtime.blocks,
    clock,
    ids,
    models: [model],
    prepared: await prepareConfigurationSynchronization({
      blocks: target.runtime.blocks,
      models: [model],
      state: resumed,
    }),
    target: resumed,
  });
  expect(rerun).toMatchObject({
    migrated: { blocks: 4, drafts: 2, published: 2 },
    status: "applied",
  });
  expect(resumed.finals).toHaveLength(1);
  expect(resumed.finals[0].plan.operations[0].evolution).not.toHaveProperty("migrations");

  const clean = store(baseline, seed());
  await applyPreparedConfigurationSynchronization({
    blocks: target.runtime.blocks,
    clock,
    ids,
    models: [model],
    prepared: await prepareConfigurationSynchronization({
      blocks: target.runtime.blocks,
      models: [model],
      state: clean,
    }),
    target: clean,
  });
  expect(resumed.entries).toEqual(clean.entries);
  expect(clean.entries.map((entry) => [entry.draft.revision, entry.published?.revision])).toEqual([
    [2, undefined],
    [4, 4],
    [6, 4],
  ]);
  expect(clean.entries[1].published.references).toEqual([
    { fieldPath: "cover", mediaId: "m1", sourceKey: "b1" },
  ]);
});

test("stops before the final mutation when the reviewed plan changed", async () => {
  const baseline = (await config(noteV1, 1)).runtime.content[0];
  const target = await config(noteV3(), 2);
  const model = target.runtime.content[0];
  const state = store(baseline, seed());
  const prepared = await prepareConfigurationSynchronization({
    blocks: target.runtime.blocks,
    models: [model],
    state,
  });
  state.entries.push({
    draft: snap("d4", "draft", 1, [block("b1", { body: "x" }, 2)]),
    entryId: "e4",
  });
  state.entries[3].draft.blocks[0].data = { quote: "late" };
  await expect(
    applyPreparedConfigurationSynchronization({
      blocks: target.runtime.blocks,
      clock: { now: () => 1 },
      ids: { next: () => "id" },
      models: [model],
      prepared,
      target: state,
    }),
  ).rejects.toThrow("stale after block migration");
  expect(state.finals).toEqual([]);
});

test("migrates version 1 built-in image blocks to version 2 without changing their data", async () => {
  const imageV1 = defineBlock({
    fields: {
      alt: field.text({ required: true }),
      caption: field.text(),
      media: field.media({ required: true }),
    },
    type: "image",
    version: 1,
  });
  const imageConfig = (definition, version) =>
    defineConfig({
      blocks: [definition],
      content: [
        defineCollection({ blocks: ["image"], key: "posts", route: "/blog/:slug", version }),
      ],
    });
  const baseline = (await imageConfig(imageV1, 1)).runtime.content[0];
  const target = await imageConfig(builtInBlocks.image, 2);
  const model = target.runtime.content[0];
  const data = { alt: "A lake", caption: "Morning", media: "m1" };
  const image = () => ({
    data: { ...data },
    hidden: false,
    key: "b1",
    position: 0,
    settings: {},
    schemaVersion: 1,
    type: "image",
  });
  const references = [{ fieldPath: "media", mediaId: "m1", sourceKey: "b1" }];
  const state = store(baseline, [
    {
      draft: snap("d1", "draft", 2, [image()], references),
      entryId: "e1",
      published: snap("p1", "published", 2, [image()], references),
    },
  ]);

  const prepared = await prepareConfigurationSynchronization({
    blocks: target.runtime.blocks,
    models: [model],
    state,
  });
  expect(prepared.plan.isValid).toBe(true);
  expect(prepared.plan.operations[0].evolution.migrations).toEqual([
    { blockType: "image", blocks: 2, draft: 1, fromVersions: [1], published: 1, toVersion: 2 },
  ]);
  await applyPreparedConfigurationSynchronization({
    blocks: target.runtime.blocks,
    clock: { now: () => 500 },
    ids: { next: () => "id" },
    models: [model],
    prepared,
    target: state,
  });
  for (const snapshot of [state.entries[0].draft, state.entries[0].published]) {
    expect(snapshot.blocks).toEqual([{ ...image(), schemaVersion: 2 }]);
    expect(snapshot.references).toEqual(references);
  }
  expect(state.entries[0].draft.revision).toBe(3);
  expect(state.entries[0].published.revision).toBe(3);
});

test("checks complete resulting composite budgets and nested prior-media locations", () => {
  const migrated = defineBlock({
    type: "note",
    version: 2,
    fields: {
      images: field.list({ item: field.media() }),
    },
    migrations: { 2: ({ data }) => ({ data: { images: data.images } }) },
  });
  const unchanged = defineBlock({
    type: "other",
    version: 1,
    fields: {
      rows: field.list({ item: field.text() }),
    },
  });
  const definitions = new Map([["note", migrated]]);
  const context = {
    fields: { rows: field.list({ item: field.text() }) },
    blocks: new Map([
      ["note", migrated],
      ["other", unchanged],
    ]),
  };
  const snapshot = (extra) => ({
    ...snap(
      "d",
      "draft",
      1,
      [
        block("b1", { images: ["m1"] }),
        ...Array.from({ length: 4 }, (_, i) => ({
          ...block(`b${i + 2}`, { rows: Array(100).fill("x") }),
          type: "other",
          hidden: true,
        })),
      ],
      [{ fieldPath: "old", mediaId: "m1", sourceKey: "b1" }],
    ),
    fields: { rows: Array(99 + extra).fill("x") },
  });
  const valid = planEntryMigration(
    { entryId: "e", draft: snapshot(0) },
    definitions,
    "system:content-sync",
    context,
  );
  expect(valid.findings).toEqual([]);
  expect(valid.unit.snapshots[0].references).toEqual([
    { fieldPath: "/images/0", mediaId: "m1", sourceKey: "b1" },
  ]);
  const invalid = planEntryMigration(
    { entryId: "e", draft: snapshot(1) },
    definitions,
    "system:content-sync",
    context,
  );
  expect(invalid.unit).toBeUndefined();
  expect(invalid.findings).toMatchObject([
    { kind: "invalid", reference: { reason: "too_many_list_items" } },
  ]);
  const defaulted = defineBlock({
    type: "note",
    version: 2,
    fields: {
      images: field.list({ item: field.media(), defaultValue: ["m1", "m1"] }),
    },
    migrations: { 2: () => ({ data: {} }) },
  });
  expect(
    planEntryMigration(
      { entryId: "e", draft: snapshot(0) },
      new Map([["note", defaulted]]),
      "system:content-sync",
      {
        ...context,
        blocks: new Map([
          ["note", defaulted],
          ["other", unchanged],
        ]),
      },
    ).findings,
  ).toMatchObject([{ kind: "invalid", reference: { reason: "too_many_list_items" } }]);
  const foreign = snapshot(0);
  foreign.blocks[0].data.images = ["m2"];
  expect(
    planEntryMigration(
      { entryId: "e", draft: foreign },
      definitions,
      "system:content-sync",
      context,
    ).findings,
  ).toMatchObject([{ kind: "invalid", reference: { reason: "media_not_previously_referenced" } }]);
});

test("a later model removal cannot make an unsafe migration intermediate acceptable", async () => {
  const other = defineBlock({
    type: "other",
    version: 1,
    fields: { rows: field.list({ item: field.text() }) },
  });
  const beforeBlock = defineBlock({ type: "note", version: 1, fields: { body: field.text() } });
  const afterBlock = defineBlock({
    type: "note",
    version: 2,
    fields: { rows: field.list({ item: field.text() }) },
    migrations: { 2: () => ({ data: { rows: ["new"] } }) },
  });
  const make = (note, version) =>
    defineConfig({
      blocks: [note, other],
      content: [
        defineCollection({
          key: "posts",
          route: "/blog/:slug",
          version,
          blocks: ["note", "other"],
          ...(version === 2 ? { removedFields: ["rows"] } : {}),
          fields: version === 1 ? { rows: field.list({ item: field.text() }) } : {},
        }),
      ],
    });
  const before = await make(beforeBlock, 1);
  const after = await make(afterBlock, 2);
  const draft = snap("d", "draft", 1, [
    block("b1", { body: "old" }),
    ...Array.from({ length: 4 }, (_, index) => ({
      ...block(`b${index + 2}`, { rows: Array(100).fill("x") }),
      type: "other",
      hidden: true,
    })),
  ]);
  draft.fields = { rows: Array(100).fill("x") };
  const state = store(before.runtime.content[0], [{ entryId: "e", draft }]);
  const prepared = await prepareConfigurationSynchronization({
    models: after.runtime.content,
    blocks: after.runtime.blocks,
    state,
  });
  expect(prepared.plan.isValid).toBe(false);
  expect(prepared.plan.diagnostics).toContainEqual(
    expect.objectContaining({
      code: "BLOCK_MIGRATION_INVALID",
      snapshots: [expect.objectContaining({ reason: "too_many_list_items" })],
    }),
  );
  expect(state.writes).toEqual([]);
  expect(state.finals).toEqual([]);
});
