// @ts-nocheck
// TODO(rf2): Type partial content repositories and mutable normalized draft fixtures.
import { expect, test } from "vitest";
import { defineCollection, defineConfig, defineGlobal } from "@lacecms/config";
import { builtInBlocks, field } from "@lacecms/content";
import {
  canonicalizeJson,
  ContentUseCases,
  encodeEntryLink,
  normalizeDraftCandidate,
  normalizeMediaTags,
} from "./index.js";

const config = await defineConfig({
  blocks: Object.values(builtInBlocks),
  content: [
    defineCollection({
      key: "posts",
      version: 1,
      route: "/posts/:slug",
      blocks: ["quote", "image"],
      fields: {
        author: field.text({ defaultValue: "Ada" }),
        description: field.text(),
        related: field.url(),
      },
      seo: { description: "description" },
    }),
    defineGlobal({ key: "settings", label: "Site settings", version: 1, fields: {} }),
  ],
});
const posts = config.runtime.content.find((model) => model.key === "posts");
const settings = config.runtime.content.find((model) => model.key === "settings");
const actor = { id: "user", role: "admin" };

function draft() {
  return {
    title: "Launch",
    slug: "launch",
    fields: { description: "  Hello  ", related: encodeEntryLink("abc/1") },
    seo: { title: "Launch title", noindex: false },
    blocks: [
      { key: "b1", position: 1, schemaVersion: 1, type: "quote", data: { quote: "Quoted" } },
      {
        key: "b2",
        position: 2,
        schemaVersion: 4,
        type: "image",
        data: { media: "media-1" },
        hidden: true,
      },
    ],
  };
}

function projection(value) {
  return canonicalizeJson({
    blocks: value.blocks,
    fields: value.fields,
    seo: value.seo ?? null,
    slug: value.slug ?? null,
    title: value.title,
  });
}

test("client prediction matches the draft a save stores", async () => {
  let stored;
  const cases = new ContentUseCases({
    config: config.runtime,
    clock: { now: () => 1 },
    idGenerator: { next: () => "entry-1" },
    media: { loadMediaMany: async (ids) => ids.map((id) => ({ id, status: "active" })) },
    content: {
      create: async ({ entry }) => {
        stored = entry;
        return { entry };
      },
      resolveLinkTargets: async () => ({}),
    },
  });
  const entry = await cases.create({ actor, modelKey: "posts", ...draft() });
  const predicted = normalizeDraftCandidate({
    blocks: config.runtime.blocks,
    draft: draft(),
    mode: "draft",
    model: posts,
  });
  expect(predicted.fields.author).toBe("Ada");
  expect(predicted.blocks[1].settings).toEqual({ lightbox: false });
  expect(projection(predicted)).toBe(projection(entry.draft));
  expect(projection(predicted)).toBe(projection(stored.draft));
});

test("a global's title is replaced by its label", () => {
  const normalized = normalizeDraftCandidate({
    blocks: config.runtime.blocks,
    draft: { title: "Anything", fields: {}, blocks: [] },
    mode: "draft",
    model: settings,
  });
  expect(normalized.title).toBe("Site settings");
});

test("invalid block data fails with the draft-save issue path", () => {
  const input = draft();
  input.blocks[0].data = { quote: 42 };
  let failure;
  try {
    normalizeDraftCandidate({
      blocks: config.runtime.blocks,
      draft: input,
      mode: "draft",
      model: posts,
    });
  } catch (error) {
    failure = error;
  }
  expect(failure?.name).toBe("ContentValidationError");
  expect(failure.issues[0].path).toEqual(["blocks", 0, "data", "quote"]);
});

test("application re-exports the portable import helpers", () => {
  expect(normalizeMediaTags(["Project-A", "project-a"])).toEqual({ tags: ["project-a"] });
  expect(encodeEntryLink("abc/1")).toBe("entry:abc%2F1");
});

test("draft candidates keep hidden values and publish without hidden requirements", async () => {
  const conditional = await defineConfig({
    blocks: Object.values(builtInBlocks),
    content: [
      defineCollection({
        key: "works",
        version: 1,
        route: "/works/:slug",
        fields: {
          kind: field.select({
            options: ["image", "video"],
            required: true,
            defaultValue: "image",
          }),
          media: field.media({ required: true }),
          videoUrl: field.url({ required: true }),
        },
        visibility: {
          media: { field: "kind", values: ["image"] },
          videoUrl: { field: "kind", values: ["video"] },
        },
      }),
    ],
  });
  const model = conditional.runtime.content.find((candidate) => candidate.key === "works");
  const candidate = (fields, mode) =>
    normalizeDraftCandidate({
      blocks: conditional.runtime.blocks,
      draft: { title: "Work", slug: "work", fields, blocks: [] },
      mode,
      model,
    });
  const video = candidate({ kind: "video", videoUrl: "https://example.com/v" }, "publish");
  expect(video.fields).toEqual({ kind: "video", videoUrl: "https://example.com/v" });
  const switched = candidate({ ...video.fields, kind: "image", media: "media-1" }, "draft");
  expect(switched.fields).toEqual({
    kind: "image",
    media: "media-1",
    videoUrl: "https://example.com/v",
  });
  const restored = candidate({ ...switched.fields, kind: "video" }, "publish");
  expect(restored.fields.videoUrl).toBe("https://example.com/v");
  expect(candidate({ kind: "image", media: "media-1" }, "publish").fields).toEqual({
    kind: "image",
    media: "media-1",
  });
  expect(() => candidate({ kind: "video" }, "publish")).toThrow(/videoUrl/u);
});
