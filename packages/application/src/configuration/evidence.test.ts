import { expect, test } from "vitest";
import { field } from "@lacecms/content";
import {
  configurationSyncContentWrites,
  createSnapshotEvidenceAccumulator,
  diffContentModelStructures,
  planConfigurationSynchronization,
  prepareConfigurationSynchronization,
  renderConfigurationSyncPlanJson,
  validateStructureHints,
} from "../index.js";
import { posts, storedFrom, snapshot, port } from "../test-support/configuration-fixtures.js";
import type { ConfigurationSyncOperation } from "./types.js";

test("evaluates moved, pruned and backfilled values in apply order", async () => {
  const baseline = await posts({ fields: { headline: field.text(), legacy: field.text() } });
  const target = await posts({
    fields: {
      title: field.text({ defaultValue: "none", maxLength: 5, renamedFrom: "headline" }),
    },
    removedFields: ["legacy"],
    version: 2,
  });
  const changes = diffContentModelStructures(baseline.structure, target.structure, target);
  const accumulator = createSnapshotEvidenceAccumulator({
    changes,
    fields: target.fields,
    fingerprint: "f",
    modelKey: "posts",
  });
  accumulator.add([
    snapshot(1, "draft", { headline: "short", legacy: "x" }),
    snapshot(2, "published", { headline: "far too long" }),
    snapshot(3, "draft", { title: "taken" }),
    snapshot(4, "draft", {}),
  ]);
  const evidence = accumulator.result();
  expect(evidence.fieldHolders).toMatchObject({
    headline: { draft: 1, published: 1 },
    legacy: { draft: 1, published: 0 },
    title: { draft: 1, published: 0, snapshots: [{ entryId: "entry-3" }] },
  });
  // Snapshot 1 keeps its moved value; snapshot 4 receives the default.
  expect(evidence.backfills).toEqual({ title: { draft: 1, published: 0 } });
  // Only the moved value is too long; the backfilled default conforms.
  expect(evidence.violations.title).toMatchObject({
    count: 1,
    snapshots: [{ entryId: "entry-2" }],
  });
});

test("plans hinted rewrites, refuses unhinted removals and renames onto data", async () => {
  const before = await posts({
    blocks: ["richText", "image", "quote"],
    fields: { headline: field.text(), legacy: field.text(), old: field.text() },
  });
  const after = await posts({
    blocks: ["richText", "image"],
    fields: {
      flag: field.text({ defaultValue: "on" }),
      title: field.text({ renamedFrom: "headline" }),
    },
    removedBlocks: ["quote"],
    removedFields: ["legacy", "old"],
    version: 2,
  });
  const stored = [storedFrom(before)];
  const prepared = await prepareConfigurationSynchronization({
    models: [after],
    state: port(stored, [
      snapshot(1, "draft", { headline: "a", legacy: "x" }, ["quote"]),
      snapshot(2, "published", { headline: "b" }, ["richText"]),
    ]),
  });
  expect(prepared.plan.isValid).toBe(true);
  const [operation] = prepared.plan.operations;
  if (operation?.action !== "version-update" || operation.evolution === undefined)
    throw new Error("Expected a version update with evolution");
  expect(operation.evolution).toMatchObject({
    backfills: ["flag"],
    blockRemovals: ["quote"],
    fieldRemovals: ["legacy"],
    renames: [{ from: "headline", to: "title" }],
  });
  expect(operation.evolution.changes).toContainEqual({
    affected: { draft: 1, published: 1 },
    class: "destructive",
    from: "headline",
    kind: "field-renamed",
    scope: "field",
    target: "title",
  });
  expect(configurationSyncContentWrites(operation, after)).toEqual([
    { action: "rename-field", from: "headline", to: "title" },
    { action: "remove-field", fieldKey: "legacy" },
    { action: "remove-block-type", blockType: "quote" },
    { action: "backfill-field", fieldKey: "flag", json: '"on"' },
  ]);
  expect(prepared.report.text).toContain(
    "destructive field-renamed field title (from headline; affected: draft=1, published=1)",
  );
  expect(prepared.report.text).toContain("destructive field-removed field legacy (hinted;");
  expect(prepared.report.text).toContain("planned renames: headline -> title");
  expect(prepared.report.text).toContain("planned field removals: legacy");
  expect(prepared.report.text).toContain("planned block removals: quote");

  const unhinted = await posts({
    blocks: ["richText", "image"],
    fields: { title: field.text() },
    version: 2,
  });
  const refused = await prepareConfigurationSynchronization({
    models: [unhinted],
    state: port(stored, [
      snapshot(1, "draft", { headline: "a" }, ["quote"]),
      snapshot(2, "published", { title: "t", headline: "b" }),
    ]),
  });
  expect(refused.plan.diagnostics).toMatchObject([
    {
      blockType: "quote",
      code: "BLOCK_TYPE_REMOVAL_HAS_BLOCKS",
      snapshots: [{ entryId: "entry-1", state: "draft" }],
    },
    { code: "FIELD_REMOVAL_HAS_DATA", fieldKey: "headline", affectedCount: 2 },
  ]);
  expect(refused.plan.diagnostics[0]!.message).toContain('removedBlocks: ["quote"]');
  expect(refused.plan.diagnostics[1]!.message).toContain('removedFields: ["headline"]');
  expect(refused.plan.diagnostics[1]!.snapshots).toHaveLength(2);

  const onto = await prepareConfigurationSynchronization({
    models: [after],
    state: port(stored, [snapshot(1, "draft", { headline: "a", title: "already" })]),
  });
  expect(onto.plan.diagnostics).toMatchObject([
    { code: "FIELD_RENAME_TARGET_HAS_DATA", fieldKey: "title", affectedCount: 1 },
  ]);
});

test("keeps plans without hints free of hinted write fields", async () => {
  const before = await posts({ fields: { old: field.text(), summary: field.text() } });
  const after = await posts({ fields: { summary: field.text() }, version: 2 });
  const prepared = await prepareConfigurationSynchronization({
    models: [after],
    state: port([storedFrom(before)], [snapshot(1, "draft", { summary: "a" })]),
  });
  const json = renderConfigurationSyncPlanJson(prepared.plan);
  expect(json).not.toMatch(/renames|fieldRemovals|blockRemovals|hinted|"from"/u);
  expect(configurationSyncContentWrites(prepared.plan.operations[0]!, after)).toEqual([]);
});

test("classifies enabling and disabling SEO and collects SEO holders", async () => {
  const plain = await posts();
  const enabled = await posts({ seo: { description: "summary" }, version: 2 });
  expect(diffContentModelStructures(plain.structure, enabled.structure)).toEqual([
    { class: "compatible", kind: "seo-enabled", scope: "model", target: "seo" },
  ]);
  expect(diffContentModelStructures(enabled.structure, plain.structure)).toEqual([
    { class: "destructive", kind: "seo-disabled", scope: "model", target: "seo" },
  ]);
  const disabled = diffContentModelStructures(enabled.structure, plain.structure, {
    removedSeo: true,
  });
  expect(disabled).toEqual([
    { class: "destructive", hinted: true, kind: "seo-disabled", scope: "model", target: "seo" },
  ]);
  const remapped = await posts({ seo: true, version: 2 });
  expect(remapped.structureHash).toBe(enabled.structureHash);

  const accumulator = createSnapshotEvidenceAccumulator({
    changes: disabled,
    fields: plain.fields,
    fingerprint: "f",
    modelKey: "posts",
  });
  accumulator.add([
    { ...snapshot(1, "draft", {}), hasSeo: true },
    { ...snapshot(2, "draft", {}), hasSeo: false },
    { ...snapshot(3, "published", {}), hasSeo: true },
  ]);
  expect(accumulator.result().seoHolders).toEqual({
    draft: 1,
    published: 1,
    snapshots: [
      { entryId: "entry-1", state: "draft", title: "Title 1" },
      { entryId: "entry-3", state: "published", title: "Title 3" },
    ],
  });
  const none = createSnapshotEvidenceAccumulator({
    changes: [],
    fields: plain.fields,
    fingerprint: "f",
    modelKey: "posts",
  });
  expect(none.result()).not.toHaveProperty("seoHolders");

  const operation: ConfigurationSyncOperation = {
    action: "version-update",
    evolution: {
      backfills: [],
      changes: [],
      seoRemoval: true,
      snapshots: { draft: 1, published: 1 },
    },
    model: {
      key: storedFrom(plain).key,
      kind: plain.kind,
      projectionHash: plain.projectionHash,
      structureHash: plain.structureHash,
      version: plain.version,
    },
  };
  expect(configurationSyncContentWrites(operation, plain)).toEqual([{ action: "remove-seo" }]);
});

test("composite adoption preserves compatibility and requires evidence for nested evolution", async () => {
  const root = field.group({ fields: { title: field.text({ label: "Title" }) } });
  const before = await posts();
  const added = await posts({ version: 2, fields: { ...before.fields, root } });
  expect(
    planConfigurationSynchronization({ models: [added], storedModels: [storedFrom(before)] })
      .isValid,
  ).toBe(true);
  expect(planConfigurationSynchronization({ models: [added], storedModels: [] }).isValid).toBe(
    true,
  );
  const renamed = await posts({
    version: 3,
    fields: {
      ...before.fields,
      newRoot: field.group({ fields: root.fields, renamedFrom: "root" }),
    },
  });
  const removed = await posts({ version: 3 });
  const withDefault = await posts({
    version: 3,
    fields: { ...before.fields, root: field.group({ fields: root.fields, defaultValue: {} }) },
  });
  for (const after of [renamed, removed, withDefault]) {
    const plan = planConfigurationSynchronization({
      models: [after],
      storedModels: [storedFrom(added)],
    });
    expect(plan.isValid).toBe(false);
    expect(plan.diagnostics.some((item) => item.code === "SNAPSHOT_EVIDENCE_STALE")).toBe(true);
  }
  const display = await posts({
    version: 2,
    fields: {
      ...before.fields,
      root: field.group({ fields: { title: field.text({ label: "Changed" }) } }),
    },
  });
  expect(
    planConfigurationSynchronization({ models: [display], storedModels: [storedFrom(added)] })
      .isValid,
  ).toBe(true);
  const defaultAddition = await posts({
    version: 2,
    fields: { ...before.fields, root: field.group({ fields: root.fields, defaultValue: {} }) },
  });
  expect(
    planConfigurationSynchronization({
      models: [defaultAddition],
      storedModels: [storedFrom(before)],
    }).diagnostics.some((item) => item.code === "SNAPSHOT_EVIDENCE_STALE"),
  ).toBe(true);
  const listBefore = await posts({ fields: { list: field.list({ item: field.text() }) } });
  const listAfter = await posts({
    version: 2,
    fields: { list: field.list({ item: field.text(), maxItems: 10 }) },
  });
  expect(
    planConfigurationSynchronization({
      models: [listAfter],
      storedModels: [storedFrom(listBefore)],
    }).diagnostics.some((item) => item.code === "SNAPSHOT_EVIDENCE_STALE"),
  ).toBe(true);
});

test("nested evolution pairs ancestors before child hints and retains inert hints", async () => {
  const before = await posts({
    fields: {
      links: field.list({
        item: field.group({
          fields: {
            headline: field.text({ maxLength: 100 }),
            legacy: field.text(),
          },
        }),
      }),
    },
  });
  const after = await posts({
    version: 2,
    fields: {
      cards: field.list({
        renamedFrom: "links",
        maxItems: 10,
        item: field.group({
          fields: {
            title: field.text({ renamedFrom: "headline", maxLength: 80 }),
            caption: field.text({ defaultValue: "Caption" }),
          },
        }),
      }),
    },
    removedFields: ["/cards/*/legacy"],
  });
  expect(validateStructureHints(before.structure, after)).toEqual([]);
  const changes = diffContentModelStructures(before.structure, after.structure, after);
  expect(changes).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ target: "cards", kind: "field-renamed", from: "links" }),
      expect.objectContaining({ target: "cards", class: "validated", properties: ["maxItems"] }),
      expect.objectContaining({
        target: "/cards/*/title",
        kind: "field-renamed",
        from: "/cards/*/headline",
      }),
      expect.objectContaining({
        target: "/cards/*/title",
        class: "validated",
        properties: ["maxLength"],
      }),
      expect.objectContaining({ target: "/cards/*/legacy", kind: "field-removed", hinted: true }),
      expect.objectContaining({ target: "/cards/*/caption", kind: "field-added", backfill: true }),
    ]),
  );
  expect(validateStructureHints(after.structure, after)).toEqual([]);
  expect(diffContentModelStructures(after.structure, after.structure, after)).toEqual([]);
});

test("nested hint validation refuses source ambiguity and invalid traversal", async () => {
  const baseline = await posts({
    fields: {
      links: field.list({
        item: field.group({
          fields: {
            title: field.text(),
            headline: field.text(),
          },
        }),
      }),
    },
  });
  expect(
    validateStructureHints(baseline.structure, {
      renamedFields: { "/links/*/title": "/links/*/headline" },
    }),
  ).toEqual([{ target: "/links/*/title", from: "/links/*/headline", kind: "target-exists" }]);
  expect(
    validateStructureHints(baseline.structure, {
      renamedFields: { "/new/*/title": "/new/*/headline" },
    })[0]!.kind,
  ).toBe("source-missing");
  expect(
    validateStructureHints(baseline.structure, { removedFields: ["/links/title"] })[0]!.kind,
  ).toBe("source-missing");
});

test("nested scalar items and type changes are classified without composite fallback", async () => {
  const before = await posts({
    fields: { tags: field.list({ item: field.text({ maxLength: 100 }) }) },
  });
  const tightened = await posts({
    version: 2,
    fields: { tags: field.list({ item: field.text({ maxLength: 80 }) }) },
  });
  expect(diffContentModelStructures(before.structure, tightened.structure)).toEqual([
    expect.objectContaining({ target: "/tags/*", class: "validated", properties: ["maxLength"] }),
  ]);
  const changed = await posts({
    version: 2,
    fields: { tags: field.list({ item: field.number() }) },
  });
  expect(diffContentModelStructures(before.structure, changed.structure)).toEqual([
    expect.objectContaining({ target: "/tags/*", class: "breaking", kind: "field-type-changed" }),
  ]);
});

test("recursive field transforms keep presence, values, arrays and media paths", async () => {
  const { transformConfigurationSyncFields } = await import("../index.js");
  const before = await posts({
    fields: {
      links: field.list({
        item: field.group({ fields: { headline: field.text(), legacy: field.media() } }),
      }),
      profile: field.group({ fields: { name: field.text() } }),
    },
  });
  const after = await posts({
    version: 2,
    fields: {
      cards: field.list({
        renamedFrom: "links",
        item: field.group({
          fields: {
            title: field.text({ renamedFrom: "headline" }),
            caption: field.text({ defaultValue: "Caption" }),
          },
        }),
      }),
      profile: field.group({
        fields: { name: field.text(), caption: field.text({ defaultValue: "Profile" }) },
      }),
    },
    removedFields: ["/cards/*/legacy"],
  });
  const changes = diffContentModelStructures(before.structure, after.structure, after);
  const original = {
    links: [
      { headline: "One", legacy: "media-1" },
      { headline: "Two", caption: "Explicit" },
    ],
  };
  const result = transformConfigurationSyncFields(after.fields, changes, original, "published");
  expect(result.fields).toEqual({
    cards: [
      { title: "One", caption: "Caption" },
      { title: "Two", caption: "Explicit" },
    ],
  });
  expect(original.links[0]).toHaveProperty("headline");
  expect(result.fields).not.toHaveProperty("profile");
  expect(result.references).toEqual([]);
  expect(result.backfills).toEqual({ "/cards/*/caption": "/fields/cards/0/caption" });
  const empty = transformConfigurationSyncFields(after.fields, changes, { profile: {} }, "draft");
  expect(empty.fields).toEqual({ profile: { caption: "Profile" } });
});

test("recursive media backfills, per-item collisions and tightening carry concrete paths", async () => {
  const { transformConfigurationSyncFields } = await import("../index.js");
  const before = await posts({
    fields: {
      links: field.list({
        item: field.group({ fields: { headline: field.text(), image: field.media() } }),
      }),
    },
  });
  const after = await posts({
    version: 2,
    fields: {
      links: field.list({
        minItems: 2,
        maxItems: 10,
        item: field.group({
          fields: {
            title: field.text({ renamedFrom: "headline", maxLength: 2 }),
            image: field.media({ defaultValue: "media-2" }),
          },
        }),
      }),
    },
  });
  const changes = diffContentModelStructures(before.structure, after.structure, after);
  const result = transformConfigurationSyncFields(
    after.fields,
    changes,
    { links: [{ headline: "Long" }, { title: "Occupied", image: "media-1" }] },
    "published",
  );
  expect(result.holders["/links/*/title"]).toBe("/fields/links/1/title");
  expect(result.violations["/links/*/title"]).toBe("/fields/links/0/title");
  expect(result.mediaBackfills["/links/*/image"]).toBe("/fields/links/0/image");
  expect(result.references.map((r) => r.fieldPath)).toEqual(["/links/0/image", "/links/1/image"]);
  const draft = transformConfigurationSyncFields(after.fields, changes, { links: [] }, "draft");
  expect(draft.violations).toEqual({});
  const published = transformConfigurationSyncFields(
    after.fields,
    changes,
    { links: [] },
    "published",
  );
  expect(published.violations).toEqual({ links: "/fields/links" });
});

test("composite defaults normalize descendants and nested media relocates with parent rename", async () => {
  const { transformConfigurationSyncFields } = await import("../index.js");
  const before = await posts({
    fields: { links: field.list({ item: field.group({ fields: { image: field.media() } }) }) },
  });
  const after = await posts({
    version: 2,
    fields: {
      cards: field.list({
        renamedFrom: "links",
        item: field.group({ fields: { image: field.media() } }),
      }),
      profile: field.group({
        fields: { portrait: field.media({ defaultValue: "media-2" }) },
        defaultValue: {},
      }),
    },
  });
  const changes = diffContentModelStructures(before.structure, after.structure, after);
  const result = transformConfigurationSyncFields(
    after.fields,
    changes,
    { links: [{ image: "media-1" }] },
    "draft",
  );
  expect(result.references).toEqual([
    { fieldPath: "/cards/0/image", mediaId: "media-1" },
    { fieldPath: "/profile/portrait", mediaId: "media-2" },
  ]);
  expect(result.mediaBackfills).toEqual({ profile: "/fields/profile" });
  const present = transformConfigurationSyncFields(
    after.fields,
    changes,
    { links: [], profile: {} },
    "draft",
  );
  expect(present.mediaBackfills).toEqual({});
  expect(present.fields.profile).toEqual({});
});

test("recursive plans apply satisfied tightening and refuse named violating occurrences", async () => {
  const before = await posts({
    fields: { links: field.list({ item: field.group({ fields: { title: field.text() } }) }) },
  });
  const after = await posts({
    version: 2,
    fields: {
      links: field.list({
        maxItems: 2,
        item: field.group({
          fields: {
            title: field.text({ maxLength: 3 }),
            caption: field.text({ defaultValue: "Caption" }),
          },
        }),
      }),
    },
  });
  const changes = diffContentModelStructures(before.structure, after.structure);
  const accumulator = createSnapshotEvidenceAccumulator({
    changes,
    fields: after.fields,
    fingerprint: "f",
    modelKey: "posts",
  });
  accumulator.add([
    {
      entryId: "entry",
      snapshotId: "snapshot",
      state: "published",
      revision: 1,
      title: "Entry",
      blocks: [],
      fields: { links: [{ title: "Too long" }] },
    },
  ]);
  const plan = planConfigurationSynchronization({
    models: [after],
    storedModels: [
      storedFrom(before, {
        draftSnapshotCount: 0,
        publishedSnapshotCount: 1,
        snapshotFingerprint: "f",
      }),
    ],
    evidence: { posts: accumulator.result() },
  });
  expect(plan.isValid).toBe(false);
  expect(plan.diagnostics).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        code: "CONSTRAINT_VIOLATED",
        fieldKey: "/links/*/title",
        snapshots: [expect.objectContaining({ path: "/fields/links/0/title" })],
      }),
    ]),
  );
});

test("nested tightening preserves draft minima and unrelated published absence", async () => {
  const { transformConfigurationSyncFields } = await import("../index.js");
  const before = await posts({
    fields: {
      required: field.text({ required: true }),
      profile: field.group({ fields: { name: field.text() } }),
      rows: field.list({ item: field.text() }),
    },
  });
  const after = await posts({
    version: 2,
    fields: {
      required: field.text({ required: true }),
      profile: field.group({
        fields: { name: field.text({ required: true }), added: field.text({ required: true }) },
      }),
      rows: field.list({ item: field.text(), minItems: 2, maxItems: 3 }),
    },
  });
  const changes = diffContentModelStructures(before.structure, after.structure);
  expect(
    transformConfigurationSyncFields(after.fields, changes, { profile: {}, rows: [] }, "draft")
      .violations,
  ).toEqual({});
  expect(
    transformConfigurationSyncFields(after.fields, changes, { profile: {}, rows: [] }, "published")
      .violations,
  ).toEqual({ "/profile/name": "/fields/profile/name", rows: "/fields/rows" });
  expect(
    transformConfigurationSyncFields(after.fields, changes, { rows: ["a", "b"] }, "published")
      .violations,
  ).toEqual({});
  expect(
    transformConfigurationSyncFields(
      after.fields,
      changes,
      { profile: { name: "x" }, rows: ["a", "b"] },
      "published",
    ).violations,
  ).toEqual({});
  expect(
    transformConfigurationSyncFields(after.fields, changes, { rows: ["a", "b", "c", "d"] }, "draft")
      .violations,
  ).toEqual({ rows: "/fields/rows" });
});

test("nested reports count snapshots once, cap evidence and retain schema/value paths", async () => {
  const before = await posts({
    fields: { links: field.list({ item: field.group({ fields: { title: field.text() } }) }) },
  });
  const make = (reverse: boolean) =>
    posts({
      version: 2,
      fields: {
        links: field.list({
          item: field.group({
            fields: Object.fromEntries(
              reverse
                ? [
                    ["caption", field.text()],
                    ["title", field.text({ maxLength: 2 })],
                  ]
                : [
                    ["title", field.text({ maxLength: 2 })],
                    ["caption", field.text()],
                  ],
            ),
          }),
        }),
      },
    });
  const stored = [storedFrom(before, { draftSnapshotCount: 26, publishedSnapshotCount: 0 })];
  const snapshots = Array.from({ length: 26 }, (_, index) =>
    snapshot(index, "draft", { links: [{ title: "long" }, { title: "also long" }] }),
  );
  const first = await prepareConfigurationSynchronization({
    models: [await make(false)],
    state: port(stored, snapshots),
  });
  const second = await prepareConfigurationSynchronization({
    models: [await make(true)],
    state: port(stored, snapshots),
  });
  expect(first.report.json).toBe(second.report.json);
  expect(first.report.text).toBe(second.report.text);
  const finding = first.plan.diagnostics.find((value) => value.code === "CONSTRAINT_VIOLATED");
  expect(finding).toMatchObject({ schemaPath: "/links/*/title", affectedCount: 26 });
  expect(finding!.snapshots).toHaveLength(20);
  expect(finding!.snapshots![0]!.path).toBe("/fields/links/0/title");
  expect(first.report.text).toContain("… and 6 more");
  expect(first.report.check.exitCode).not.toBe(0);
});

test("prospective nested values enforce aggregate list, media and JSON boundaries", async () => {
  const fields = (
    await posts({
      fields: {
        rows: field.list({ item: field.text() }),
        profile: field.group({ fields: { image: field.media() } }),
      },
    })
  ).fields;
  const blockFields = { kept: { rows: fields.rows! } };
  const run = (count: number, references = 0, text = "") => {
    const accumulator = createSnapshotEvidenceAccumulator({
      fields,
      blockFields,
      changes: [],
      fingerprint: "f",
      modelKey: "posts",
    });
    accumulator.add([
      {
        ...snapshot(1, "published", {
          rows: Array(count).fill("x"),
          profile: { image: "m" },
          ...(text ? { text } : {}),
        }),
        blocks: Array.from({ length: 4 }, (_, index) => ({
          key: String(index),
          type: "kept",
          schemaVersion: 1,
          hidden: true,
          data: { rows: Array(100).fill("b") },
        })),
        references: Array.from({ length: references }, (_, index) => ({
          sourceKey: "block",
          mediaId: "m",
          fieldPath: String(index),
        })),
      },
    ]);
    return accumulator.result();
  };
  expect(run(100, 199).oversized.count).toBe(0);
  expect(run(101).oversized.count).toBe(1);
  expect(run(100, 200).oversized.count).toBe(1);
  expect(run(100, 0, "x".repeat(1_000_000)).oversized.count).toBe(1);
});
