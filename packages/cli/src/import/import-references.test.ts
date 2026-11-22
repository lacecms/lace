import type { PackageKeys } from "./import-references.js";
import { describe, expect, test } from "vitest";
import {
  collectReferences,
  placeholderResolver,
  rewriteReferences,
  STRIP,
} from "./import-references.js";

const modelFields = {
  title2: { type: "text" },
  cover: { type: "media" },
  related: { type: "url" },
  body: { type: "richText" },
  links: { type: "list", item: { type: "url" } },
  reviews: { type: "list", item: { type: "reference", models: ["reviews"] } },
  cards: {
    type: "list",
    item: { type: "group", fields: { image: { type: "media" }, href: { type: "url" } } },
  },
};
const blockFields = (type: string) =>
  type === "image" ? { media: { type: "media" }, link: { type: "url" } } : undefined;
const keys: PackageKeys = {
  media: new Set(["hero"]),
  entries: new Map([
    ["about", { key: "pages", kind: "page" }],
    ["contact", { key: "contacts", kind: "collection", route: "/contacts/:slug" }],
    ["settings", { key: "settings", kind: "global" }],
    ["review", { key: "reviews", kind: "collection" }],
  ]),
};

const entry = (
  overrides: Partial<import("./import-format.js").ImportEntry> = {},
): import("./import-format.js").ImportEntry => ({
  key: "home",
  model: "home",
  title: "Home",
  fields: {},
  blocks: [],
  ...overrides,
});

describe("package references", () => {
  test("misplaced, unknown, global and malformed references are located", () => {
    const issues: import("./import-format.js").ImportIssue[] = [];
    const references = collectReferences(
      entry({
        fields: {
          title2: { $media: "hero" },
          cover: { $media: "nope" },
          related: { $entry: "settings" },
          body: { type: "doc", content: [{ $entry: "about" }] },
          links: [{ $entry: "unknown" }, { $entry: "about", extra: 1 }],
        },
        blocks: [
          {
            type: "image",
            data: { media: { $media: "hero" } },
            settings: { x: { $media: "hero" } },
          },
        ],
        seo: { image: { $media: "hero" }, title: { $entry: "about" } },
      }),
      3,
      modelFields,
      blockFields,
      keys,
      issues,
    );
    expect(issues.map((issue) => issue.pointer)).toEqual([
      "/entries/3/fields/title2",
      "/entries/3/fields/cover",
      "/entries/3/fields/related",
      "/entries/3/fields/body/content/0",
      "/entries/3/fields/links/0",
      "/entries/3/fields/links/1",
      "/entries/3/blocks/0/settings/x",
      "/entries/3/seo/title",
    ]);
    expect(references.map(({ kind, key, pointer }) => [kind, key, pointer])).toEqual([
      ["media", "hero", "/entries/3/blocks/0/data/media"],
      ["media", "hero", "/entries/3/seo/image"],
    ]);
  });

  test("marker validation includes references in hidden blocks", () => {
    const issues: import("./import-format.js").ImportIssue[] = [];
    const references = collectReferences(
      entry({
        fields: { related: { $entry: "contact" } },
        blocks: [{ type: "image", hidden: true, data: { link: { $entry: "about" } } }],
      }),
      0,
      modelFields,
      blockFields,
      keys,
      issues,
    );
    expect(issues).toEqual([]);
    expect(references.map((reference) => reference.key)).toEqual(["contact", "about"]);
  });

  test("rewrites to IDs and link tokens, passes literals, strips properties and list elements", () => {
    const source = entry({
      fields: {
        cover: { $media: "hero" },
        related: { $entry: "contact" },
        title2: "entry:literal",
        links: ["https://example.com", { $entry: "contact" }, { $entry: "about" }],
        cards: [{ image: "media-literal", href: { $entry: "contact" } }],
      },
      seo: { image: { $media: "hero" }, title: "T" },
    });
    const resolved = rewriteReferences(source, modelFields, blockFields, (kind, key) =>
      kind === "media" ? "media-1" : key === "contact" ? "entry:abc%2F1" : STRIP,
    );
    expect(resolved.fields).toEqual({
      cover: "media-1",
      related: "entry:abc%2F1",
      title2: "entry:literal",
      links: ["https://example.com", "entry:abc%2F1"],
      cards: [{ image: "media-literal", href: "entry:abc%2F1" }],
    });
    expect(resolved.seo).toEqual({ image: "media-1", title: "T" });
    const stripped = rewriteReferences(source, modelFields, blockFields, () => STRIP);
    expect(stripped.fields).toEqual({
      title2: "entry:literal",
      links: ["https://example.com"],
      cards: [{ image: "media-literal" }],
    });
    expect(source.fields.cover).toEqual({ $media: "hero" });
  });

  test("placeholders are valid identifiers and canonical link tokens", () => {
    expect(placeholderResolver("media", "hero")).toBe("import-media-hero");
    expect(placeholderResolver("entry", "a.b")).toBe("entry:import-entry-a.b");
  });

  test("typed markers accept route-less targets and preserve ordered raw IDs", () => {
    const source = entry({
      fields: {
        reviews: [{ $entry: "review" }, "entry:literal", { $entry: "review" }, { $entry: "about" }],
        related: { $entry: "review" },
      },
    });
    const issues: import("./import-format.js").ImportIssue[] = [];
    const references = collectReferences(source, 0, modelFields, blockFields, keys, issues);
    expect(references.map(({ kind, key }) => [kind, key])).toEqual([
      ["reference", "review"],
      ["reference", "review"],
    ]);
    expect(issues.map(({ pointer }) => pointer)).toEqual([
      "/entries/0/fields/reviews/3",
      "/entries/0/fields/related",
    ]);
    expect(
      rewriteReferences(source, modelFields, blockFields, (kind, key) =>
        kind === "reference" && key === "review" ? "abc/1" : STRIP,
      ).fields,
    ).toEqual({ reviews: ["abc/1", "entry:literal", "abc/1"] });
  });
});
