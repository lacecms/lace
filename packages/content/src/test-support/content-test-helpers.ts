// @ts-nocheck
// TODO(rf2): Type recursive descriptor fixtures, malformed runtime inputs and table tuples.
import { expect } from "vitest";
import { defineBlock } from "../blocks/definition.js";
import { field } from "../fields/builders.js";
import { ContentValidationError } from "../shared/errors.js";

export const settingsBlock = defineBlock({
  fields: { heading: field.text({ required: true }) },
  settings: {
    align: field.select({ defaultValue: "left", options: ["left", "center"] }),
    boxed: field.boolean({ defaultValue: false }),
  },
  type: "panel",
  version: 1,
});

export function issueFrom(run) {
  try {
    run();
    throw new Error("expected validation failure");
  } catch (error) {
    expect(error).toBeInstanceOf(ContentValidationError);
    return error.issues[0];
  }
}
