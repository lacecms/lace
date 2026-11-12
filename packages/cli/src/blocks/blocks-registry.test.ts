// @ts-nocheck
// TODO(rf2): Type legacy command fixtures, filesystem helpers and recorded adapter calls.
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, expect, test } from "vitest";
import { BlockError, dependencyClosure, loadRegistry } from "./blocks-registry.js";

const roots = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function registry(items) {
  const root = await mkdtemp(join(tmpdir(), "lace-registry-"));
  roots.push(root);
  const index = { schemaVersion: 1, items: [] };
  for (const item of items) {
    const manifest = {
      schemaVersion: 1,
      name: item.name,
      framework: "astro",
      blockType: item.name,
      blockVersion: 1,
      revision: 1,
      requires: { "@lacecms/astro": "0.1.0-alpha.4" },
      files: [{ source: "Block.astro", target: `${item.name}.astro`, role: "component" }],
      dependencies: item.dependencies ?? [],
      ...item.manifest,
    };
    await mkdir(join(root, "astro", item.name), { recursive: true });
    await writeFile(join(root, "astro", item.name, "item.json"), JSON.stringify(manifest));
    if (!item.missingFile)
      await writeFile(join(root, "astro", item.name, "Block.astro"), "<p />\n");
    index.items.push({
      name: item.name,
      framework: "astro",
      manifest: `astro/${item.name}/item.json`,
    });
  }
  await writeFile(join(root, "registry.json"), JSON.stringify(index));
  return pathToFileURL(`${root}/`);
}

test("invalid manifests and missing files are rejected with the item name", async () => {
  await expect(
    loadRegistry(await registry([{ name: "hero", manifest: { revision: 0 } }])),
  ).rejects.toThrow(/item astro\/hero has an invalid manifest/u);
  await expect(loadRegistry(await registry([{ name: "hero", missingFile: true }]))).rejects.toThrow(
    /item astro\/hero is missing Block\.astro/u,
  );
  await expect(
    loadRegistry(
      await registry([
        {
          name: "hero",
          manifest: { files: [{ source: "../x", target: "a.astro", role: "component" }] },
        },
      ]),
    ),
  ).rejects.toThrow(BlockError);
});

test("dependency closures include dependencies and reject missing items and cycles", async () => {
  const loaded = await loadRegistry(
    await registry([{ name: "hero", dependencies: ["media"] }, { name: "media" }]),
  );
  expect(dependencyClosure(loaded, "astro", ["hero"]).map((item) => item.name)).toEqual([
    "hero",
    "media",
  ]);
  await expect(
    loadRegistry(await registry([{ name: "hero", dependencies: ["gone"] }])),
  ).rejects.toThrow(/depends on missing gone/u);
  const cyclic = await loadRegistry(
    await registry([
      { name: "a", dependencies: ["b"] },
      { name: "b", dependencies: ["a"] },
    ]),
  );
  expect(() => dependencyClosure(cyclic, "astro", ["a"])).toThrow(/dependency cycle/u);
});

test("registry accepts CSS companions and rejects ambiguous/unsafe roles", async () => {
  const component = { source: "Block.astro", target: "Block.astro", role: "component" };
  const css = { source: "ListLayout.css", target: "ListLayout.css", role: "stylesheet" };
  const root = await registry([{ name: "cards", manifest: { files: [component, css] } }]);
  await writeFile(new URL("astro/cards/ListLayout.css", root), "@layer lace-layout {}\n");
  expect((await loadRegistry(root)).items.get("astro/cards").files.map((f) => f.role)).toEqual([
    "component",
    "stylesheet",
  ]);
  for (const files of [
    [component, component],
    [css],
    [component, { ...css, role: "script" }],
    [component, { ...css, target: "bad.js" }],
    [component, { ...css, source: "Block.astro" }],
    [component, { ...css, target: "../escape.css" }],
    [component, css, { ...css, target: "listlayout.CSS" }],
  ]) {
    const invalid = await registry([{ name: "cards", manifest: { files } }]);
    await writeFile(new URL("astro/cards/ListLayout.css", invalid), "");
    await expect(loadRegistry(invalid)).rejects.toThrow(BlockError);
  }
  const { symlink, unlink } = await import("node:fs/promises");
  await unlink(new URL("astro/cards/ListLayout.css", root));
  await symlink(
    new URL("astro/cards/Block.astro", root),
    new URL("astro/cards/ListLayout.css", root),
  );
  await expect(loadRegistry(root)).rejects.toThrow(/symlink/);
});
