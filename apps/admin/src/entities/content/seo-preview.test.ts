import type { ContentModelDto } from "@lacecms/contracts";
import { describe, expect, test } from "vitest";
import { seoInheritance } from "./seo-preview.js";

const posts = {
  blocks: [],
  fields: {
    cover: { label: "Cover", required: false, type: "media" },
    excerpt: { label: "Excerpt", required: false, type: "textarea" },
  },
  key: "posts",
  kind: "collection",
  route: "/posts/:slug",
  seo: { description: "excerpt", image: "cover" },
  version: 1,
} as unknown as ContentModelDto;

const home = {
  blocks: [],
  fields: {},
  key: "home",
  kind: "page",
  path: "/",
  seo: { description: null, image: null },
  version: 1,
} as unknown as ContentModelDto;

const noSeo = { canonical: "", description: "", image: null, noindex: false, title: "" };

function inherit(
  overrides: {
    readonly defaults?: Parameters<typeof seoInheritance>[0]["defaults"];
    readonly fields?: Record<string, unknown>;
    readonly model?: ContentModelDto;
    readonly seo?: Partial<typeof noSeo>;
    readonly siteUrl?: string;
    readonly slug?: string;
    readonly title?: string;
  } = {},
) {
  return seoInheritance({
    defaults: overrides.defaults,
    model: overrides.model ?? posts,
    siteUrl: overrides.siteUrl,
    values: {
      fields: overrides.fields ?? {},
      seo: { ...noSeo, ...overrides.seo },
      slug: overrides.slug ?? "hello",
      title: overrides.title ?? "Hello",
    },
  });
}

describe("title", () => {
  test("formats the entry title with the site name or template", () => {
    expect(inherit({ defaults: { siteName: "Lace" } })).toMatchObject({
      preview: { title: "Hello | Lace" },
      titlePlaceholder: "Uses entry title: Hello | Lace",
    });
    expect(
      inherit({ defaults: { siteName: "Lace", titleTemplate: "%s — Lace Notes" } }).preview.title,
    ).toBe("Hello — Lace Notes");
    expect(inherit().titlePlaceholder).toBe("Uses entry title: Hello");
    expect(inherit({ title: "  " }).titlePlaceholder).toBe("Uses entry title");
  });

  test("a stored SEO title wins", () => {
    expect(
      inherit({ defaults: { siteName: "Lace" }, seo: { title: " Custom " } }).preview.title,
    ).toBe("Custom");
  });
});

describe("description", () => {
  test("falls back from the stored value to the mapped field and the site default", () => {
    const defaults = { description: "Notes on Lace" };
    expect(inherit({ defaults, fields: { excerpt: "A short intro" } })).toMatchObject({
      descriptionPlaceholder: "Uses Excerpt: A short intro",
      preview: { description: "A short intro" },
    });
    expect(inherit({ defaults, fields: { excerpt: "  " } })).toMatchObject({
      descriptionPlaceholder: "Uses site description: Notes on Lace",
      preview: { description: "Notes on Lace" },
    });
    expect(
      inherit({ defaults, fields: { excerpt: "Intro" }, seo: { description: "Stored" } }).preview
        .description,
    ).toBe("Stored");
    expect(inherit()).toMatchObject({
      descriptionPlaceholder: undefined,
      preview: { description: undefined },
    });
  });
});

describe("image", () => {
  test("names the mapped field, the site image or none", () => {
    expect(inherit({ defaults: { image: "m-2" }, fields: { cover: "m-1" } }).imageInheritance).toBe(
      "Uses the image from Cover",
    );
    expect(inherit({ defaults: { image: "m-2" } }).imageInheritance).toBe("Uses the site image");
    expect(inherit().imageInheritance).toBe("No image is shared");
  });
});

describe("URL", () => {
  test("uses the canonical, the site URL plus path, or the path", () => {
    expect(inherit({ siteUrl: "https://example.com/blog/" })).toMatchObject({
      canonicalPlaceholder: "Uses this page's URL: https://example.com/blog/posts/hello",
      preview: { url: "https://example.com/blog/posts/hello" },
    });
    expect(inherit()).toMatchObject({
      canonicalPlaceholder: "Uses this page's URL",
      preview: { url: "/posts/hello" },
    });
    expect(
      inherit({ seo: { canonical: " https://other.example/a " }, siteUrl: "https://example.com/" })
        .preview.url,
    ).toBe("https://other.example/a");
    expect(inherit({ model: home, siteUrl: "https://example.com/" }).preview.url).toBe(
      "https://example.com/",
    );
  });

  test("a collection entry without a slug has no URL", () => {
    expect(inherit({ siteUrl: "https://example.com/", slug: "" })).toMatchObject({
      canonicalPlaceholder: "Uses this page's URL",
      preview: { url: undefined },
    });
  });
});

test("reports a hidden entry", () => {
  expect(inherit({ seo: { noindex: true } }).preview.hidden).toBe(true);
  expect(inherit().preview.hidden).toBe(false);
});
