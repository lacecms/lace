import { expect, test } from "vitest";
import { defineCollection, defineConfig, defineGlobal } from "@lacecms/config";
import { builtInBlocks, field } from "@lacecms/content";
import {
  canonicalizeJson,
  ContentUseCases,
  encodeEntryLink,
  normalizeDraftCandidate,
  normalizeMediaTags,
} from "../dist/index.js";

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
