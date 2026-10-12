import { expect, test } from "vitest";
import { createPublishedSiteLoader, resolveSeo, seoText } from "../dist/index.js";

const timestamp = "2026-10-01T00:00:00.000Z";
const emptySeo = { canonical: null, description: null, image: null, noindex: false, title: null };

function media(id, mimeType = "image/png", overrides = {}) {
  return {
    alt: null,
    caption: null,
    focalPoint: null,
    height: 630,
    id,
    mimeType,
    url: `https://cms.example/api/v1/public/media/${id}`,
    width: 1200,
    ...overrides,
  };
}

const library = {
  cover: media("cover", "image/jpeg", { alt: "Cover" }),
  logo: media("logo", "image/png", { alt: "Logo" }),
  manual: media("manual", "application/pdf"),
  share: media("share"),
};

function lookup(id) {
  const item = library[id];
  return item === undefined ? undefined : { ...item, alt: item.alt ?? "" };
}

function resolve({ entry = {}, ...rest } = {}) {
  return resolveSeo({
    entry: { fields: {}, path: "/blog/hello", title: "Hello", ...entry },
    image: lookup,
    indexing: true,
    ...rest,
  });
}

test("stored SEO values win and the title is not templated", () => {
  const seo = resolve({
    defaults: { description: "Site", image: "logo", siteName: "Acme", titleTemplate: "%s — Acme" },
    entry: {
      fields: { summary: "Summary" },
      seo: {
        canonical: "https://elsewhere.example/hello",
        description: "Stored description",
        image: "share",
        noindex: false,
        title: "Stored title",
      },
    },
    mapping: { description: "summary", image: "cover" },
    siteUrl: "https://site.example/",
  });
  expect(seo).toEqual({
    canonical: "https://elsewhere.example/hello",
    description: "Stored description",
    image: { ...library.share, alt: "" },
    siteName: "Acme",
    title: "Stored title",
  });
  expect(Object.isFrozen(seo)).toBe(true);
});

test("the title template applies to the entry title", () => {
  expect(resolve({ defaults: { titleTemplate: "%s — Acme" } }).title).toBe("Hello — Acme");
});

test("the default template uses the site name", () => {
  const seo = resolve({ defaults: { siteName: "Acme" }, entry: { seo: emptySeo } });
  expect(seo.title).toBe("Hello | Acme");
  expect(seo.siteName).toBe("Acme");
});

test("without defaults the title is the entry title and defaults are absent", () => {
  expect(resolve({ entry: { seo: emptySeo } })).toEqual({ title: "Hello" });
});

test("a template without a placeholder falls back to the default template", () => {
  expect(resolve({ defaults: { siteName: "Acme Inc", titleTemplate: "Acme" } }).title).toBe(
    "Hello | Acme Inc",
  );
});

test("replacement patterns in titles stay literal", () => {
  expect(
    resolve({ defaults: { titleTemplate: "%s | Acme" }, entry: { title: "Save $& now" } }).title,
  ).toBe("Save $& now | Acme");
});

test("the description falls back to the mapped field with collapsed whitespace", () => {
  const seo = resolve({
    defaults: { description: "Site intro" },
    entry: { fields: { summary: "  Short\n  intro  " }, seo: emptySeo },
    mapping: { description: "summary", image: null },
  });
  expect(seo.description).toBe("Short intro");
});

test("the description falls back to the site default past a blank or non-text field", () => {
  for (const summary of ["   ", 42, null]) {
    const seo = resolve({
      defaults: { description: "Site intro" },
      entry: { fields: { summary } },
      mapping: { description: "summary", image: null },
    });
    expect(seo.description).toBe("Site intro");
  }
});

test("the image falls back past non-image and unresolved media", () => {
  const seo = resolve({
    defaults: { image: "logo" },
    entry: { fields: { cover: "manual" }, seo: { ...emptySeo, image: "missing" } },
    mapping: { description: null, image: "cover" },
  });
  expect(seo.image).toEqual({ ...library.logo, alt: "Logo" });
});

test("the mapped media field is used before the site default", () => {
  const seo = resolve({
    defaults: { image: "logo" },
    entry: { fields: { cover: "cover" } },
    mapping: { description: null, image: "cover" },
  });
  expect(seo.image.id).toBe("cover");
});

test("the canonical falls back to the site URL of the path", () => {
  expect(resolve({ siteUrl: "https://example.com/" }).canonical).toBe(
    "https://example.com/blog/hello",
  );
  expect(resolve({ siteUrl: "https://example.com/base/" }).canonical).toBe(
    "https://example.com/base/blog/hello",
  );
  expect(resolve({}).canonical).toBeUndefined();
});

test("noindex entries resolve to noindex, follow", () => {
  expect(resolve({ entry: { seo: { ...emptySeo, noindex: true } } }).robots).toBe(
    "noindex, follow",
  );
  expect(resolve({ entry: { seo: emptySeo } }).robots).toBeUndefined();
});

test("indexing off resolves every entry to noindex, nofollow", () => {
  expect(resolve({ indexing: false }).robots).toBe("noindex, nofollow");
  expect(resolve({ entry: { seo: { ...emptySeo, noindex: true } }, indexing: false }).robots).toBe(
    "noindex, nofollow",
  );
});

test("seo text normalizes strings only", () => {
  expect(seoText(" a \t b ")).toBe("a b");
  expect(seoText("")).toBeUndefined();
  expect(seoText(["a"])).toBeUndefined();
});

function siteExport({ defaults, globals }) {
  return {
    entries: [
      {
        blocks: [],
        fields: { summary: "Post summary" },
        id: "post",
        modelKey: "posts",
        path: "/blog/hello",
        publishedAt: timestamp,
        seo: emptySeo,
        slug: "hello",
        title: "Hello",
      },
      {
        blocks: [],
        fields: {},
        id: "home",
        modelKey: "home",
        path: "/",
        publishedAt: timestamp,
        title: "Home",
      },
    ],
    globals,
    media: { logo: library.logo },
    seo: { defaults, models: { posts: { description: "summary", image: null } } },
    version: 1,
  };
}

async function loadSite(value, extra = {}) {
  return createPublishedSiteLoader({
    environment: { LACE_API_BASE_URL: "https://cms.example/", LACE_BUILD_TOKEN: "token", ...extra },
    fetch: async () => Response.json(value, { headers: { etag: '"1"' } }),
  })();
}

const defaults = {
  description: "description",
  image: "image",
  modelKey: "settings",
  siteName: "siteName",
  titleTemplate: null,
};

test("site.seo applies the model mapping and the published defaults global", async () => {
  const site = await loadSite(
    siteExport({
      defaults,
      globals: [
        {
          blocks: [],
          fields: { description: "Site description", image: "logo", siteName: " Acme " },
          id: "settings-entry",
          modelKey: "settings",
          publishedAt: timestamp,
        },
      ],
    }),
    { LACE_BUILD_SITE_URL: "https://site.example" },
  );
  expect(site.seo(site.byPath("/blog/hello"))).toEqual({
    canonical: "https://site.example/blog/hello",
    description: "Post summary",
    image: { ...library.logo, alt: "Logo" },
    siteName: "Acme",
    title: "Hello | Acme",
  });
  // A model without SEO still uses the site defaults.
  expect(site.seo(site.byPath("/"))).toEqual({
    canonical: "https://site.example/",
    description: "Site description",
    image: { ...library.logo, alt: "Logo" },
    siteName: "Acme",
    title: "Home | Acme",
  });
});

test("site.seo resolves without a published defaults global or without defaults", async () => {
  for (const value of [
    siteExport({ defaults, globals: [] }),
    siteExport({ defaults: null, globals: [] }),
  ]) {
    const site = await loadSite(value);
    expect(site.seo(site.byPath("/blog/hello"))).toEqual({
      description: "Post summary",
      title: "Hello",
    });
  }
});
