// @ts-nocheck
// TODO(rf2): Type legacy command fixtures, filesystem helpers and recorded adapter calls.
import { describe, expect, test } from "vitest";
import { modelRuleIssues, parseImportPackage, pointer } from "./import-format.js";

function issues(value) {
  try {
    parseImportPackage(value);
  } catch (error) {
    expect(error.code).toBe("IMPORT_INVALID");
    return error.issues.map((issue) => issue.pointer);
  }
  return [];
}

const entry = (overrides = {}) => ({
  key: "about",
  model: "about",
  title: "About",
  fields: {},
  blocks: [],
  ...overrides,
});
const pkg = (overrides = {}) => ({ formatVersion: 1, media: [], entries: [], ...overrides });

describe("import format v1", () => {
  test("accepts a minimal package and the optional $schema", () => {
    expect(parseImportPackage(pkg({ $schema: "./lace-import.schema.json" })).media).toEqual([]);
  });

  test("an unknown format version is reported alone", () => {
    expect(issues({ formatVersion: 2, media: "nope" })).toEqual(["/formatVersion"]);
    expect(issues([])).toEqual([""]);
  });

  test("duplicate keys and colliding derived block keys are located", () => {
    expect(
      issues(
        pkg({
          media: [
            { key: "hero", file: "a.png" },
            { key: "hero", file: "b.png" },
          ],
          entries: [
            entry({
              blocks: [
                { type: "quote", data: {} },
                { type: "quote", key: "b1", data: {} },
              ],
            }),
            entry(),
          ],
        }),
      ),
    ).toEqual(["/media/1/key", "/entries/1/key", "/entries/0/blocks/1/key"]);
  });

  test("unknown properties, bad keys and limits are structural issues", () => {
    expect(
      issues(
        pkg({
          extra: true,
          media: [{ key: "-bad", file: "a.png", focalPoint: { x: 2, y: 0 } }],
          entries: [entry({ blocks: [{ type: "quote", data: {}, unknown: 1 }] })],
        }),
      ),
    ).toEqual(
      expect.arrayContaining([
        "/extra",
        "/media/0/key",
        "/media/0/focalPoint/x",
        "/entries/0/blocks/0/unknown",
      ]),
    );
  });

  test("model rules require collection slugs and refuse global titles", () => {
    const models = new Map([
      ["posts", { key: "posts", kind: "collection", seo: false }],
      ["about", { key: "about", kind: "page", seo: true }],
      ["settings", { key: "settings", kind: "global", seo: false }],
    ]);
    const parsed = parseImportPackage(
      pkg({
        entries: [
          entry({ key: "post", model: "posts" }),
          entry({ key: "settings", model: "settings" }),
          entry({ key: "about", slug: "about" }),
          entry({ key: "about-2" }),
          entry({ key: "post-seo", model: "posts", slug: "x", seo: {} }),
          entry({ key: "post-dup", model: "posts", slug: "x" }),
          entry({ key: "missing", model: "nope" }),
        ],
      }),
    );
    expect(modelRuleIssues(parsed, models).map((issue) => issue.pointer)).toEqual([
      "/entries/0/slug",
      "/entries/1/title",
      "/entries/2/slug",
      "/entries/3/model",
      "/entries/4/seo",
      "/entries/5/slug",
      "/entries/6/model",
    ]);
  });

  test("route-less collection entries refuse slugs and need no distinct slug", () => {
    const models = new Map([
      ["quotes", { key: "quotes", kind: "collection", routeLess: true, seo: false }],
    ]);
    const parsed = parseImportPackage(
      pkg({
        entries: [
          entry({ key: "q1", model: "quotes", title: "One" }),
          entry({ key: "q2", model: "quotes", title: "Two" }),
          entry({ key: "q3", model: "quotes", slug: "three", title: "Three" }),
        ],
      }),
    );
    expect(modelRuleIssues(parsed, models)).toEqual([
      { pointer: "/entries/2/slug", message: "is not allowed for a collection without a route." },
    ]);
  });

  test("pointers escape slash and tilde", () => {
    expect(pointer("fields", "a/b~c", 0)).toBe("/fields/a~1b~0c/0");
  });
});
