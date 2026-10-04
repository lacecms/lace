import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, test } from "vitest";
import {
  claimOutput,
  completeInventory,
  inspectPackage,
  safeSourcePath,
  snapshotSource,
} from "../scripts/release-artifacts.mjs";
import { readJson, readReleaseModel } from "../scripts/release-model.mjs";
import { prepareRelease } from "../scripts/release.mjs";

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
    // working tree's template can advance independently of a published alpha.
    const root = join(parent, "source");
    const model = await readReleaseModel(new URL("..", import.meta.url).pathname);
    const fixtureFile = async (path, contents) => {
      const file = join(root, path);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, contents);
    };
    await fixtureFile(
      "release/alpha.json",
      JSON.stringify({ ...model.definition, templateVersion: model.templateVersion }),
    );
    await fixtureFile("package.json", JSON.stringify(model.rootManifest));
    for (const { directory, manifest } of Object.values(model.manifests))
      await fixtureFile(`${directory}/package.json`, JSON.stringify(manifest));
    for (const [index, path] of ["package.json", "site/package.json"].entries())
      await fixtureFile(
        `packages/create-lace/templates/${path}`,
        JSON.stringify(model.templates[index]),
      );
    await fixtureFile(
      "packages/create-lace/src/inventory.ts",
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
