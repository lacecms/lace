// @ts-nocheck
// TODO(rf2): Type recursive descriptor fixtures, malformed runtime inputs and table tuples.
import { test, expect } from "vitest";
import { defineBlock, validateBlockSettings } from "./definition.js";
import { builtInBlocks } from "./built-ins.js";

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
  expect(builtInBlocks.gallery.version).toBe(5);
  expect(Object.keys(builtInBlocks.gallery.migrations)).toEqual(["2", "3", "4", "5"]);
  expect(validateBlockSettings(custom, {})).toEqual({
    layoutMode: "grid",
    layoutWrap: true,
    layoutPreset: "auto",
  });
});
