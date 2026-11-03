// @ts-nocheck
// TODO(rf2): Type recursive descriptor fixtures, malformed runtime inputs and table tuples.
import { test, expect, describe, it } from "vitest";
import {
  defineBlock,
  validateBlockData,
  toBlockMetadata,
  BlockConfigurationError,
  migrateBlockData,
  BlockMigrationError,
  validateBlockSettings,
} from "./definition.js";
import { field } from "../fields/builders.js";
import { settingsBlock } from "../test-support/content-test-helpers.js";
import { builtInBlocks } from "./built-ins.js";

test("defines detached versioned blocks with defaults and metadata", () => {
  const defaults = { eyebrow: "News" };
  const block = defineBlock({
    defaultValue: defaults,
    fields: {
      eyebrow: field.text(),
      heading: field.text({ required: true }),
    },
    label: "Hero",
    type: "hero",
    version: 1,
  });
  defaults.eyebrow = "Changed";

  expect(validateBlockData(block, { heading: "Lace" }, "publish")).toEqual({
    eyebrow: "News",
    heading: "Lace",
  });
  expect(block.validate({ heading: "Lace" }, "publish")).toEqual({
    eyebrow: "News",
    heading: "Lace",
  });
  expect(toBlockMetadata(block)).toEqual({
    defaultValue: { eyebrow: "News" },
    fields: {
      eyebrow: { required: false, type: "text" },
      heading: { required: true, type: "text" },
    },
    label: "Hero",
    type: "hero",
    version: 1,
  });
  expect(JSON.stringify(toBlockMetadata(block))).not.toContain("validate");
  expect(Object.isFrozen(block)).toBe(true);
  expect(Object.isFrozen(block.fields)).toBe(true);

  expect(() => defineBlock({ fields: {}, type: "bad_type", version: 1 })).toThrow(
    BlockConfigurationError,
  );
  expect(() => defineBlock({ fields: {}, type: "hero", version: 0 })).toThrow(
    BlockConfigurationError,
  );
  expect(() =>
    defineBlock({ defaultValue: { missing: true }, fields: {}, type: "hero", version: 1 }),
  ).toThrow(BlockConfigurationError);
});

function quoteV3(migrations) {
  return defineBlock({
    fields: { attribution: field.text(), text: field.text({ required: true }) },
    migrations,
    type: "quote",
    version: 3,
  });
}

test("defines runtime-only block migrations outside metadata", () => {
  const plain = defineBlock({
    fields: { attribution: field.text(), text: field.text({ required: true }) },
    type: "quote",
    version: 3,
  });
  const migrated = quoteV3({
    2: ({ data: { body, ...rest } }) => ({ data: { ...rest, quote: body } }),
    3: ({ data: { quote, ...rest }, settings }) => ({ data: { ...rest, text: quote }, settings }),
  });
  expect(toBlockMetadata(migrated)).toEqual(toBlockMetadata(plain));
  expect(Object.keys(migrated.migrations)).toEqual(["2", "3"]);
  expect(Object.isFrozen(migrated.migrations)).toBe(true);
  expect(JSON.stringify(toBlockMetadata(migrated))).not.toContain("migrations");
  expect(plain).not.toHaveProperty("migrations");

  const v1 = { data: { attribution: "Ada", body: "Hello" }, settings: { tone: "dark" } };
  expect(migrateBlockData(migrated, v1, 1)).toEqual({
    data: { attribution: "Ada", text: "Hello" },
    settings: { tone: "dark" },
  });
  expect(migrateBlockData(migrated, { data: { quote: "Hi" }, settings: {} }, 2)).toEqual({
    data: { text: "Hi" },
    settings: {},
  });
  expect(migrateBlockData(migrated, { data: { text: "Same" }, settings: {} }, 3)).toEqual({
    data: { text: "Same" },
    settings: {},
  });
  expect(v1).toEqual({ data: { attribution: "Ada", body: "Hello" }, settings: { tone: "dark" } });

  for (const [migrations, key] of [
    [{ 4: () => ({}) }, "migrations.4"],
    [{ 1: () => ({}), 2: () => ({}), 3: () => ({}) }, "migrations.1"],
    [{ 2: () => ({}) }, "current version 3"],
    [{ "02": () => ({}), 3: () => ({}) }, "migrations.02"],
    [{ 3: "nope" }, "migrations.3"],
  ]) {
    expect(() => quoteV3(migrations)).toThrow(BlockConfigurationError);
    expect(() => quoteV3(migrations)).toThrow(key);
  }
  expect(() =>
    defineBlock({
      fields: {},
      migrations: { 2: () => ({}), 4: () => ({}) },
      type: "gap",
      version: 4,
    }),
  ).toThrow("migrations.3 is missing");
  expect(() =>
    defineBlock({ fields: {}, migrations: { 2: () => ({}) }, type: "one", version: 1 }),
  ).toThrow(BlockConfigurationError);
});

test("fails block migration composition with stable codes", () => {
  const onlyThree = quoteV3({ 3: (block) => block });
  const stored = (data) => ({ data, settings: {} });
  const missing = (() => {
    try {
      migrateBlockData(onlyThree, stored({ text: "x" }), 1);
    } catch (error) {
      return error;
    }
  })();
  expect(missing).toBeInstanceOf(BlockMigrationError);
  expect(missing).toMatchObject({
    blockType: "quote",
    code: "missing_step",
    fromVersion: 1,
    toVersion: 3,
  });
  expect(() => migrateBlockData(onlyThree, stored({ text: "x" }), 4)).toThrow(
    expect.objectContaining({ code: "version_ahead" }),
  );
  const input = stored({ text: "x" });
  expect(() =>
    migrateBlockData(
      quoteV3({
        3: (block) => {
          block.data.text = "mutated";
          return block;
        },
      }),
      input,
      2,
    ),
  ).toThrow(expect.objectContaining({ code: "migration_failed", step: 3 }));
  expect(input).toEqual(stored({ text: "x" }));
  for (const result of [
    [],
    Promise.resolve({ data: {} }),
    { data: { fn: () => 1 } },
    { data: { n: Number.NaN } },
    null,
    { text: "x" },
    { data: [] },
    { data: {}, settings: [] },
    { data: {}, extra: true },
  ]) {
    expect(() => migrateBlockData(quoteV3({ 3: () => result }), stored({ text: "x" }), 2)).toThrow(
      expect.objectContaining({ code: "invalid_result", step: 3 }),
    );
  }
});

test("migrations carry, rename and keep block settings", () => {
  const renamed = quoteV3({
    3: ({ data, settings: { tone, ...rest } }) => ({ data, settings: { ...rest, theme: tone } }),
  });
  expect(migrateBlockData(renamed, { data: { text: "x" }, settings: { tone: "dark" } }, 2)).toEqual(
    { data: { text: "x" }, settings: { theme: "dark" } },
  );
  const dataOnly = quoteV3({ 3: ({ data }) => ({ data: { ...data, attribution: "Ada" } }) });
  expect(
    migrateBlockData(dataOnly, { data: { text: "x" }, settings: { align: "center" } }, 2),
  ).toEqual({ data: { attribution: "Ada", text: "x" }, settings: { align: "center" } });
});

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
      expect(toBlockMetadata(builtIn).settings.lightbox).toEqual(lightbox);
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
    expect(() => defineBlock({ fields: {}, settings, type: "bad", version: 1 })).toThrow(message);
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
  const make = (visibility = rule(), fields = settings()) =>
    defineBlock({
      type: "custom",
      version: 1,
      fields: {},
      settings: fields,
      settingsVisibility: visibility,
    });
  it("detaches/freeze/round trips without altering authored settings", () => {
    const input = rule();
    const block = make(input);
    input.wrap.values.push("b");
    expect(block.settingsVisibility.wrap.values).toEqual(["a"]);
    expect(Object.isFrozen(block.settingsVisibility.wrap.values)).toBe(true);
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
    expect(() => field.group({ fields: {}, settingsVisibility: rule() })).toThrow();
    expect(() => field.boolean({ settingsVisibility: rule() })).toThrow();
  });
});
