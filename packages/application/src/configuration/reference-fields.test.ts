import { defineCollection, defineConfig } from "@lacecms/config";
import type { ContentModelDefinition, NormalizedContentModel } from "@lacecms/config";
import { defineBlock, field } from "@lacecms/content";
import type { BlockDefinition } from "@lacecms/content";
import { expect, test } from "vitest";
import { port, snapshot, storedFrom } from "../test-support/configuration-fixtures.js";
import { prepareConfigurationSynchronization } from "./apply.js";
import { configurationSyncSnapshotRewrites } from "./fields.js";
import {
  configurationSyncContentWrites,
  planConfigurationSyncScans,
  planConfigurationSynchronization,
} from "./plan.js";
import { diffContentModelStructures } from "./structure-diff.js";

const textAuthor = field.text();
const relatedAuthor = field.reference({ models: ["authors"] });
const authors = defineCollection({ key: "authors", version: 1 });
const editors = defineCollection({ key: "editors", version: 1 });

const posts = (version: number, fields: ContentModelDefinition["fields"]) =>
  defineCollection({ key: "posts", version, fields });

async function config(
  model: ContentModelDefinition,
  targets: readonly ContentModelDefinition[] = [authors, editors],
  blocks: readonly BlockDefinition[] = [],
) {
  return (await defineConfig({ content: [model, ...targets], blocks })).runtime;
}

function structure(model: NormalizedContentModel) {
  if (!model.structure) throw new Error("Missing normalized model structure");
  return model.structure;
}

test("classifies reference model sets recursively and retains existing version rules", async () => {
  const nested = (models: readonly string[], required = false) =>
    field.list({
      item: field.group({ fields: { author: field.reference({ models, required }) } }),
    });
  const getModel = async (models: readonly string[], version: number, required = false) =>
    (await config(posts(version, { cards: nested(models, required) }))).content[0]!;
  const before = await getModel(["authors"], 1);
  const wider = await getModel(["authors", "editors"], 2);
  const reordered = await getModel(["editors", "authors"], 2);
  const changed = await getModel(["editors"], 2, true);
  const narrow = await getModel(["authors"], 3);
  const diff = (from: NormalizedContentModel, to: NormalizedContentModel) =>
    diffContentModelStructures(structure(from), structure(to));
  const compatible = {
    class: "compatible",
    scope: "field",
    kind: "field-changed",
    target: "/cards/*/author",
    properties: ["models"],
  };
  expect(diff(before, wider)).toEqual([compatible]);
  expect(diff(wider, reordered)).toEqual([]);
  expect(diff(wider, narrow)).toEqual([{ ...compatible, class: "validated" }]);
  expect(diff(before, changed)).toEqual([
    { ...compatible, class: "validated", properties: ["models", "required"] },
  ]);

  const noBump = await getModel(["authors", "editors"], 1);
  expect(
    planConfigurationSynchronization({
      models: [noBump],
      storedModels: [storedFrom(before)],
    }).diagnostics,
  ).toMatchObject([{ code: "STRUCTURE_CHANGE_NEEDS_VERSION_BUMP", modelKey: "posts" }]);
  expect(
    planConfigurationSyncScans({ models: [wider], storedModels: [storedFrom(before)] }),
  ).toEqual([]);
  expect(
    planConfigurationSyncScans({ models: [narrow], storedModels: [storedFrom(wider)] }),
  ).toMatchObject([{ modelKey: "posts", changes: [{ ...compatible, class: "validated" }] }]);
});

test("a prospective target rename retains the logical model in reference field comparisons", async () => {
  const people = defineCollection({ key: "people", version: 1 });
  const renamed = defineCollection({ key: "authors", renamedFrom: "people", version: 2 });
  const before = await config(posts(1, { author: field.reference({ models: ["people"] }) }), [
    people,
  ]);
  const after = await config(posts(2, { author: relatedAuthor }), [renamed]);
  const storedModels = before.content.map((model) => storedFrom(model));
  expect(planConfigurationSyncScans({ models: after.content, storedModels })).toEqual([]);
  expect(planConfigurationSynchronization({ models: after.content, storedModels })).toMatchObject({
    isValid: true,
    operations: [
      { action: "rename", renamedFrom: "people", model: { key: "authors" } },
      { action: "version-update", model: { key: "posts" }, evolution: { changes: [] } },
    ],
  });

  const beforeMany = await config(
    posts(1, { author: field.reference({ models: ["editors", "people"] }) }),
    [people, editors],
  );
  expect(
    planConfigurationSyncScans({
      models: [...after.content, beforeMany.content[2]!],
      storedModels: beforeMany.content.map((model) => storedFrom(model)),
    }),
  ).toMatchObject([
    {
      modelKey: "posts",
      changes: [{ target: "author", class: "validated", properties: ["models"] }],
    },
  ]);
});

test("a renamed reference field keeps its destructive move and constraint classification", async () => {
  const before = await config(
    posts(1, {
      author: field.reference({ models: ["authors", "editors"] }),
    }),
  );
  const after = await config(
    posts(2, {
      authorEntry: field.reference({ models: ["authors"], renamedFrom: "author" }),
    }),
  );
  expect(
    planConfigurationSyncScans({
      models: after.content,
      storedModels: before.content.map((model) => storedFrom(model)),
    }),
  ).toMatchObject([
    {
      changes: [
        {
          kind: "field-changed",
          class: "validated",
          target: "authorEntry",
          properties: ["models"],
        },
        { kind: "field-renamed", class: "destructive", target: "authorEntry", from: "author" },
      ],
    },
  ]);
});

test("changed reference data in an installed block follows block version and migration rules", async () => {
  const make = async (version: number, blockVersion: number, models: readonly string[]) => {
    const block = defineBlock({
      type: "authorCard",
      version: blockVersion,
      fields: { author: field.reference({ models }) },
      ...(blockVersion === 2 ? { migrations: { 2: ({ data }) => ({ data }) } } : {}),
    });
    return config(
      defineCollection({ key: "posts", version, blocks: [block.type] }),
      [authors, editors],
      [block],
    );
  };
  const baseline = await make(1, 1, ["authors", "editors"]);
  const storedModels = baseline.content.map((model) => storedFrom(model));
  const reordered = await make(1, 1, ["editors", "authors"]);
  expect(
    planConfigurationSynchronization({ models: reordered.content, storedModels }).operations,
  ).toEqual([]);
  const noModelBump = await make(1, 1, ["authors"]);
  expect(
    planConfigurationSynchronization({ models: noModelBump.content, storedModels }).diagnostics,
  ).toMatchObject([{ code: "STRUCTURE_CHANGE_NEEDS_VERSION_BUMP" }]);
  const source = port(storedModels, [snapshot(1, "draft", {}, ["authorCard"])]);
  const noBlockBump = await make(2, 1, ["authors"]);
  const refused = await prepareConfigurationSynchronization({
    models: noBlockBump.content,
    state: source,
  });
  expect(refused.plan.diagnostics).toMatchObject([{ code: "BLOCK_DEFINITION_CHANGE_HAS_BLOCKS" }]);

  const versioned = await make(2, 2, ["authors"]);
  expect(planConfigurationSyncScans({ models: versioned.content, storedModels })).toMatchObject([
    {
      modelKey: "posts",
      changes: [
        { kind: "block-definition-changed", class: "migration", version: { from: 1, to: 2 } },
      ],
      blockFields: { authorCard: { author: { models: ["authors"] } } },
      migrations: [{ type: "authorCard", version: 2 }],
    },
  ]);
});

test.each([
  [textAuthor, "author", relatedAuthor],
  [field.url(), "author", relatedAuthor],
  [textAuthor, "authorEntry", field.reference({ models: ["authors"], renamedFrom: "author" })],
] as const)(
  "refuses conversion from a populated %s field to a reference",
  async (original, key, changed) => {
    const before = await config(posts(1, { author: original }));
    const after = await config(posts(2, { [key]: changed }));
    const prepared = await prepareConfigurationSynchronization({
      models: after.content,
      state: port(
        before.content.map((model) => storedFrom(model)),
        [snapshot(1, "draft", { author: "Ada" })],
      ),
    });
    expect(prepared.plan).toMatchObject({
      isValid: false,
      diagnostics: [{ code: "FIELD_TYPE_CHANGED", fieldKey: key, changeClass: "breaking" }],
    });
  },
);

test("text-author migration adds an independent selection and retires text with an explicit hint", async () => {
  const baseline = await config(posts(1, { author: textAuthor }));
  const storedModels = baseline.content.map((model) => storedFrom(model));
  const expanded = await config(posts(2, { author: textAuthor, authorEntry: relatedAuthor }));
  const add = planConfigurationSynchronization({ models: expanded.content, storedModels });
  expect(add).toMatchObject({
    isValid: true,
    operations: [
      {
        action: "version-update",
        evolution: {
          changes: [{ class: "compatible", kind: "field-added", target: "authorEntry" }],
        },
      },
    ],
  });
  expect(configurationSyncContentWrites(add.operations[0]!, expanded.content[0]!)).toEqual([]);

  const migrated = { author: "Ada", authorEntry: "people/Ada" };
  const draft = snapshot(1, "draft", migrated);
  const published = snapshot(2, "published", migrated);
  const retired = await config(
    defineCollection({
      key: "posts",
      version: 3,
      fields: { authorEntry: relatedAuthor },
      removedFields: ["author"],
    }),
  );
  const prepared = await prepareConfigurationSynchronization({
    models: retired.content,
    state: port(
      expanded.content.map((model) => storedFrom(model)),
      [draft, published],
    ),
  });
  expect(prepared.plan).toMatchObject({
    isValid: true,
    operations: [
      {
        action: "version-update",
        evolution: {
          changes: [
            { class: "destructive", kind: "field-removed", target: "author", hinted: true },
          ],
        },
      },
    ],
  });
  const operation = prepared.plan.operations[0]!;
  expect(configurationSyncContentWrites(operation, retired.content[0]!)).toEqual([
    { action: "remove-field", fieldKey: "author" },
  ]);
  expect(operation.action).toBe("version-update");
  if (operation.action !== "version-update") throw new Error("Missing schema update");
  expect(
    configurationSyncSnapshotRewrites(
      retired.content[0]!.fields,
      operation.evolution!.changes,
      [draft, published].map(({ snapshotId: id, fields, state }) => ({ id, fields, state })),
    ),
  ).toEqual([
    { id: draft.snapshotId, fields: { authorEntry: "people/Ada" }, references: [] },
    { id: published.snapshotId, fields: { authorEntry: "people/Ada" }, references: [] },
  ]);
});
