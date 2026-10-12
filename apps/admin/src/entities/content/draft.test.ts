import type { ContentEntryDto, ContentModelDto } from "@lacecms/contracts";
import { expect, test } from "vitest";
import {
  draftValues,
  entryStatus,
  fieldLabel,
  localDraftJson,
  orderedDraftBlocks,
  resolvedPublicPath,
  siteUrlFor,
} from "./draft.js";

const model: ContentModelDto = {
  blockDefinitions: [
    {
      fields: { heading: { defaultValue: "Hello", required: false, type: "text" } },
      type: "hero",
      version: 1,
    },
  ],
  blocks: ["hero"],
  fields: {},
  key: "posts",
  kind: "collection",
  route: "/posts/:slug",
  version: 1,
} as unknown as ContentModelDto;

const entry = {
  draft: {
    blocks: [
      {
        data: {},
        hidden: false,
        key: "01J",
        position: 1024,
        schemaVersion: 1,
        settings: {},
        type: "hero",
      },
    ],
    fields: {},
    revision: 3,
    slug: "draft-slug",
    title: "Draft",
  },
  published: { slug: "live-slug" },
} as unknown as ContentEntryDto;

test("fills block defaults and resolves the published public path first", () => {
  const values = draftValues(model, entry);
  expect(values.blocks[0]?.data).toEqual({ heading: "Hello" });
  expect(values).toMatchObject({ slug: "draft-slug", title: "Draft" });
  expect(resolvedPublicPath(model, entry)).toBe("/posts/live-slug");
});

test("labels keys and serializes local drafts canonically", () => {
  expect(fieldLabel("heroImage", undefined)).toBe("Hero Image");
  expect(fieldLabel("heroImage", "Cover")).toBe("Cover");
  expect(localDraftJson({ blocks: [], fields: { b: 1, a: 2 }, title: "T" })).toBe(
    '{"blocks":[],"fields":{"a":2,"b":1},"title":"T"}',
  );
});

test("derives draft, published, and changed status from the revisions", () => {
  const draft = { draft: { revision: 3 } } as unknown as ContentEntryDto;
  const published = {
    draft: { revision: 3 },
    published: { revision: 3 },
  } as unknown as ContentEntryDto;
  const changed = {
    draft: { revision: 4 },
    published: { revision: 3 },
  } as unknown as ContentEntryDto;
  expect(entryStatus(draft)).toBe("draft");
  expect(entryStatus(published)).toBe("published");
  expect(entryStatus(changed)).toBe("changed");
});

test("derives sparse positions in displayed order without mutating keys or data", () => {
  expect(orderedDraftBlocks([])).toEqual([]);
  const blocks = [8000, 1, 1, 0].map((position, index) =>
    Object.freeze({
      data: Object.freeze({ heading: `Block ${index}` }),
      key: `key-${index}`,
      position,
      hidden: false,
      schemaVersion: 1,
      settings: {},
      type: "hero",
    }),
  );
  const ordered = orderedDraftBlocks(blocks);
  expect(ordered.map((block) => block.position)).toEqual([1000, 2000, 3000, 4000]);
  expect(ordered.map(({ position: _position, ...block }) => block)).toEqual(
    blocks.map(({ position: _position, ...block }) => block),
  );
  expect(blocks.map((block) => block.position)).toEqual([8000, 1, 1, 0]);
  expect(
    JSON.parse(localDraftJson({ blocks: [...blocks], fields: {}, title: "T" })).blocks,
  ).toEqual(ordered);
});

test("resolves public paths under the configured site base URL", () => {
  expect(siteUrlFor("https://example.com/blog/", "/posts/first-post")).toBe(
    "https://example.com/blog/posts/first-post",
  );
  expect(siteUrlFor("https://example.com/", "/")).toBe("https://example.com/");
  expect(siteUrlFor("http://127.0.0.1:4321/", "/about")).toBe("http://127.0.0.1:4321/about");
});

test("a slugless collection draft starts with an empty slug that is never sent", () => {
  const slugless = {
    ...entry,
    draft: { ...entry.draft, slug: undefined },
  } as unknown as ContentEntryDto;
  expect(draftValues(model, slugless).slug).toBe("");
  expect(JSON.parse(localDraftJson(draftValues(model, slugless)))).not.toHaveProperty("slug");
});

test("loads, copies and omits the SEO group by model", () => {
  const seoModel = { ...model, seo: { description: null, image: null } } as ContentModelDto;
  const withSeo = {
    ...entry,
    draft: {
      ...entry.draft,
      seo: { canonical: null, description: null, image: "media-1", noindex: true, title: "SEO" },
    },
  } as unknown as ContentEntryDto;
  const values = draftValues(seoModel, withSeo);
  expect(values.seo).toEqual({
    canonical: "",
    description: "",
    image: "media-1",
    noindex: true,
    title: "SEO",
  });
  expect(draftValues(model, withSeo)).not.toHaveProperty("seo");
  expect(JSON.parse(localDraftJson(values)).seo).toEqual({
    canonical: null,
    description: null,
    image: "media-1",
    noindex: true,
    title: "SEO",
  });
});
