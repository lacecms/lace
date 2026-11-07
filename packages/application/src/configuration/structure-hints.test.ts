import { expect, test } from "vitest";
import { defineCollection, defineConfig } from "@lacecms/config";
import { defineBlock, field } from "@lacecms/content";
import {
  configurationSyncAdvancesPublicState,
  configurationSyncContentWrites,
  diffContentModelStructures,
  planConfigurationSynchronization,
  validateStructureHints,
} from "../index.js";
import { posts, storedFrom } from "../test-support/configuration-fixtures.js";
import type { NormalizedContentModel } from "@lacecms/config";
import type { EmbedProvider } from "@lacecms/content";
import type { StoredContentModelState } from "./types.js";

test("schema hint lookup uses own field keys even for constructor", async () => {
  const before = await posts({ fields: { title: field.text() } });
  expect(
    validateStructureHints(before.structure, { renamedFields: { constructor: "title" } }),
  ).toEqual([]);
  expect(
    validateStructureHints(before.structure, { renamedFields: { missing: "constructor" } }),
  ).toEqual([{ target: "missing", from: "constructor", kind: "source-missing" }]);
});

test("itemLabel sync is projection-only without content writes or version changes", async () => {
  const make = (itemLabel: string) =>
    posts({
      fields: {
        cards: field.list({
          itemLabel,
          item: field.group({ fields: { title: field.text(), caption: field.text() } }),
        }),
      },
    });
  const before = await make("title"),
    after = await make("caption");
  const plan = planConfigurationSynchronization({
    models: [after],
    storedModels: [storedFrom(before)],
  });
  expect(plan.isValid).toBe(true);
  expect(
    plan.operations.flatMap((operation) => configurationSyncContentWrites(operation, after)),
  ).toEqual([]);
  expect(after.structureHash).toBe(before.structureHash);
  expect(after.projectionHash).not.toBe(before.projectionHash);
});

test("CE9B model and nested layouts plan no content writes", async () => {
  const make = (label: string) =>
    posts({
      fields: {
        nested: field.group({
          fields: { title: field.text() },
          layout: { mode: "tabs", groups: [{ key: "main", label, fields: ["title"] }] },
        }),
      },
      layout: { mode: "sections", groups: [{ key: "main", label, fields: ["nested"] }] },
    });
  const before = await make("Before"),
    after = await make("After");
  const plan = planConfigurationSynchronization({
    models: [after],
    storedModels: [storedFrom(before)],
  });
  expect(plan.isValid).toBe(true);
  expect(
    plan.operations.flatMap((operation) => configurationSyncContentWrites(operation, after)),
  ).toEqual([]);
  expect(after.structureHash).toBe(before.structureHash);
});

test("select card presentation plans display updates without content writes", async () => {
  const make = (label: string) =>
    posts({
      fields: {
        nested: field.list({
          item: field.group({
            fields: {
              pick: field.select({
                options: ["a"],
                presentation: { control: "cards", choices: [{ value: "a", label }] },
              }),
            },
          }),
        }),
      },
    });
  const before = await make("Before"),
    after = await make("After");
  const plan = planConfigurationSynchronization({
    models: [after],
    storedModels: [storedFrom(before)],
  });
  expect(plan.isValid).toBe(true);
  expect(
    plan.operations.flatMap((operation) => configurationSyncContentWrites(operation, after)),
  ).toEqual([]);
  expect(after.structureHash).toBe(before.structureHash);
  expect(after.projectionHash).not.toBe(before.projectionHash);
});

test("setting visibility changes plan display-only metadata without content writes", async () => {
  const make = async (values: string[]) =>
    (
      await defineConfig({
        blocks: [
          defineBlock({
            type: "conditional",
            version: 1,
            fields: {},
            settings: {
              mode: field.select({ options: ["a", "b"], required: true, defaultValue: "a" }),
              wrap: field.boolean({ defaultValue: true }),
            },
            settingsVisibility: { wrap: { setting: "mode", values } },
          }),
        ],
        content: [
          defineCollection({
            key: "posts",
            version: 1,
            route: "/posts/:slug",
            blocks: ["conditional"],
          }),
        ],
      })
    ).runtime.content[0]!;
  const before = await make(["a"]),
    after = await make(["b"]);
  const plan = planConfigurationSynchronization({
    models: [after],
    storedModels: [storedFrom(before)],
  });
  expect(plan.isValid).toBe(true);
  expect(
    plan.operations.flatMap((operation) => configurationSyncContentWrites(operation, after)),
  ).toEqual([]);
  expect(after.structureHash).toBe(before.structureHash);
  expect(after.projectionHash).not.toBe(before.projectionHash);
});

test("embed restrictions classify narrowing as breaking at root and nested paths", async () => {
  for (const nested of [false, true]) {
    const descriptor = (providers: readonly EmbedProvider[] | undefined, required = false) => {
      const url = field.url({
        ...(providers === undefined ? {} : { embedProviders: providers }),
        required,
      });
      return nested ? field.list({ item: field.group({ fields: { url } }) }) : url;
    };
    for (const [before, after, expected] of [
      [undefined, ["vimeo"], "breaking"],
      [["youtube", "vimeo"], ["vimeo"], "breaking"],
      [["vimeo"], ["youtube", "vimeo"], "compatible"],
      [["vimeo"], undefined, "compatible"],
    ] as const) {
      const baseline = await posts({ fields: { clip: descriptor(before) } });
      const target = await posts({ fields: { clip: descriptor(after) }, version: 2 });
      expect(diffContentModelStructures(baseline.structure, target.structure)).toContainEqual(
        expect.objectContaining({
          class: expected,
          kind: "field-changed",
          properties: ["embedProviders"],
        }),
      );
    }
    const baseline = await posts({ fields: { clip: descriptor(undefined, true) } });
    const target = await posts({ fields: { clip: descriptor(["vimeo"], false) }, version: 2 });
    expect(diffContentModelStructures(baseline.structure, target.structure)).toContainEqual(
      expect.objectContaining({ class: "breaking", properties: ["embedProviders", "required"] }),
    );
  }
});

test("query identity classifies trusted, legacy and mixed public changes", async () => {
  const before = await posts();
  const after = await posts({ listOptions: { searchableFields: ["summary"] } });
  const plan = (current: NormalizedContentModel, stored: StoredContentModelState) =>
    planConfigurationSynchronization({ models: [current], storedModels: [stored] });
  for (const [current, stored] of [
    [after, storedFrom(before)],
    [before, storedFrom(after)],
    [
      after,
      storedFrom(before, {
        publicProjectionHash: undefined,
        publicProjectionSourceHash: undefined,
      }),
    ],
  ] as const) {
    const result = plan(current, stored);
    expect(result.operations).toMatchObject([
      { action: "label-update", affectsPublicProjection: false },
    ]);
    expect(configurationSyncAdvancesPublicState(result)).toBe(false);
    expect(
      result.operations.flatMap((operation) => configurationSyncContentWrites(operation, current)),
    ).toEqual([]);
  }
  const unknown = storedFrom(before, {
    projectionHash: "unknown",
    publicProjectionSourceHash: "stale",
  });
  expect(configurationSyncAdvancesPublicState(plan(after, unknown))).toBe(true);
  const unchanged = plan(after, storedFrom(after, { publicProjectionSourceHash: "stale" }));
  expect(unchanged.operations).toMatchObject([{ action: "record-baseline" }]);
  expect(configurationSyncAdvancesPublicState(unchanged)).toBe(false);
  expect(plan(after, storedFrom(after)).operations).toEqual([]);
  const mixed = await posts({ label: "New label", listOptions: { searchableFields: ["summary"] } });
  expect(configurationSyncAdvancesPublicState(plan(mixed, storedFrom(before)))).toBe(true);
});
