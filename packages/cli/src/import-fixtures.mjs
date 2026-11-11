// Shared fixtures for lace import tests: a small project configuration and
// package directories with tiny valid PNG headers.
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineCollection, defineConfig, defineGlobal, definePage } from "@lacecms/config";
import { builtInBlocks, field } from "@lacecms/content";

/** Source of a lace.config.ts with the same models, for command-level tests. */
export const configSource = `import { defineCollection, defineConfig, defineGlobal, definePage } from "@lacecms/config";
import { builtInBlocks, field } from "@lacecms/content";

export default await defineConfig({
  blocks: Object.values(builtInBlocks),
  content: [
    definePage({
      key: "home",
      version: 1,
      path: "/",
      blocks: ["quote", "image"],
      fields: { hero: field.media(), featured: field.url() },
      seo: {},
    }),
    definePage({ key: "about", version: 1, path: "/about", fields: { body: field.textarea() } }),
    defineGlobal({
      key: "settings",
      label: "Site settings",
      version: 1,
      fields: { siteName: field.text({ required: true }) },
    }),
    defineCollection({
      key: "posts",
      version: 1,
      route: "/posts/:slug",
      blocks: ["quote", "image", "gallery"],
      fields: {
        cover: field.media(),
        summary: field.text({ required: true }),
        related: field.url(),
      },
      seo: { description: "summary" },
    }),
    defineCollection({ key: "quotes", version: 1, fields: { text: field.textarea() } }),
  ],
});
`;

export async function fixtureConfig(postsVersion = 1) {
  const config = await defineConfig({
    blocks: Object.values(builtInBlocks),
    content: [
      definePage({
        key: "home",
        version: 1,
        path: "/",
        blocks: ["quote", "image"],
        fields: { hero: field.media(), featured: field.url() },
        seo: {},
      }),
      definePage({ key: "about", version: 1, path: "/about", fields: { body: field.textarea() } }),
      defineGlobal({
        key: "settings",
        label: "Site settings",
        version: 1,
        fields: { siteName: field.text({ required: true }) },
      }),
      defineCollection({
        key: "posts",
        version: postsVersion,
        route: "/posts/:slug",
        blocks: ["quote", "image", "gallery"],
        fields: {
          cover: field.media(),
          summary: field.text({ required: true }),
          related: field.url(),
        },
        seo: { description: "summary" },
      }),
      defineCollection({ key: "quotes", version: 1, fields: { text: field.textarea() } }),
    ],
  });
  return {
    normalized: config,
    import: {
      blocks: config.runtime.blocks,
      models: new Map(config.runtime.content.map((model) => [model.key, model])),
    },
  };
}

export const png = (seed = 0) =>
  new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, seed, 0, 0, 0]);

/** A valid package: two media, a home page, a global and two linked posts. */
export function samplePackage() {
  return {
    formatVersion: 1,
    media: [
      { key: "hero", file: "media/hero.png", alt: "Hero", tags: ["Project-A"] },
      { key: "cover", file: "media/cover.png", caption: "Cover" },
    ],
    entries: [
      {
        key: "home",
        model: "home",
        title: "Home",
        fields: { hero: { $media: "hero" }, featured: { $entry: "launch" } },
        blocks: [
          { type: "quote", data: { quote: "Hello" } },
          { type: "image", data: { media: { $media: "cover" } }, hidden: true },
        ],
        seo: { title: "Welcome", image: { $media: "hero" } },
      },
      { key: "settings", model: "settings", fields: { siteName: "Tatiana" }, blocks: [] },
      {
        key: "launch",
        model: "posts",
        slug: "launch",
        title: "Launch",
        fields: { cover: { $media: "cover" }, summary: "First", related: { $entry: "second" } },
        blocks: [],
      },
      {
        key: "second",
        model: "posts",
        slug: "second",
        title: "Second",
        fields: { summary: "Second post" },
        blocks: [],
      },
    ],
  };
}

const directories = [];

/** Writes a package directory; media files get distinct tiny PNG bytes. */
export async function writePackage(pkg = samplePackage(), parent) {
  const base = parent ?? (await realpath(await mkdtemp(join(tmpdir(), "lace-import-package-"))));
  if (parent === undefined) directories.push(base);
  const root = join(base, "out");
  await mkdir(join(root, "media"), { recursive: true });
  for (const [index, item] of pkg.media.entries())
    await writeFile(join(root, item.file), png(index + 1));
  await writeFile(join(root, "lace-import.json"), JSON.stringify(pkg, null, 2));
  return root;
}

export async function removePackages() {
  for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true });
}
