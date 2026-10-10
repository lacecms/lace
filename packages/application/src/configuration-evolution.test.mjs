import { expect, test } from "vitest";
import { defineCollection, defineConfig } from "@lacecms/config";
import { builtInBlocks, field } from "@lacecms/content";
import {
  CONFIGURATION_SYNC_NAMED_SNAPSHOT_LIMIT,
  configurationSyncAdvancesPublicState,
  configurationSyncBackfills,
  createSnapshotEvidenceAccumulator,
  diffContentModelStructures,
  planConfigurationSyncScans,
  planConfigurationSynchronization,
  prepareConfigurationSynchronization,
  renderConfigurationSyncPlanJson,
  renderConfigurationSyncPlanText,
} from "../dist/index.js";

const blocks = Object.values(builtInBlocks);

async function posts(overrides = {}) {
  const config = await defineConfig({
    blocks,
    content: [
      defineCollection({
        blocks: ["richText", "image"],
        fields: { summary: field.text({ maxLength: 100 }) },
        key: "posts",
        route: "/blog/:slug",
        version: 1,
        ...overrides,
      }),
    ],
  });
  return config.runtime.content[0];
}

function storedFrom(model, overrides = {}) {
  return {
    draftSnapshotCount: 2,
    entryCount: 2,
    key: model.key,
    kind: model.kind,
    projectionHash: model.projectionHash,
    publishedSnapshotCount: 1,
    snapshotFingerprint: "3:5:30:12",
    structure: model.structure,
    structureHash: model.structureHash,
    version: model.version,
    ...overrides,
  };
}

function snapshot(id, state, fields, blockTypes = []) {
  return {
    blocks: blockTypes.map((type, index) => ({ key: `b${index}`, schemaVersion: 1, type })),
    entryId: `entry-${id}`,
    fields,
    revision: 1,
    snapshotId: `snapshot-${id}`,
    state,
    title: `Title ${id}`,
  };
}

/** Builds a fake read port over pages of snapshots for one model. */
function port(stored, snapshots, pageSize = 2) {
  const reads = [];
  return {
    reads,
    async readConfigurationSyncState() {
      return stored;
    },
    async readConfigurationSyncSnapshots({ after, limit, modelKey }) {
      reads.push({ after, limit, modelKey });
      const start = after === undefined ? 0 : Number(after);
      const items = snapshots.slice(start, start + pageSize);
      const next = start + pageSize < snapshots.length ? String(start + pageSize) : undefined;
      return next === undefined ? { items } : { items, next };
    },
  };
}

test("classifies every structural change kind deterministically", async () => {
  const baseline = await posts({
    blocks: ["richText", "image", "quote"],
    fields: {
      body: field.richText(),
      category: field.select({ options: ["a", "b", "c"] }),
      count: field.number({ max: 10, min: 0 }),
      kind: field.select({ options: ["x", "y"] }),
      legacy: field.text(),
      summary: field.text({ maxLength: 100 }),
      title: field.text(),
    },
  });
  const target = await posts({
    blocks: ["quote", "image", "cta"],
    fields: {
      added: field.text(),
      body: field.number(),
      category: field.select({ options: ["a", "b", "c", "d"] }),
      count: field.number({ max: 20, min: 1 }),
      kind: field.select({ options: ["y", "x"] }),
      required: field.text({ defaultValue: "x", required: true }),
      summary: field.text({ maxLength: 50 }),
      title: field.text({ required: true }),
    },
    route: "/posts/:slug",
    version: 2,
  });

  const changes = diffContentModelStructures(baseline.structure, target.structure);
  expect(changes.map((change) => [change.class, change.kind, change.target])).toEqual([
    ["compatible", "field-added", "added"],
    ["breaking", "field-type-changed", "body"],
    ["compatible", "field-changed", "category"],
    ["validated", "field-changed", "count"],
    ["display", "field-options-reordered", "kind"],
    ["destructive", "field-removed", "legacy"],
    ["compatible", "field-added", "required"],
    ["validated", "field-changed", "summary"],
    ["validated", "field-changed", "title"],
    ["compatible", "block-type-allowed", "cta"],
    ["destructive", "block-type-removed", "richText"],
    ["breaking", "route-changed", "route"],
  ]);
  expect(changes.find((change) => change.target === "count")?.properties).toEqual(["max", "min"]);
  expect(changes.find((change) => change.target === "required")?.backfill).toBe(true);
  expect(diffContentModelStructures(target.structure, target.structure)).toEqual([]);
});

test("reports allowlist reorder as display and changed block definitions as migration", async () => {
  const baseline = await posts();
  const reordered = await posts({ blocks: ["image", "richText"], version: 2 });
  expect(diffContentModelStructures(baseline.structure, reordered.structure)).toEqual([
    { class: "display", kind: "block-allowlist-reordered", scope: "model", target: "blocks" },
  ]);

  const changedImage = {
    ...baseline.structure,
    blockDefinitions: baseline.structure.blockDefinitions.map((definition) =>
      definition.type === "image" ? { ...definition, version: 2 } : definition,
    ),
  };
  expect(diffContentModelStructures(baseline.structure, changedImage)).toEqual([
    { class: "migration", kind: "block-definition-changed", scope: "block", target: "image" },
  ]);
});

test("accumulates evidence across pages and caps named violations", async () => {
  const target = await posts({
    fields: {
      flag: field.text({ defaultValue: "on" }),
      summary: field.text({ maxLength: 3, required: true }),
    },
    version: 2,
  });
  const baseline = await posts({ fields: { old: field.text(), summary: field.text() } });
  const changes = diffContentModelStructures(baseline.structure, target.structure);
  const accumulator = createSnapshotEvidenceAccumulator({
    changes,
    fields: target.fields,
    fingerprint: "f",
    modelKey: "posts",
  });
  const many = Array.from({ length: CONFIGURATION_SYNC_NAMED_SNAPSHOT_LIMIT + 5 }, (_, index) =>
    snapshot(index, "draft", { summary: "too long" }),
  );
  accumulator.add(many.slice(0, 10));
  accumulator.add(many.slice(10));
  accumulator.add([
    snapshot("p1", "published", {}),
    snapshot("p2", "published", { flag: "kept", old: "value", summary: "ok" }),
  ]);
  const evidence = accumulator.result();

  expect(evidence.snapshots).toEqual({ draft: 25, published: 2 });
  expect(evidence.fieldHolders).toEqual({ old: { draft: 0, published: 1 } });
  expect(evidence.backfills).toEqual({ flag: { draft: 25, published: 1 } });
  expect(evidence.violations.summary.count).toBe(26);
  expect(evidence.violations.summary.snapshots).toHaveLength(
    CONFIGURATION_SYNC_NAMED_SNAPSHOT_LIMIT,
  );
  expect(evidence.violations.summary.snapshots.at(-1)).toEqual({
    entryId: "entry-19",
    state: "draft",
    title: "Title 19",
  });
  expect(evidence.oversized.count).toBe(0);
});

test("records baselines for unchanged models and accepts legacy hashes", async () => {
  const model = await posts();
  const missing = planConfigurationSynchronization({
    models: [model],
    storedModels: [storedFrom(model, { structure: undefined })],
  });
  expect(missing).toMatchObject({
    isValid: true,
    operations: [{ action: "record-baseline", model: { key: "posts" } }],
    requiresApply: true,
  });
  expect(configurationSyncAdvancesPublicState(missing)).toBe(false);

  const legacy = { ...model, legacyStructureHash: "legacy-hash" };
  const upgraded = planConfigurationSynchronization({
    models: [legacy],
    storedModels: [storedFrom(model, { structure: undefined, structureHash: "legacy-hash" })],
  });
  expect(upgraded.operations).toMatchObject([
    { action: "record-baseline", model: { structureHash: model.structureHash } },
  ]);

  const current = planConfigurationSynchronization({
    models: [model],
    storedModels: [storedFrom(model)],
  });
  expect(current).toMatchObject({ isValid: true, operations: [], requiresApply: false });
});

test("keeps the strict refusal when a populated model has no baseline", async () => {
  const model = await posts({ fields: { extra: field.text() }, version: 2 });
  const before = await posts();
  const plan = planConfigurationSynchronization({
    models: [model],
    storedModels: [storedFrom(before, { structure: undefined })],
  });
  expect(plan.isValid).toBe(false);
  expect(plan.diagnostics).toMatchObject([{ code: "STRUCTURE_BASELINE_MISSING" }]);
  expect(plan.diagnostics[0].message).toContain("Restore the previous definition");
});

test("applies compatible changes to populated models without scanning", async () => {
  const before = await posts();
  const after = await posts({
    blocks: ["richText", "image", "quote"],
    fields: {
      extra: field.text(),
      mandatory: field.text({ required: true }),
      summary: field.text(),
    },
    version: 2,
  });
  const input = { models: [after], storedModels: [storedFrom(before)] };
  expect(planConfigurationSyncScans(input)).toEqual([]);
  const plan = planConfigurationSynchronization(input);
  expect(plan).toMatchObject({
    isValid: true,
    operations: [
      {
        action: "version-update",
        evolution: {
          backfills: [],
          snapshots: { draft: 2, published: 1 },
          changes: [
            { class: "compatible", kind: "field-added", target: "extra" },
            { class: "compatible", kind: "field-added", target: "mandatory" },
            { class: "compatible", kind: "field-changed", target: "summary" },
            { class: "compatible", kind: "block-type-allowed", target: "quote" },
          ],
        },
      },
    ],
  });
  expect(configurationSyncAdvancesPublicState(plan)).toBe(true);
});

test("prepares evidence-backed plans with backfills and refusals", async () => {
  const before = await posts({ fields: { old: field.text(), summary: field.text() } });
  const after = await posts({
    fields: {
      flag: field.text({ defaultValue: "on", required: true }),
      summary: field.text({ maxLength: 5 }),
    },
    version: 2,
  });
  const stored = [storedFrom(before)];
  const fine = port(stored, [
    snapshot(1, "draft", { summary: "ok" }),
    snapshot(2, "draft", {}),
    snapshot(3, "published", { flag: "kept", summary: "short" }),
  ]);
  const prepared = await prepareConfigurationSynchronization({ models: [after], state: fine });
  expect(fine.reads.map((read) => read.after)).toEqual([undefined, "2"]);
  expect(prepared.plan.isValid).toBe(true);
  const [operation] = prepared.plan.operations;
  expect(operation.evolution).toMatchObject({
    backfills: ["flag"],
    snapshots: { draft: 2, published: 1 },
  });
  expect(configurationSyncBackfills(operation, after)).toEqual([
    { fieldKey: "flag", json: '"on"' },
  ]);
  expect(prepared.report.text).toContain("planned backfills: flag");
  expect(prepared.report.text).toContain("backfill: draft=2, published=0");
  expect(prepared.report.text).toContain("destructive field-removed field old");

  const failing = port(stored, [
    snapshot(1, "draft", { old: "x", summary: "far too long" }),
    snapshot(2, "published", { summary: "also too long" }),
  ]);
  const refused = await prepareConfigurationSynchronization({ models: [after], state: failing });
  expect(refused.plan.isValid).toBe(false);
  expect(refused.plan.diagnostics).toMatchObject([
    { code: "CONSTRAINT_VIOLATED", fieldKey: "summary", affectedCount: 2 },
    { code: "FIELD_REMOVAL_HAS_DATA", fieldKey: "old", affectedCount: 1 },
  ]);
  expect(refused.plan.diagnostics[0].snapshots).toEqual([
    { entryId: "entry-1", state: "draft", title: "Title 1" },
    { entryId: "entry-2", state: "published", title: "Title 2" },
  ]);
  expect(refused.report.text).toContain('published entry-2 "Title 2"');

  const stale = planConfigurationSynchronization({
    evidence: prepared.evidence,
    models: [after],
    storedModels: [storedFrom(before, { snapshotFingerprint: "changed" })],
  });
  expect(stale.diagnostics).toMatchObject([{ code: "SNAPSHOT_EVIDENCE_STALE" }]);
});

test("refuses media default backfills, used block changes, breaking types and published routes", async () => {
  const before = await posts({ fields: { count: field.text() } });
  const after = await posts({
    blocks: ["image"],
    fields: { count: field.number(), cover: field.media({ defaultValue: "media-1" }) },
    route: "/posts/:slug",
    version: 2,
  });
  const prepared = await prepareConfigurationSynchronization({
    models: [after],
    state: port([storedFrom(before)], [snapshot(1, "published", {}, ["richText"])]),
  });
  expect(prepared.plan.diagnostics.map((value) => value.code)).toEqual([
    "BLOCK_TYPE_REMOVAL_HAS_BLOCKS",
    "FIELD_TYPE_CHANGED",
    "MEDIA_DEFAULT_BACKFILL_UNSUPPORTED",
    "ROUTE_CHANGE_HAS_PUBLISHED",
  ]);
  expect(prepared.plan.operations).toMatchObject([{ action: "incompatible-change" }]);

  const draftsOnly = planConfigurationSynchronization({
    models: [await posts({ route: "/posts/:slug", version: 2 })],
    storedModels: [storedFrom(await posts(), { publishedSnapshotCount: 0 })],
  });
  expect(draftsOnly.isValid).toBe(true);
});

test("renders identical reports for equivalent inputs", async () => {
  const before = await posts();
  const first = await posts({
    blocks: ["image", "richText", "quote"],
    fields: { a: field.text(), summary: field.text({ maxLength: 100 }), z: field.text() },
    version: 2,
  });
  const second = await posts({
    blocks: ["image", "richText", "quote"],
    fields: { z: field.text(), summary: field.text({ maxLength: 100 }), a: field.text() },
    version: 2,
  });
  const plan = (model) =>
    planConfigurationSynchronization({ models: [model], storedModels: [storedFrom(before)] });
  expect(renderConfigurationSyncPlanJson(plan(first))).toBe(
    renderConfigurationSyncPlanJson(plan(second)),
  );
  expect(renderConfigurationSyncPlanText(plan(first))).toBe(
    renderConfigurationSyncPlanText(plan(second)),
  );
});
