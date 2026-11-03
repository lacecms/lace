// @ts-nocheck
// TODO(rf2): Type recursive descriptor fixtures, malformed runtime inputs and table tuples.
import { describe, it, expect, test } from "vitest";
import { field, toFieldMetadata } from "./builders.js";
import { defineBlock, toBlockMetadata } from "../blocks/definition.js";

describe("visual form layout metadata", () => {
  const fields = { title: field.text(), body: field.textarea() };
  const layout = { mode: "tabs", groups: [{ key: "main", label: "Main", fields: ["body"] }] };
  it("retains detached recursive layouts without changing values", () => {
    const input = structuredClone(layout);
    const group = field.group({ fields, layout: input });
    input.groups[0].fields[0] = "title";
    expect(toFieldMetadata(group).layout).toEqual(layout);
    expect(field.list({ item: group }).item.layout).toEqual(layout);
    const block = defineBlock({
      type: "layoutTest",
      version: 1,
      fields,
      layout,
      settings: { size: field.number({ defaultValue: 1 }) },
      settingsLayout: {
        mode: "sections",
        groups: [{ key: "style", label: "Style", fields: ["size"] }],
      },
    });
    expect(toBlockMetadata(block).layout).toEqual(layout);
    expect(Object.isFrozen(group.layout.groups[0].fields)).toBe(true);
  });
  it.each([
    { mode: "other", groups: layout.groups },
    { mode: ["tabs"], groups: layout.groups },
    { mode: "tabs", groups: [] },
    { ...layout, extra: true },
    { mode: "tabs", groups: [{ key: "main", label: " ", fields: ["body"] }] },
    { mode: "tabs", groups: [{ key: "main", label: "Main", fields: [] }] },
    { mode: "tabs", groups: [{ key: "main", label: "Main", fields: ["profile.title"] }] },
    { mode: "tabs", groups: [{ key: "main", label: "Main", fields: ["body", "body"] }] },
    { mode: "tabs", groups: [...layout.groups, ...layout.groups] },
  ])("rejects invalid placement %j", (invalid) => {
    expect(() => field.group({ fields, layout: invalid })).toThrow();
  });
  it("rejects layout on scalar/list descriptors and cross-owner settings", () => {
    expect(() => field.text({ layout })).toThrow();
    expect(() => field.list({ item: field.text(), layout })).toThrow();
    expect(() =>
      defineBlock({ type: "layoutTest", version: 1, fields, settingsLayout: layout }),
    ).toThrow();
  });
});

test("CE9B layouts survive the maximum six-container branch", () => {
  const nested = (remaining) =>
    field.list({
      item: field.group({
        fields: { child: remaining === 1 ? field.text() : nested(remaining - 1) },
        layout: { mode: "tabs", groups: [{ key: "main", label: "Main", fields: ["child"] }] },
      }),
    });
  const root = toFieldMetadata(nested(3));
  expect(root.item.fields.child.item.fields.child.item.layout.groups[0].fields).toEqual(["child"]);
});
