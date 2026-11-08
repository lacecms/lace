import { test, expect } from "vitest";
import { defineBlock, validateBlockData, toBlockMetadata } from "./definition.js";
import { BlockConfigurationError } from "./errors.js";
import { field } from "../fields/builders.js";

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
