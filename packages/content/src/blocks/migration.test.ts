import { test, expect } from "vitest";
import { defineBlock, toBlockMetadata } from "./definition.js";
import { BlockConfigurationError } from "./errors.js";
import { migrateBlockData, BlockMigrationError } from "./migration.js";
import type { BlockMigrations } from "./types.js";
import type { JsonObject } from "../shared/json.js";
import { field } from "../fields/builders.js";

function quoteV3(migrations: BlockMigrations) {
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
    2: ({ data: { body, ...rest } }) => ({ data: { ...rest, quote: body! } }),
    3: ({ data: { quote, ...rest }, settings }) => ({ data: { ...rest, text: quote! }, settings }),
  });
  expect(toBlockMetadata(migrated)).toEqual(toBlockMetadata(plain));
  expect(Object.keys(migrated.migrations!)).toEqual(["2", "3"]);
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
    expect(() => quoteV3(migrations as unknown as BlockMigrations)).toThrow(
      BlockConfigurationError,
    );
    expect(() => quoteV3(migrations as unknown as BlockMigrations)).toThrow(key);
  }
  expect(() =>
    defineBlock({
      fields: {},
      migrations: { 2: () => ({}), 4: () => ({}) } as unknown as BlockMigrations,
      type: "gap",
      version: 4,
    }),
  ).toThrow("migrations.3 is missing");
  expect(() =>
    defineBlock({
      fields: {},
      migrations: { 2: () => ({}) } as unknown as BlockMigrations,
      type: "one",
      version: 1,
    }),
  ).toThrow(BlockConfigurationError);
});

test("fails block migration composition with stable codes", () => {
  const onlyThree = quoteV3({ 3: (block) => block });
  const stored = (data: JsonObject) => ({ data, settings: {} });
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
          (block.data as { text: string }).text = "mutated";
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
    expect(() =>
      migrateBlockData(
        quoteV3({ 3: () => result } as unknown as BlockMigrations),
        stored({ text: "x" }),
        2,
      ),
    ).toThrow(expect.objectContaining({ code: "invalid_result", step: 3 }));
  }
});

test("migrations carry, rename and keep block settings", () => {
  const renamed = quoteV3({
    3: ({ data, settings: { tone, ...rest } }) => ({ data, settings: { ...rest, theme: tone! } }),
  });
  expect(migrateBlockData(renamed, { data: { text: "x" }, settings: { tone: "dark" } }, 2)).toEqual(
    { data: { text: "x" }, settings: { theme: "dark" } },
  );
  const dataOnly = quoteV3({ 3: ({ data }) => ({ data: { ...data, attribution: "Ada" } }) });
  expect(
    migrateBlockData(dataOnly, { data: { text: "x" }, settings: { align: "center" } }, 2),
  ).toEqual({ data: { attribution: "Ada", text: "x" }, settings: { align: "center" } });
});
