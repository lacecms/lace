import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, test } from "vitest";
import {
  claimOutput,
  completeInventory,
  inspectPackage,
  safeSourcePath,
  snapshotSource,
  withoutSourceCondition,
} from "../scripts/release-artifacts.mjs";
import { readJson, readReleaseModel } from "../scripts/release-model.mjs";
import { preparationToolchainError, prepareRelease } from "../scripts/release.mjs";
import { releaseVersionSource } from "../scripts/platform-release-version.mjs";

test("clean snapshots are stable, dirty inputs require an explicit preview", async () => {
  const parent = await mkdtemp(join(tmpdir(), "lace-release-source-"));
  try {
    const root = join(parent, "source");
    await mkdir(root);
    const git = (...args) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
    git("init");
    git("config", "user.name", "Release test");
    git("config", "user.email", "release@lace.test");
    await writeFile(join(root, "file.txt"), "reviewed");
    git("add", ".");
    git("commit", "-m", "fixture");
    const clean = await snapshotSource(root, join(parent, "clean"), false);
    expect(clean.preview).toBe(false);
    await writeFile(join(root, "file.txt"), "changed");
    await expect(snapshotSource(root, join(parent, "rejected"), false)).rejects.toThrow(
      "clean Git",
    );
    const preview = await snapshotSource(root, join(parent, "preview"), true);
    expect(preview.preview).toBe(true);
    expect(preview.revision).toBe(clean.revision);
    expect(preview.fingerprint).not.toBe(clean.fingerprint);
    expect(await readFile(join(parent, "preview/file.txt"), "utf8")).toBe("changed");
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("output claims refuse concurrent reuse and begin incomplete", async () => {
  const parent = await mkdtemp(join(tmpdir(), "lace-release-output-"));
  try {
    const destination = join(parent, "artifacts");
    const results = await Promise.allSettled([claimOutput(destination), claimOutput(destination)]);
    expect(results.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(await readJson(join(destination, "status.json"))).toEqual({ state: "preparing" });
    await expect(readFile(join(destination, "inventory.json"))).rejects.toThrow();
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("injected preparation failure leaves no inventory or success", async () => {
  const parent = await mkdtemp(join(tmpdir(), "lace-release-failure-"));
  const output = join(parent, "failed");
  try {
    // Test post-validation recovery against a coherent source fixture. The
    // working tree's template can advance independently of a published alpha,
    // and its version may already be recorded as published until the next
    // candidate is selected.
    const root = join(parent, "source");
    const model = await readReleaseModel(new URL("..", import.meta.url).pathname);
    const publishedVersions = model.definition.publishedVersions.filter(
      (version) => version !== model.definition.version,
    );
    const fixtureFile = async (path, contents) => {
      const file = join(root, path);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, contents);
    };
    await fixtureFile(
      "release/alpha.json",
      JSON.stringify({
        ...model.definition,
        publishedVersions,
        templateVersion: model.templateVersion,
      }),
    );
    await fixtureFile("package.json", JSON.stringify(model.rootManifest));
    for (const { directory, manifest } of Object.values(model.manifests))
      await fixtureFile(`${directory}/package.json`, JSON.stringify(manifest));
    for (const platform of ["node", "cloudflare"]) {
      const { directory, manifest } = model.manifests[`@lacecms/platform-${platform}`];
      await fixtureFile(
        `${directory}/src/runtime/release-version.ts`,
        releaseVersionSource(manifest.version),
      );
    }
    for (const [index, path] of ["package.json", "site/package.json"].entries())
      await fixtureFile(
        `packages/create-lace/templates/${path}`,
        JSON.stringify(model.templates[index]),
      );
    await fixtureFile(
      "packages/create-lace/src/template/inventory.ts",
      `export const TEMPLATE_VERSION = "${model.templateVersion}";\n`,
    );
    await fixtureFile("packages/create-lace/templates/.env.example", model.environment);
    for (const [path, contents] of Object.entries({ ...model.guides, ...model.dockerfiles }))
      await fixtureFile(path, contents);
    for (const [path, requires] of Object.entries(model.registry))
      await fixtureFile(path, JSON.stringify({ requires }));
    const git = (...args) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
    git("init");
    git("config", "user.name", "Release test");
    git("config", "user.email", "release@lace.test");
    git("add", ".");
    git("commit", "-m", "coherent fixture");
    await expect(
      prepareRelease(
        { root, output, phase: "packages", preview: true },
        {
          pnpmVersion: async () => "12.3.5",
          packages: async () => {
            throw new Error("injected pack failure");
          },
        },
      ),
    ).rejects.toThrow("injected pack failure");
    expect((await readJson(join(output, "status.json"))).state).toBe("failed");
    await expect(readFile(join(output, "inventory.json"))).rejects.toThrow();
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test.each(["24.0.0", "24.12.0", "24.22.1", "v24.22.1", "25.1.0", "26.0.0-pre"])(
  "preparation accepts Node %s with eligible pnpm",
  (node) => {
    expect(preparationToolchainError(node, "12.3.4")).toBeUndefined();
  },
);

test.each([
  ["23.11.0", "12.3.4"],
  ["", "12.3.4"],
  ["24", "12.3.4"],
  ["x24.1.0", "12.3.4"],
  [undefined, "12.3.4"],
  ["24.22.1", "11.25.0"],
  ["24.22.1", "12.0.0-rc.1"],
  ["24.22.1", "12.3.4oops"],
  ["24.22.1", "12.3.4-.."],
  ["24.22.1", "12"],
])("preparation refuses Node %s with pnpm %s", (node, pnpm) => {
  expect(preparationToolchainError(node, pnpm)).toMatch(/Node 24 or later and pnpm 12 or later/u);
});

test("an ineligible pnpm is refused before the output destination is claimed", async () => {
  const parent = await mkdtemp(join(tmpdir(), "lace-release-pnpm-"));
  const output = join(parent, "out");
  try {
    await expect(
      prepareRelease(
        { root: process.cwd(), output, preview: true },
        { pnpmVersion: async () => "11.9.9" },
      ),
    ).rejects.toThrow("pnpm 12 or later");
    await expect(readdir(output)).rejects.toThrow();
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test.each(["12.0.0", "12.3.5", "12.18.0", "13.0.0"])("preparation accepts pnpm %s", (pnpm) =>
  expect(preparationToolchainError("24.22.3", pnpm)).toBeUndefined(),
);

test("an ineligible Node is refused before the output destination is claimed", async () => {
  const parent = await mkdtemp(join(tmpdir(), "lace-release-toolchain-"));
  const output = join(parent, "out");
  const nodeVersion = Object.getOwnPropertyDescriptor(process.versions, "node");
  try {
    Object.defineProperty(process.versions, "node", { value: "23.11.0", configurable: true });
    await expect(prepareRelease({ root: process.cwd(), output, preview: true })).rejects.toThrow(
      "Node 24 or later",
    );
  } finally {
    Object.defineProperty(process.versions, "node", nodeVersion);
  }
  await expect(readdir(output)).rejects.toThrow();
  await rm(parent, { recursive: true, force: true });
});

test("incomplete and dirty previews cannot claim publication eligibility", () => {
  const release = {
    packages: ["content"],
    images: { api: "image" },
    platforms: ["linux/amd64", "linux/arm64"],
  };
  const packages = [{ name: "@lacecms/content" }];
  const images = release.platforms.map((platform) => ({
    kind: "api",
    platform,
    smokePassed: true,
  }));
  expect(completeInventory(release, { preview: false }, packages, images).publicationEligible).toBe(
    true,
  );
  expect(completeInventory(release, { preview: true }, packages, images).publicationEligible).toBe(
    false,
  );
  expect(completeInventory(release, { preview: false }, packages, images.slice(1)).complete).toBe(
    false,
  );
  expect(completeInventory(release, { preview: false }, [], images).complete).toBe(false);
  expect(completeInventory(release, { preview: false }, [{ name: "wrong" }], images).complete).toBe(
    false,
  );
  expect(
    completeInventory(
      release,
      { preview: false },
      packages,
      images.map((item) => ({ ...item, smokePassed: false })),
    ).complete,
  ).toBe(false);
});

test("credentials, data and traversal cannot enter snapshots", () => {
  for (const path of [
    ".env",
    ".npmrc",
    "../escape",
    "/escape",
    ".aws/credentials",
    "data.sqlite",
    "node_modules/file",
    "apps/admin/dist/index.html",
  ])
    expect(safeSourcePath(path)).toBe(false);
  expect(safeSourcePath("packages/create-lace/templates/.env.example")).toBe(true);
});

test("Cloudflare platform archive requires packaged admin assets", async () => {
  const root = await mkdtemp(join(tmpdir(), "lace-release-admin-"));
  try {
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({
        name: "@lacecms/platform-cloudflare",
        version: "0.1.0-alpha.1",
        exports: { ".": { import: "./dist/index.js" } },
      }),
    );
    await mkdir(join(root, "dist"));
    await writeFile(join(root, "dist/index.js"), "export {};");
    const release = { version: "0.1.0-alpha.1", packages: ["platform-cloudflare"] };
    await expect(inspectPackage(root, release)).rejects.toThrow(
      "Missing packaged admin assets: @lacecms/platform-cloudflare: admin/index.html",
    );
    await mkdir(join(root, "admin/assets"), { recursive: true });
    await writeFile(join(root, "admin/index.html"), "<!doctype html>");
    await writeFile(join(root, "admin/assets/index.js"), "export {};");
    await expect(inspectPackage(root, release)).resolves.toMatchObject({
      name: "@lacecms/platform-cloudflare",
    });
    await writeFile(join(root, "admin/assets/index.js.map"), "{}");
    await expect(inspectPackage(root, release)).rejects.toThrow("Forbidden admin source map");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("archive verification rejects missing exports and forbidden files", async () => {
  const root = await mkdtemp(join(tmpdir(), "lace-release-archive-"));
  try {
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({
        name: "@lacecms/content",
        version: "0.1.0-alpha.1",
        exports: { ".": { import: "./dist/index.js" } },
      }),
    );
    const release = { version: "0.1.0-alpha.1", packages: ["content"] };
    await expect(inspectPackage(root, release)).rejects.toThrow("Missing archive entry point");
    await mkdir(join(root, "dist"));
    await writeFile(join(root, "dist/index.js"), "export {};");
    await expect(inspectPackage(root, release)).resolves.toMatchObject({
      name: "@lacecms/content",
    });
    await writeFile(join(root, ".env"), "SECRET=fixture");
    await expect(inspectPackage(root, release)).rejects.toThrow("Forbidden archive file");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI import schema is a bounded JSON data export, never a compiled entry point", async () => {
  const root = await mkdtemp(join(tmpdir(), "lace-release-schema-"));
  try {
    const schemaExport = "./schema/lace-import.schema.json";
    const manifest = {
      name: "@lacecms/cli",
      version: "0.1.0-rc1",
      exports: { "./lace-import.schema.json": schemaExport },
    };
    const release = { version: manifest.version, packages: ["cli", "content"] };
    const save = () => writeFile(join(root, "package.json"), JSON.stringify(manifest));
    await save();
    await expect(inspectPackage(root, release)).rejects.toThrow("Missing archive entry point");
    await mkdir(join(root, "schema"));
    await writeFile(
      join(root, schemaExport),
      await readFile(new URL("../packages/cli/schema/lace-import.schema.json", import.meta.url)),
    );
    await expect(inspectPackage(root, release)).resolves.toMatchObject({ name: "@lacecms/cli" });
    manifest.types = schemaExport;
    await save();
    await expect(inspectPackage(root, release)).rejects.toThrow("Invalid export path");
    delete manifest.types;
    manifest.name = "@lacecms/content";
    await save();
    await expect(inspectPackage(root, release)).rejects.toThrow("Invalid export path");
    manifest.name = "@lacecms/cli";
    manifest.exports["./other.json"] = "./schema/other.json";
    await writeFile(join(root, "schema/other.json"), "{}");
    await save();
    await expect(inspectPackage(root, release)).rejects.toThrow("Invalid export path");
    delete manifest.exports["./other.json"];
    await save();
    await writeFile(join(root, schemaExport), "not JSON");
    await expect(inspectPackage(root, release)).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("release preparation strips the source condition back to the published export maps", async () => {
  const published = await readJson(new URL("./fixtures/release-export-maps.json", import.meta.url));
  const packages = new URL("../packages/", import.meta.url);
  const stripped = {};
  for (const entry of (await readdir(packages, { withFileTypes: true })).filter((item) =>
    item.isDirectory(),
  )) {
    const manifest = await readJson(new URL(`${entry.name}/package.json`, packages));
    expect(JSON.stringify(manifest.exports)).toContain('"@lacecms/source"');
    stripped[manifest.name] = withoutSourceCondition(manifest.exports);
  }
  expect(stripped).toEqual(published);
  expect(JSON.stringify(stripped)).not.toContain("@lacecms/source");
  // The source-only test subpath leaves the published platform manifest.
  expect(stripped["@lacecms/platform-node"]).not.toHaveProperty("./test");
});

test("a source condition left with only a default collapses, and a source-only export goes", () => {
  const exports = {
    ".": {
      "@lacecms/source": "./src/index.ts",
      types: "./dist/index.d.ts",
      import: "./dist/index.js",
    },
    "./Box.astro": { "@lacecms/source": "./src/Box.astro", default: "./dist/Box.astro" },
    "./data.json": "./schema/data.json",
    "./test": { "@lacecms/source": "./src/test-support/harness.ts" },
  };
  expect(withoutSourceCondition(exports)).toEqual({
    ".": { types: "./dist/index.d.ts", import: "./dist/index.js" },
    "./Box.astro": "./dist/Box.astro",
    "./data.json": "./schema/data.json",
  });
  expect(exports["./Box.astro"]).toHaveProperty("@lacecms/source");
});

test("archive inspection refuses an export that still points at source", async () => {
  const root = await mkdtemp(join(tmpdir(), "lace-release-source-export-"));
  try {
    const manifest = {
      name: "@lacecms/content",
      version: "0.1.0-rc1",
      exports: {
        ".": {
          "@lacecms/source": "./src/index.ts",
          types: "./dist/index.d.ts",
          import: "./dist/index.js",
        },
      },
    };
    await writeFile(join(root, "package.json"), JSON.stringify(manifest));
    await mkdir(join(root, "dist"));
    await writeFile(join(root, "dist/index.js"), "export {};\n");
    await writeFile(join(root, "dist/index.d.ts"), "export {};\n");
    await expect(
      inspectPackage(root, { version: manifest.version, packages: ["content"] }),
    ).rejects.toThrow("Invalid export path: @lacecms/content: ./src/index.ts");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
