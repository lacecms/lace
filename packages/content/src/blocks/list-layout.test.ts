// @ts-nocheck
// TODO(rf2): Type recursive descriptor fixtures, malformed runtime inputs and table tuples.
import { test, expect } from "vitest";
import { defineBlock, validateBlockData, validateBlockSettings } from "./definition.js";
import { builtInBlocks } from "./built-ins.js";
import { listLayoutSettings } from "./list-layout.js";
import { field } from "../fields/builders.js";
import { issueFrom } from "../test-support/content-test-helpers.js";

test("list settings are fresh ordinary scalars reusable by any block", async () => {
  const { listLayoutSettings } = await import("./list-layout.js");
  const settings = listLayoutSettings();
  expect(listLayoutSettings()).not.toBe(settings);
  expect(Object.isFrozen(settings)).toBe(true);
  const custom = defineBlock({ type: "cardList", version: 1, fields: {}, settings });
  expect(validateBlockSettings(custom, {}, "draft")).toEqual({
    layoutMode: "grid",
    layoutWrap: true,
    layoutPreset: "auto",
  });
  for (const key of ["layoutMode", "layoutPreset"]) {
    expect(settings[key].presentation.choices).toHaveLength(settings[key].options.length);
    expect(settings[key].presentation.choices.every((c) => c.diagram.cells.length > 0)).toBe(true);
  }
  expect(() =>
    validateBlockSettings(custom, { layoutMode: "flex-row", layoutPreset: "wrong" }, "draft"),
  ).toThrow();
});

test("Gallery and custom lists share visibility without structural setting changes", async () => {
  const { listLayoutSettings, listLayoutSettingsVisibility } = await import("./list-layout.js");
  const visibility = listLayoutSettingsVisibility();
  expect(listLayoutSettingsVisibility()).not.toBe(visibility);
  expect(Object.isFrozen(visibility.layoutWrap.values)).toBe(true);
  const custom = defineBlock({
    type: "cards",
    version: 1,
    fields: {},
    settings: listLayoutSettings(),
    settingsVisibility: visibility,
  });
  expect(custom.settingsVisibility).toEqual(builtInBlocks.gallery.settingsVisibility);
  expect(builtInBlocks.gallery.version).toBe(6);
  expect(validateBlockSettings(custom, {})).toEqual({
    layoutMode: "grid",
    layoutWrap: true,
    layoutPreset: "auto",
  });
});

test("featured-first is no longer a grid preset", async () => {
  const { listLayoutSettings } = await import("./list-layout.js");
  const settings = listLayoutSettings();
  expect(settings.layoutPreset.options).toEqual([
    "auto",
    "columns-2",
    "columns-3",
    "columns-4",
    "narrow-wide",
    "wide-narrow",
  ]);
  const custom = defineBlock({ type: "cardList", version: 1, fields: {}, settings });
  for (const layoutMode of ["grid", "flex-row"])
    expect(
      issueFrom(() => validateBlockSettings(custom, { layoutMode, layoutPreset: "featured-first" }))
        .path,
    ).toEqual(["layoutPreset"]);
});

test("list items adopt the reusable grid placement field", async () => {
  const { listLayoutItemFields } = await import("./list-layout.js");
  const fields = listLayoutItemFields();
  expect(listLayoutItemFields()).not.toBe(fields);
  expect(Object.isFrozen(fields)).toBe(true);
  expect(Object.keys(fields)).toEqual(["placement"]);
  expect(fields.placement).toMatchObject({
    defaultValue: "auto",
    label: "Placement",
    options: ["auto", "full", "start", "end"],
    presentation: { control: "cards" },
    required: true,
    type: "select",
  });
  expect(fields.placement.description).toMatch(/grid/i);
  const { choices } = fields.placement.presentation;
  expect(choices.map((choice) => choice.value)).toEqual(fields.placement.options);
  for (const choice of choices) {
    expect(choice.label.length).toBeGreaterThan(0);
    expect(choice.description.length).toBeGreaterThan(0);
    expect(choice.diagram.cells.length).toBeGreaterThan(0);
  }
  const cardList = defineBlock({
    type: "cardList",
    version: 1,
    fields: {
      cards: field.list({
        item: field.group({ fields: { title: field.text(), ...fields } }),
      }),
    },
    settings: listLayoutSettings(),
  });
  expect(
    validateBlockData(
      cardList,
      { cards: [{ title: "A" }, { title: "B", placement: "end" }] },
      "draft",
    ),
  ).toEqual({
    cards: [
      { title: "A", placement: "auto" },
      { title: "B", placement: "end" },
    ],
  });
  expect(
    issueFrom(() =>
      validateBlockData(cardList, { cards: [{ title: "A" }, { placement: "center" }] }, "draft"),
    ).path,
  ).toEqual(["cards", 1, "placement"]);
});
