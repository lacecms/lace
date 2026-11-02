// @ts-nocheck
// TODO(rf2): Type legacy command fixtures, filesystem helpers and recorded adapter calls.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import { defineCollection, defineConfig } from "@lacecms/config";
import { builtInBlocks, field } from "@lacecms/content";
import {
  draftInput,
  loadImportConfiguration,
  normalizeDraft,
  validatePackage,
} from "./import-validate.js";
import {
  configSource,
  fixtureConfig,
  removePackages,
  samplePackage,
  writePackage,
} from "./import-fixtures.mjs";

const { import: config } = await fixtureConfig();
afterEach(removePackages);

async function failure(pkg, options = { publish: false }) {
  try {
    await validatePackage(await writePackage(pkg), config, options);
  } catch (error) {
    return error;
  }
  throw new Error("expected validation to fail");
}

describe("local package validation", () => {
  test("a valid package passes with derived block keys, positions and versions", async () => {
    const validated = await validatePackage(await writePackage(), config, { publish: true });
    expect(validated.entries.map((entry) => [entry.entry.key, entry.willPublish])).toEqual([
      ["home", true],
      ["settings", true],
      ["launch", true],
      ["second", true],
    ]);
    const home = validated.entries[0];
    const draft = draftInput(home.entry, home.model, config, (kind, key) =>
      kind === "media" ? `m-${key}` : `entry:${key}`,
    );
    expect(
      draft.blocks.map(({ key, position, schemaVersion }) => [key, position, schemaVersion]),
    ).toEqual([
      ["b1", 1, 1],
      ["b2", 2, 4],
    ]);
    expect(draft.fields).toEqual({ hero: "m-hero", featured: "entry:launch" });
    expect(draft.seo).toEqual({ title: "Welcome", image: "m-hero" });
    const global = validated.entries[1];
    expect(
      normalizeDraft(
        draftInput(global.entry, global.model, config, () => ""),
        global.model,
        config,
        "draft",
      ).title,
    ).toBe("Site settings");
  });

  test("model, block and SEO issues are reported together with package pointers", async () => {
    const pkg = samplePackage();
    pkg.entries[0].blocks[0].data = { quote: 42 };
    pkg.entries[0].blocks.push({ type: "gallery", data: { images: [] } });
    pkg.entries[0].seo = { title: "x\ny" };
    pkg.entries[2].fields.summary = 7;
    pkg.entries[3].fields.unknown = "x";
    const error = await failure(pkg);
    expect(error.code).toBe("IMPORT_INVALID");
    expect(error.issues.map((issue) => issue.pointer)).toEqual([
      "/entries/0/blocks/0/data/quote",
      "/entries/2/fields/summary",
      "/entries/3/fields/unknown",
    ]);
    pkg.entries[0].blocks = [];
    const seo = await failure(pkg);
    expect(seo.issues.map((issue) => issue.pointer)).toContain("/entries/0/seo/title");
    expect(JSON.stringify(seo.issues)).not.toContain("x\\ny");
  });

  test("publish mode applies only to entries that will publish", async () => {
    const pkg = samplePackage();
    delete pkg.entries[3].fields.summary;
    pkg.entries[3].publish = false;
    await expect(
      validatePackage(await writePackage(pkg), config, { publish: true }),
    ).resolves.toBeDefined();
    pkg.entries[3].publish = true;
    const error = await failure(pkg, { publish: true });
    expect(error.issues.map((issue) => issue.pointer)).toEqual(["/entries/3/fields/summary"]);
  });

  test("references and model rules are checked before drafts", async () => {
    const pkg = samplePackage();
    pkg.entries[0].fields.featured = { $entry: "settings" };
    pkg.entries[2].slug = undefined;
    pkg.media[0].file = "../escape.png";
    const error = await failure(pkg);
    expect(error.issues.map((issue) => issue.pointer)).toEqual([
      "/entries/2/slug",
      "/media/0/file",
      "/entries/0/fields/featured",
    ]);
  });

  test("a missing package file or directory is invalid input", async () => {
    await expect(
      validatePackage("/nonexistent/lace-import", config, { publish: false }),
    ).rejects.toMatchObject({
      code: "IMPORT_INVALID",
    });
  });

  test("loads the project's lace.config.ts", async () => {
    const directory = await mkdtemp(
      join(fileURLToPath(new URL("..", import.meta.url)), ".import-config-"),
    );
    try {
      // ESM caches a failed load per URL, so the missing case uses its own directory.
      await expect(loadImportConfiguration(join(directory, "missing"))).rejects.toMatchObject({
        code: "IMPORT_SETTINGS",
      });
      await writeFile(join(directory, "lace.config.ts"), configSource);
      const loaded = await loadImportConfiguration(directory);
      expect([...loaded.models.keys()].sort()).toEqual(["about", "home", "posts", "settings"]);
      expect(loaded.blocks.get("image").version).toBe(4);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe("conditional fields in a package", () => {
  test("hidden values are validated as drafts and never required", async () => {
    const defined = await defineConfig({
      blocks: Object.values(builtInBlocks),
      content: [
        defineCollection({
          key: "works",
          version: 1,
          route: "/works/:slug",
          fields: {
            kind: field.select({ options: ["image", "video"], required: true }),
            media: field.media({ required: true }),
            videoUrl: field.url({ required: true }),
            caption: field.text({ maxLength: 5 }),
          },
          visibility: {
            media: { field: "kind", values: ["image"] },
            videoUrl: { field: "kind", values: ["video"] },
            caption: { field: "kind", values: ["video"] },
          },
        }),
      ],
    });
    const works = {
      blocks: defined.runtime.blocks,
      models: new Map(defined.runtime.content.map((model) => [model.key, model])),
    };
    const pkg = (fields) => ({
      formatVersion: 1,
      media: [{ key: "cover", file: "media/cover.png" }],
      entries: [{ key: "w", model: "works", title: "Work", slug: "w", fields, blocks: [] }],
    });
    const valid = await validatePackage(
      await writePackage(pkg({ kind: "image", media: { $media: "cover" }, caption: "Kept" })),
      works,
      { publish: true },
    );
    expect(valid.entries).toHaveLength(1);
    let error;
    try {
      await validatePackage(
        await writePackage(pkg({ kind: "image", media: { $media: "cover" }, caption: "Too long" })),
        works,
        { publish: true },
      );
    } catch (caught) {
      error = caught;
    }
    expect(error?.issues?.map((issue) => issue.pointer)).toEqual(["/entries/0/fields/caption"]);
    error = undefined;
    try {
      await validatePackage(await writePackage(pkg({ kind: "video" })), works, { publish: true });
    } catch (caught) {
      error = caught;
    }
    expect(error?.issues?.map((issue) => issue.pointer)).toEqual(["/entries/0/fields/videoUrl"]);
  });
});
