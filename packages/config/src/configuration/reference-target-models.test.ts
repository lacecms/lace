import { defineBlock, field } from "@lacecms/content";
import { expect, test } from "vitest";
import { defineCollection, defineConfig, defineGlobal, definePage } from "../index.js";

const page = definePage({ key: "about", path: "/about", version: 1 });
const settings = defineGlobal({ key: "settings", version: 1 });

function reviewConfig(models: readonly string[]) {
  const picks = field.list({ item: field.reference({ models }) });
  const block = defineBlock({ type: "reviewStrip", version: 1, fields: { picks } });
  const reviews = defineCollection({
    key: "reviews",
    version: 1,
    blocks: [block.type],
    fields: { card: field.group({ fields: { picks } }) },
  });
  const site = defineGlobal({
    key: "site",
    version: 1,
    fields: { featured: field.reference({ models: ["reviews"] }) },
  });
  return defineConfig({ content: [reviews, site, page], blocks: [block] });
}

test("resolves forward, same-model and route-less targets across model kinds and blocks", async () => {
  const config = await reviewConfig(["reviews", "about"]);
  expect(config.runtime.content[0]).toMatchObject({
    fields: { card: { fields: { picks: { item: { models: ["about", "reviews"] } } } } },
  });
  expect(config.runtime.content[0]).not.toHaveProperty("route");
  expect(config.runtime.content[1]).toMatchObject({
    fields: { featured: { models: ["reviews"] } },
  });
  expect(config.blocks[0]?.fields.picks).toMatchObject({ item: { models: ["about", "reviews"] } });
});

test("equivalent target sets preserve all model and config hashes", async () => {
  const first = await reviewConfig(["reviews", "about"]);
  const second = await reviewConfig(["about", "reviews"]);
  expect(first.public).toEqual(second.public);
  expect(first.runtime.content).toEqual(second.runtime.content);
});

test.each(["missing", "settings"])(
  "reports ineligible target %s at its declaring fields",
  async (key) => {
    const picks = field.list({
      item: field.group({ fields: { review: field.reference({ models: [key] }) } }),
    });
    const home = definePage({ key: "home", path: "/", version: 1, fields: { picks } });
    await expect(defineConfig({ content: [home, settings] })).rejects.toThrow(
      `model "home" fields/picks/*/review references ${key === "missing" ? "unknown" : "global"} model "${key}".`,
    );
    const unusedBlock = defineBlock({ type: "reviewStrip", version: 1, fields: { picks } });
    await expect(defineConfig({ content: [settings], blocks: [unusedBlock] })).rejects.toThrow(
      `block "reviewStrip" fields/picks/*/review references ${key === "missing" ? "unknown" : "global"} model "${key}".`,
    );
  },
);

test("rejects duplicate models in a forged model field and forbids targeting a former key", async () => {
  const review = field.reference({ models: ["reviews"] });
  expect(() =>
    defineCollection({
      key: "reviews",
      version: 1,
      fields: { review: { ...review, models: ["reviews", "reviews"] } },
    }),
  ).toThrow(/unique model keys/);
  const people = defineCollection({ key: "authors", renamedFrom: "people", version: 2 });
  const articles = defineCollection({
    key: "articles",
    version: 1,
    fields: { author: field.reference({ models: ["people"] }) },
  });
  await expect(defineConfig({ content: [articles, people] })).rejects.toThrow(
    'model "articles" fields/author references unknown model "people".',
  );
});

test.each(["article", "constructor"])(
  "rejects model kind %s before checking references",
  async (kind) => {
    await expect(
      defineConfig({
        // @ts-expect-error Deliberately invalid configuration from an untyped caller.
        content: [{ ...page, kind }],
      }),
    ).rejects.toThrow("config.content[0] has an invalid model kind.");
  },
);
