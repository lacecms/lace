import { describe, it, expect, test } from "vitest";
import { field } from "./builders.js";
import type { FieldDefinition, FormLayout } from "./definitions.js";
import { toFieldMetadata } from "./metadata.js";
import { defineBlock, toBlockMetadata } from "../blocks/definition.js";

describe("visual form layout metadata", () => {
  const fields = { title: field.text(), body: field.textarea() };
  const layout = {
    mode: "tabs" as const,
    groups: [{ key: "main", label: "Main", fields: ["body" as "body" | "title"] }],
  };
  it("retains detached recursive layouts without changing values", () => {
    const input = structuredClone(layout);
    const group = field.group({ fields, layout: input });
    if (!input.groups[0]) throw new Error("Expected layout group");
    input.groups[0].fields[0] = "title";
    expect(toFieldMetadata(group)).toMatchObject({ layout });
    expect(field.list({ item: group }).item).toMatchObject({ layout });
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
    expect(Object.isFrozen(group.layout.groups[0]?.fields)).toBe(true);
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
    // Intentionally pass forged layout input to runtime validation.
    expect(() =>
      field.group({ fields, layout: invalid as FormLayout<"title" | "body"> }),
    ).toThrow();
  });
  it("rejects layout on scalar/list descriptors and cross-owner settings", () => {
    // Exercise rejection of unsupported properties at the runtime boundary.
    const scalarOptions = { layout, required: false };
    expect(() => field.text(scalarOptions)).toThrow();
    expect(() => field.list({ item: field.text(), layout })).toThrow();
    expect(() =>
      defineBlock({ type: "layoutTest", version: 1, fields, settingsLayout: layout }),
    ).toThrow();
  });
});

test("layouts survive the maximum six-container branch", () => {
  const nested = (remaining: number): FieldDefinition =>
    field.list({
      item: field.group({
        fields: { child: remaining === 1 ? field.text() : nested(remaining - 1) },
        layout: { mode: "tabs", groups: [{ key: "main", label: "Main", fields: ["child"] }] },
      }),
    });
  const root = toFieldMetadata(nested(3));
  const leaf = { layout: { groups: [{ fields: ["child"] }] } };
  const middle = { item: { fields: { child: { item: leaf } } } };
  expect(root).toMatchObject({ item: { fields: { child: middle } } });
});
