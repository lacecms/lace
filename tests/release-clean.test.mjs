import { expect, test } from "vitest";
import { mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { lifecycleFixture } from "./release-lifecycle-fixture.mjs";
import { finalizeGithub } from "../scripts/release-github.mjs";
import {
  cleanRelease,
  acceptanceSelection,
  validateCleanupPaths,
} from "../scripts/release-clean.mjs";
import { verifyPublishedInventory } from "../scripts/release-verify-published.mjs";
import { acquireArtifactLock } from "../scripts/release-lock.mjs";

async function use(work) {
  const f = await lifecycleFixture();
  try {
    const published = (inventory, directory) =>
      verifyPublishedInventory(inventory, directory, f.operations);
    await finalizeGithub(
      { directory: f.directory, root: f.root, apply: true },
      { github: f.github, published },
    );
    const options = { directory: f.directory, root: f.root };
    const operations = { github: f.github, registry: f.operations };
    await work(f, options, operations);
  } finally {
    await f.cleanup();
  }
}

const exists = (path) =>
  readFile(path).then(
    () => true,
    (error) => {
      if (error.code === "ENOENT") return false;
      throw error;
    },
  );

test("index-ID graphs pass public verification, GitHub finalization and cleanup preflight", async () => {
  const f = await lifecycleFixture({ indexed: true });
  try {
    const published = (inventory, directory) =>
      verifyPublishedInventory(inventory, directory, f.operations);
    const reports = await published(f.inventory, f.directory);
    expect(reports.images.items).toHaveLength(2);
    await finalizeGithub(
      { directory: f.directory, root: f.root, apply: true },
      { github: f.github, published },
    );
    const result = await cleanRelease(
      { directory: f.directory, root: f.root },
      { github: f.github, registry: f.operations },
    );
    expect(result).toBeDefined();
    expect(await exists(join(f.directory, "inventory.json"))).toBe(true);
    const coordinate = `${f.inventory.release.images.api}:${f.inventory.release.version}`;
    const root = f.remote.get(coordinate);
    f.imageGraph.index(coordinate, root.manifests.slice(0, -1));
    await expect(
      cleanRelease(
        { directory: f.directory, root: f.root, apply: true },
        { github: f.github, registry: f.operations },
      ),
    ).rejects.toThrow();
    expect(await exists(join(f.directory, "inventory.json"))).toBe(true);
  } finally {
    await f.cleanup();
  }
});

test("cleanup preview shows bounded sizes and makes no changes; explicit apply preserves other versions", () =>
  use(async (f, options, operations) => {
    const other = join(f.root, ".release-artifacts/other");
    await mkdir(other);
    await writeFile(join(other, "keep"), "other");
    const evidence = join(f.root, ".release-artifacts/evidence");
    await mkdir(evidence);
    await writeFile(join(evidence, "log"), "local");
    const before = f.mutations.length;
    const preview = await cleanRelease({ ...options, evidence: [evidence] }, operations);
    expect(preview.action).toBe("would-clean");
    expect(preview.selected).toHaveLength(2);
    expect(preview.selected[0].bytes).toBeGreaterThan(0);
    expect(await exists(join(f.directory, "inventory.json"))).toBe(true);
    expect(f.mutations).toHaveLength(before);
    expect(await readdir(join(f.root, ".release-artifacts/.locks"))).toEqual([]);
    expect(
      await cleanRelease({ ...options, evidence: [evidence], apply: true }, operations),
    ).toMatchObject({ action: "cleaned" });
    expect(await exists(join(other, "keep"))).toBe(true);
    expect(await exists(join(evidence, "log"))).toBe(false);
    expect(await cleanRelease({ ...options, apply: true }, operations)).toMatchObject({
      action: "already-clean",
    });
  }));

test("cleanup requires full remote publication and published byte-identical GitHub evidence", () =>
  use(async (f, options, operations) => {
    f.release.draft = true;
    await expect(cleanRelease({ ...options, apply: true }, operations)).rejects.toThrow(
      "Published GitHub",
    );
    f.release.draft = false;
    f.assetBytes.set(f.release.assets[0].id, Buffer.from("changed"));
    await expect(cleanRelease({ ...options, apply: true }, operations)).rejects.toThrow(
      "bytes conflict",
    );
    expect(await exists(join(f.directory, "inventory.json"))).toBe(true);
    await expect(
      cleanRelease(
        { ...options, apply: true },
        {
          ...operations,
          registry: {
            ...f.operations,
            lookupPackage: async () => {
              throw new Error("auth unavailable");
            },
          },
        },
      ),
    ).rejects.toThrow("auth unavailable");
    expect(await exists(join(f.directory, "inventory.json"))).toBe(true);
  }));

test("cleanup rejects root, escapes, globs, tracked paths and symlinks before mutation", () =>
  use(async (f, options, operations) => {
    for (const directory of [
      join(f.root, ".release-artifacts"),
      f.root,
      join(f.root, ".release-artifacts/*"),
      join(f.directory, "packages"),
    ])
      await expect(
        cleanRelease({ ...options, directory, apply: true }, operations),
      ).rejects.toThrow();
    const linked = join(f.root, ".release-artifacts/linked");
    await symlink(f.directory, linked);
    await expect(
      cleanRelease({ ...options, directory: linked, apply: true }, operations),
    ).rejects.toThrow("symlink");
    await symlink(join(f.root, "CHANGELOG.md"), join(f.directory, "escape"));
    await expect(cleanRelease(options, operations)).rejects.toThrow("escaping symlink");
    await rm(join(f.directory, "escape"));
    execFileSync("git", ["-C", f.root, "add", "--force", join(f.directory, "status.json")]);
    await expect(cleanRelease({ ...options, apply: true }, operations)).rejects.toThrow(
      "tracked files",
    );
  }));

test("cleanup blocks active operations and cannot disguise another candidate as evidence", () =>
  use(async (f, options, operations) => {
    const release = await acquireArtifactLock(f.directory, "acceptance");
    await expect(cleanRelease(options, operations)).rejects.toThrow("active");
    await release();
    const other = join(f.root, ".release-artifacts/other");
    await mkdir(other);
    await writeFile(join(other, "status.json"), "{}");
    await expect(validateCleanupPaths(f.root, f.directory, [other])).rejects.toThrow(
      "another release",
    );
    expect(await exists(join(f.directory, "inventory.json"))).toBe(true);
  }));

test("partial deletion retries use recorded identity and refuse changed scope", () =>
  use(async (f, options, operations) => {
    let count = 0;
    await expect(
      cleanRelease(
        { ...options, apply: true },
        {
          ...operations,
          remove: async (path) => {
            if (++count === 2) throw new Error("disk failure");
            await rm(path, { recursive: true, force: true });
          },
        },
      ),
    ).rejects.toThrow("Cleanup interrupted");
    expect(await exists(join(f.directory, "inventory.json"))).toBe(true);
    const extra = join(f.root, ".release-artifacts/extra");
    await mkdir(extra);
    await expect(
      cleanRelease({ ...options, evidence: [extra], apply: true }, operations),
    ).rejects.toThrow("scope changed");
    expect(await cleanRelease({ ...options, apply: true }, operations)).toMatchObject({
      action: "cleaned",
    });
    expect(await readdir(join(f.root, ".release-artifacts/.cleanup"))).toEqual([]);
  }));

test("a changed remaining archive or changed remote identity blocks a cleanup retry", () =>
  use(async (f, options, operations) => {
    await expect(
      cleanRelease(
        { ...options, apply: true },
        {
          ...operations,
          remove: async () => {
            throw new Error("disk failure");
          },
        },
      ),
    ).rejects.toThrow("interrupted");
    const path = join(f.directory, f.inventory.packages[0].file);
    await writeFile(path, "changed");
    await expect(cleanRelease({ ...options, apply: true }, operations)).rejects.toThrow(
      "checksum differs",
    );
  }));

test("selected acceptance stack stops only on apply; invalid state and stop failure retain release data", () =>
  use(async (f, options, operations) => {
    const stack = join(f.root, ".lace-acceptance");
    await mkdir(stack);
    await writeFile(join(stack, ".env"), "test-only");
    await writeFile(
      join(stack, "state.json"),
      JSON.stringify({ project: "lace-acceptance-0123456789", port: 4000 }),
    );
    let stopped = 0;
    const stopAcceptance = async () => {
      stopped++;
      throw new Error("stop failure");
    };
    await cleanRelease(options, { ...operations, stopAcceptance });
    expect(stopped).toBe(0);
    expect(
      await cleanRelease({ ...options, acceptance: true }, { ...operations, stopAcceptance }),
    ).toMatchObject({ acceptance: "lace-acceptance-0123456789" });
    expect(stopped).toBe(0);
    await expect(
      cleanRelease(
        { ...options, acceptance: true, apply: true },
        { ...operations, stopAcceptance },
      ),
    ).rejects.toThrow("stop failure");
    expect(await exists(join(f.directory, "inventory.json"))).toBe(true);
    expect(await exists(join(stack, "state.json"))).toBe(true);
    await writeFile(join(stack, "state.json"), JSON.stringify({ project: "lace-dev", port: 4000 }));
    await expect(acceptanceSelection(f.root)).rejects.toThrow("Invalid named");
    await writeFile(
      join(stack, "state.json"),
      JSON.stringify({ project: "lace-acceptance-0123456789", port: 4000 }),
    );
    await cleanRelease(
      { ...options, acceptance: true, apply: true },
      { ...operations, stopAcceptance: async () => rm(stack, { recursive: true }) },
    );
    expect(await exists(join(stack, "state.json"))).toBe(false);
  }));

test("blocked preview reports selected paths and missing prerequisites without deletion", () =>
  use(async (f, options, operations) => {
    const report = await cleanRelease(options, {
      ...operations,
      registry: {
        ...f.operations,
        lookupPackage: async () => {
          throw new Error("registry unavailable");
        },
      },
    });
    expect(report).toMatchObject({
      action: "blocked",
      unmetPrerequisites: ["registry unavailable"],
    });
    expect(report.selected[0].bytes).toBeGreaterThan(0);
    expect(await exists(join(f.directory, "inventory.json"))).toBe(true);
  }));

test("retry succeeds even after archive directories and final target were removed", () =>
  use(async (f, options, operations) => {
    await expect(
      cleanRelease(
        { ...options, apply: true },
        {
          ...operations,
          remove: async (path) => {
            await rm(path, { recursive: true, force: true });
            if (path === f.directory) throw new Error("interrupted after target removal");
          },
        },
      ),
    ).rejects.toThrow("interrupted");
    expect(await exists(join(f.directory, "inventory.json"))).toBe(false);
    expect(await cleanRelease({ ...options, apply: true }, operations)).toMatchObject({
      action: "cleaned",
    });
    expect(await readdir(join(f.root, ".release-artifacts/.cleanup"))).toEqual([]);
  }));
