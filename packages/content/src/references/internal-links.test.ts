// @ts-nocheck
// TODO(rf2): Type recursive descriptor fixtures, malformed runtime inputs and table tuples.
import { describe, test, expect } from "vitest";
import { field } from "../fields/builders.js";
import { defineBlock } from "../blocks/definition.js";
import { defineBlockRegistry } from "../blocks/registry.js";
import { validateEntryAggregate } from "../entries/aggregate.js";
import { collectSnapshotInternalLinks, collectFieldInternalLinks } from "./internal-links.js";
import { issueFrom } from "../test-support/content-test-helpers.js";
import { validateModelFields } from "../fields/validation.js";

describe("descriptor-driven internal link projection", () => {
  const links = field.list({ item: field.url() });
  const block = defineBlock({
    type: "linkFixture",
    version: 1,
    fields: {
      links,
      destination: field.url({ defaultValue: "entry:default" }),
      text: field.text(),
    },
    settings: { note: field.text({ defaultValue: "entry:ignored" }) },
  });
  const model = { kind: "global", blocks: [block.type], fields: { links } };
  const registry = defineBlockRegistry([block]);
  const payload = (count) => ({
    kind: "global",
    title: "Links",
    fields: { links: Array(100).fill("entry:same") },
    blocks: [
      {
        key: "links",
        type: block.type,
        schemaVersion: 1,
        hidden: true,
        data: { links: Array(count).fill("entry:same"), text: "entry:ignored" },
      },
    ],
  });
  test.each(["draft", "publish"])("counts defaults and hidden occurrences in %s", (mode) => {
    const normalized = validateEntryAggregate(payload(99), model, registry, mode);
    const references = collectSnapshotInternalLinks(
      model.fields,
      normalized.fields,
      normalized.blocks.map((item) => ({ ...item, fields: block.fields })),
    );
    expect(references).toHaveLength(200);
    expect(references[0]).toEqual({
      area: "fields",
      sourceKey: "$fields",
      pointer: "/links/0",
      delivered: true,
      targetId: "same",
    });
    expect(references[199]).toEqual({
      area: "data",
      sourceKey: "links",
      pointer: "/destination",
      delivered: false,
      targetId: "default",
    });
    expect(
      issueFrom(() => validateEntryAggregate(payload(100), model, registry, mode)),
    ).toMatchObject({
      code: "too_many_internal_links",
      path: ["blocks", 0, "data", "destination"],
    });
    expect(Object.isFrozen(references[0])).toBe(true);
  });
  test("walks normalized nested defaults and preserves exact item paths", () => {
    const fields = {
      group: field.group({
        defaultValue: {},
        fields: {
          links: field.list({
            defaultValue: [{}, { url: "entry:a%2Fb" }],
            item: field.group({
              fields: {
                url: field.url({ defaultValue: "entry:default" }),
                text: field.text({ defaultValue: "entry:ignored" }),
              },
            }),
          }),
        },
      }),
    };
    const values = validateModelFields(fields, {}, "publish");
    expect(collectFieldInternalLinks(fields, values)).toEqual([
      { path: ["group", "links", 0, "url"], targetId: "default" },
      { path: ["group", "links", 1, "url"], targetId: "a/b" },
    ]);
    expect(collectSnapshotInternalLinks(fields, values, []).map((ref) => ref.pointer)).toEqual([
      "/group/links/0/url",
      "/group/links/1/url",
    ]);
  });
  test("ignores text, rich-text text, manual URLs, providers and settings", () => {
    const fields = {
      text: field.text(),
      body: field.richText(),
      manual: field.url(),
      provider: field.url({ embedProviders: ["youtube"] }),
    };
    expect(
      collectFieldInternalLinks(fields, {
        text: "entry:ignored",
        manual: "/entry:ignored",
        body: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "entry:ignored" }] }],
        },
        provider: "https://youtu.be/abcdef12345",
      }),
    ).toEqual([]);
    expect(() =>
      defineBlock({
        type: "badSettings",
        version: 1,
        fields: {},
        settings: { url: field.url({ defaultValue: "entry:target" }) },
      }),
    ).toThrow();
  });
});
