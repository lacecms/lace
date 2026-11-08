import { test, expect, describe, it } from "vitest";
import { defineBlock, toBlockMetadata, validateBlockSettings } from "./definition.js";
import type { SettingsVisibility } from "./types.js";
import type { ModelFieldDefinitions } from "../fields/definitions.js";
import { field } from "../fields/builders.js";
import { settingsBlock } from "../test-support/content-test-helpers.js";
import { builtInBlocks } from "./built-ins.js";

test("declares block settings with defaults in metadata only when present", () => {
  expect(toBlockMetadata(settingsBlock).settings).toEqual({
    align: { defaultValue: "left", options: ["left", "center"], required: false, type: "select" },
    boxed: { defaultValue: false, required: false, type: "boolean" },
  });
  const none = defineBlock({ fields: {}, settings: {}, type: "plain", version: 1 });
  expect(toBlockMetadata(none)).not.toHaveProperty("settings");
  expect(none).not.toHaveProperty("settings");
  expect(toBlockMetadata(none)).toEqual(
    toBlockMetadata(defineBlock({ fields: {}, type: "plain", version: 1 })),
  );
  const lightbox = {
    defaultValue: false,
    description: "Opens the original image full screen when it is selected.",
    label: "Open full screen",
    required: false,
    type: "boolean",
  };
  for (const [type, builtIn] of Object.entries(builtInBlocks)) {
    if (type === "gallery" || type === "image")
      expect(toBlockMetadata(builtIn).settings!.lightbox).toEqual(lightbox);
    else if (type !== "link" && type !== "videoEmbed")
      expect(toBlockMetadata(builtIn)).not.toHaveProperty("settings");
  }
  for (const [settings, message] of [
    [{ image: field.media({ defaultValue: "m" }) }, "settings.image must be a select"],
    [{ body: field.textarea({ defaultValue: "x" }) }, "settings.body must be a select"],
    [{ link: field.url({ defaultValue: "https://a.dev" }) }, "settings.link must be a select"],
    [{ on: field.date({ defaultValue: "2026-01-01" }) }, "settings.on must be a select"],
    [{ size: field.number() }, "settings.size must declare a defaultValue"],
    [
      { tone: field.text({ defaultValue: "x", renamedFrom: "theme" }) },
      "settings.tone must not declare renamedFrom",
    ],
    [{ "1bad": field.boolean({ defaultValue: true }) }, "settings.1bad must be a valid field key"],
    ["nope", "settings must be a plain object"],
  ]) {
    expect(() =>
      defineBlock({
        fields: {},
        settings: settings as ModelFieldDefinitions,
        type: "bad",
        version: 1,
      }),
    ).toThrow(message);
  }
  expect(validateBlockSettings(settingsBlock, { boxed: true })).toEqual({
    align: "left",
    boxed: true,
  });
});

describe("bounded scalar setting visibility", () => {
  const settings = () => ({
    mode: field.select({ options: ["a", "b"], required: true, defaultValue: "a" }),
    wrap: field.boolean({ defaultValue: true }),
    preset: field.text({ defaultValue: "auto" }),
  });
  const rule = () => ({ wrap: { setting: "mode", values: ["a"] } });
  const make = (visibility: unknown = rule(), fields: ModelFieldDefinitions = settings()) =>
    defineBlock({
      type: "custom",
      version: 1,
      fields: {},
      settings: fields,
      settingsVisibility: visibility as SettingsVisibility,
    });
  it("detaches/freeze/round trips without altering authored settings", () => {
    const input = rule();
    const block = make(input);
    input.wrap.values.push("b");
    expect(block.settingsVisibility!.wrap!.values).toEqual(["a"]);
    expect(Object.isFrozen(block.settingsVisibility!.wrap!.values)).toBe(true);
    const metadata = toBlockMetadata(block);
    expect(toBlockMetadata(defineBlock(JSON.parse(JSON.stringify(metadata))))).toEqual(metadata);
    expect(validateBlockSettings(block, {})).toEqual({ mode: "a", wrap: true, preset: "auto" });
    expect(defineBlock({ type: "plain", version: 1, fields: {} })).not.toHaveProperty(
      "settingsVisibility",
    );
  });
  it.each([
    { missing: { setting: "mode", values: ["a"] } },
    { wrap: { setting: "missing", values: ["a"] } },
    { wrap: { setting: "wrap", values: ["a"] } },
    { wrap: { setting: "preset", values: ["auto"] } },
    { wrap: { setting: "mode", values: [] } },
    { wrap: { setting: "mode", values: ["a", "a"] } },
    { wrap: { setting: "mode", values: ["other"] } },
    { wrap: { setting: "mode", values: [true] } },
    { wrap: { setting: "mode", values: ["a"], extra: true } },
    { wrap: { setting: "mode", values: ["a"] }, mode: { setting: "preset", values: ["auto"] } },
    { wrap: { setting: "mode", values: ["a"] }, mode: { setting: "wrap", values: ["a"] } },
    { wrap: { setting: "mode", values: [() => "a"] } },
  ])("rejects malformed rules with descriptor paths", (input) =>
    expect(() => make(input)).toThrow(/settingsVisibility/),
  );
  it("requires an unconditional required select with a valid default", () => {
    expect(() =>
      make(rule(), {
        ...settings(),
        mode: field.select({ options: ["a", "b"], defaultValue: "a" }),
      }),
    ).toThrow(/settingsVisibility.wrap.setting/);
    expect(() =>
      make(rule(), { ...settings(), mode: field.boolean({ defaultValue: true }) }),
    ).toThrow(/settingsVisibility.wrap.setting/);
    expect(() =>
      field.group({ fields: {}, ...({ settingsVisibility: rule() } as object) }),
    ).toThrow();
    expect(() => field.boolean({ settingsVisibility: rule() } as unknown as {})).toThrow();
  });
});
