import { expect, test, vi } from "vitest";
import { createPreviewInputClient, parseFrozenPreviewInput } from "./input.js";
import { createPreviewSite } from "./site.js";

const timestamp = "2026-11-17T12:00:00.000Z";
const entry = {
  id: "one",
  modelKey: "posts",
  title: "Saved title",
  fields: {},
  blocks: [],
  internalLinks: [],
};
const media = {
  id: "private-image",
  mimeType: "image/png",
  alt: "Private image",
  caption: null,
  height: 10,
  width: 12,
  focalPoint: null,
};
const frozen = {
  schemaVersion: 1,
  generationId: "first",
  revision: 9,
  capturedAt: timestamp,
  siteUrl: "https://example.test/base",
  target: { ...entry, path: "/posts/renamed", slug: "renamed" },
  targetMedia: { [media.id]: media },
  context: {
    formatVersion: 2,
    version: 17,
    media: {},
    seo: { models: {}, defaults: null },
    entries: [
      {
        ...entry,
        title: "Old title",
        path: "/posts/original",
        slug: "original",
        publishedAt: timestamp,
      },
      {
        ...entry,
        id: "two",
        title: "Published neighbor",
        path: "/posts/neighbor",
        slug: "neighbor",
        publishedAt: timestamp,
      },
    ],
    globals: [
      {
        id: "nav",
        modelKey: "nav",
        fields: {},
        blocks: [],
        internalLinks: [],
        publishedAt: timestamp,
      },
    ],
    records: [
      {
        id: "place",
        modelKey: "places",
        title: "Published place",
        fields: {},
        blocks: [],
        internalLinks: [],
        publishedAt: timestamp,
      },
    ],
  },
};

test("overlays only the saved target and resolves its private media without assigning a publication date", () => {
  const site = createPreviewSite(parseFrozenPreviewInput(frozen), (item) => ({
    url: `/p/first/media/${item.id}.png`,
  }));
  expect(site).toMatchObject({
    preview: true,
    revision: 9,
    version: 17,
    capturedAt: timestamp,
    indexing: false,
  });
  expect(site.logicalPath).toBe("/posts/renamed");
  const target = site.byPath("/p/first/posts/renamed/");
  expect(target).toMatchObject({ title: "Saved title", path: "/posts/renamed" });
  expect(target).not.toHaveProperty("publishedAt");
  expect(site.bySlug("posts", "renamed")).toBe(target);
  expect(site.byPath("/posts/original")).toBeUndefined();
  expect(site.byPath("/p/other/posts/renamed")).toBeUndefined();
  expect(site.byPath("/posts/neighbor")?.title).toBe("Published neighbor");
  expect(site.global("nav")?.id).toBe("nav");
  expect(site.records("places")[0]?.id).toBe("place");
  expect(site.mediaUrl(media.id)).toBe("/p/first/media/private-image.png");
  expect(Object.isFrozen(target?.fields)).toBe(true);
  expect(site.urlFor("/p/first/posts/renamed/")).toBe("https://example.test/base/posts/renamed");
});

test("uses a generation-scoped claim exclusively at the preview runner endpoint", async () => {
  const fetch = vi.fn(async (url: URL, init: RequestInit) => {
    expect(url.pathname).toBe("/lace/api/v1/preview-runner/first/input");
    expect(init).toMatchObject({
      headers: { authorization: "Bearer fixture-claim" },
      redirect: "error",
      credentials: "omit",
    });
    if (url.searchParams.get("mediaId") === media.id) return new Response("original");
    return Response.json(frozen);
  });
  const client = createPreviewInputClient({
    apiBaseUrl: "https://api.example.test/lace",
    generationId: "first",
    claim: "fixture-claim",
    fetch,
  });
  expect(await client.input()).toEqual(frozen);
  await expect(client.original("unlisted")).rejects.toThrow("outside the frozen");
  expect(await (await client.original(media.id)).text()).toBe("original");
  expect(fetch).toHaveBeenCalledTimes(2);
  const wrong = createPreviewInputClient({
    apiBaseUrl: "https://api.example.test",
    generationId: "other",
    claim: "fixture-claim",
    fetch: async () => Response.json(frozen),
  });
  await expect(wrong.input()).rejects.toThrow("different generation");
});

test("rejects unprojected blocks, injected media URLs and synthetic publication metadata", () => {
  expect(() =>
    parseFrozenPreviewInput({ ...frozen, target: { ...frozen.target, publishedAt: timestamp } }),
  ).toThrow();
  expect(() =>
    parseFrozenPreviewInput({
      ...frozen,
      target: {
        ...frozen.target,
        blocks: [
          {
            type: "hero",
            key: "hidden",
            position: 0,
            data: {},
            settings: {},
            schemaVersion: 1,
            hidden: true,
          },
        ],
      },
    }),
  ).toThrow();
  expect(() =>
    parseFrozenPreviewInput({
      ...frozen,
      targetMedia: { [media.id]: { ...media, url: "/draft" } },
    }),
  ).toThrow();
});
