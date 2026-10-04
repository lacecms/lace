import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { builtInBlocks } from "@lacecms/content";
import { expect, test } from "vitest";

// The starter, the reference site and the guide fixture must hold the registry
// block sources exactly as `lace add block` installs them.
const workspace = fileURLToPath(new URL("..", import.meta.url));
const registryRoot = join(workspace, "registry");
const sites = [
  "packages/create-lace/templates/site",
  "apps/site",
  "tests/fixtures/existing-astro-site",
];

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

function insideSite(path) {
  return (
    typeof path === "string" &&
    !isAbsolute(path) &&
    normalize(path) === path &&
    !path.split("/").includes("..")
  );
}

async function registryItems() {
  const index = await readJson(join(registryRoot, "registry.json"));
  expect(index.schemaVersion).toBe(1);
  const items = new Map();
  for (const entry of index.items) {
    const manifestPath = join(registryRoot, entry.manifest);
    const manifest = await readJson(manifestPath);
    expect(manifest).toMatchObject({
      schemaVersion: 1,
      name: entry.name,
      framework: entry.framework,
    });
    expect(items.has(`${entry.framework}/${entry.name}`), entry.name).toBe(false);
    const files = new Map();
    for (const file of manifest.files) {
      expect(insideSite(file.source) && insideSite(file.target), entry.name).toBe(true);
      expect(file.role).toBe("component");
      files.set(file.target, await readFile(join(manifestPath, "..", file.source)));
    }
    items.set(`${entry.framework}/${entry.name}`, { manifest, files });
  }
  return items;
}

test("the registry holds one astro item per built-in block at its definition version", async () => {
  const items = await registryItems();
  expect([...items.keys()].sort()).toEqual(
    Object.keys(builtInBlocks)
      .map((type) => `astro/${type}`)
      .sort(),
  );
  for (const { manifest } of items.values()) {
    const definition = builtInBlocks[manifest.blockType];
    expect(definition?.type, manifest.name).toBe(manifest.name);
    expect(manifest.blockVersion, manifest.name).toBe(definition.version);
    expect(Number.isInteger(manifest.revision) && manifest.revision >= 1).toBe(true);
    expect(Object.keys(manifest.requires).sort()).toEqual(["@lacecms/astro", "@lacecms/render"]);
    expect(manifest.dependencies).toEqual([]);
  }
});

test.each(sites)("%s records registry blocks byte-identical to the registry", async (site) => {
  const items = await registryItems();
  const root = join(workspace, site);
  const lock = await readJson(join(root, "lace.site.json"));
  expect(lock).toMatchObject({ schemaVersion: 1, framework: "astro" });
  expect(insideSite(lock.componentsDir) && insideSite(lock.blockMap)).toBe(true);
  expect(sha256(await readFile(join(root, lock.blockMap))), `${site} block map`).toBe(
    lock.blockMapSha256,
  );
  for (const [name, record] of Object.entries(lock.items)) {
    const item = items.get(`${lock.framework}/${name}`);
    expect(item, `${site}: ${name} is not a registry item`).toBeDefined();
    expect(record.revision).toBe(item.manifest.revision);
    expect(Object.keys(record.files).sort()).toEqual(
      [...item.files.keys()].map((target) => `${lock.componentsDir}/${target}`).sort(),
    );
    for (const [target, source] of item.files) {
      const path = `${lock.componentsDir}/${target}`;
      const installed = await readFile(join(root, path));
      expect(installed.equals(source), `${site}/${path} differs from registry ${name}`).toBe(true);
      expect(record.files[path], `${site}/${path} hash`).toBe(sha256(installed));
    }
  }
});

test("every Lace-maintained site installs all built-in blocks with the same block map", async () => {
  const maps = await Promise.all(
    sites.map(async (site) => {
      const lock = await readJson(join(workspace, site, "lace.site.json"));
      expect(Object.keys(lock.items).sort()).toEqual(Object.keys(builtInBlocks).sort());
      return readFile(join(workspace, site, lock.blockMap), "utf8");
    }),
  );
  expect(new Set(maps).size).toBe(1);
});
