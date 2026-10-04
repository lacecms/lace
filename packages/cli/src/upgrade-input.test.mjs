import { mkdtemp, mkdir, writeFile, symlink, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { mergedManifest } from "../dist/upgrade-journal.js";
import {
  assertSameSite,
  manifestSite,
  readUpgradeFile,
  readUpgradeManifest,
  readTargetTemplate,
  upgradeHash,
  validateUpgradeManifest,
} from "../dist/upgrade-input.js";

const roots = [];
async function root() {
  const path = await realpath(await mkdtemp(join(tmpdir(), "lace-upgrade-")));
  roots.push(path);
  return path;
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});
const manifest = (files = {}) => ({ schemaVersion: 1, templateVersion: "0.2.1", files });
const managed = { owner: "managed", sha256: upgradeHash(Buffer.from("content")) };

describe("upgrade inputs", () => {
  it.each([
    { mode: "starter", path: "site" },
    { mode: "existing", path: ".." },
    { mode: "existing", path: "../../web_site-1" },
    { mode: "none", path: null },
  ])("accepts the site record %j and keeps manifest key order", (site) => {
    const value = { schemaVersion: 1, templateVersion: "0.11.0", site, files: {} };
    const validated = validateUpgradeManifest(value);
    expect(validated.site).toEqual(site);
    expect(Object.keys(validated)).toEqual(["schemaVersion", "templateVersion", "site", "files"]);
    expect(manifestSite(validated)).toEqual(site);
  });
  it("reads a manifest without a site record as starter mode and keeps it absent", () => {
    const validated = validateUpgradeManifest(manifest());
    expect(validated).not.toHaveProperty("site");
    expect(manifestSite(validated)).toEqual({ mode: "starter", path: "site" });
  });
  it.each([
    null,
    "starter",
    { mode: "starter", path: "web" },
    { mode: "starter" },
    { mode: "existing", path: "/srv/site" },
    { mode: "existing", path: "." },
    { mode: "existing", path: "../-x" },
    { mode: "existing", path: "a//b" },
    { mode: "existing", path: "..\\web" },
    { mode: "existing", path: null },
    { mode: "none", path: "site" },
    { mode: "none", path: null, extra: true },
    { mode: "headless", path: null },
  ])("rejects the invalid site record %j", (site) => {
    expect(() => validateUpgradeManifest({ ...manifest(), site })).toThrow(
      "Invalid manifest site record.",
    );
  });
  it("requires the template to match the project's site mode and path", () => {
    const legacy = validateUpgradeManifest(manifest());
    const starter = validateUpgradeManifest({
      ...manifest(),
      site: { mode: "starter", path: "site" },
    });
    const existing = (path) =>
      validateUpgradeManifest({ ...manifest(), site: { mode: "existing", path } });
    expect(() => assertSameSite(legacy, starter)).not.toThrow();
    expect(() => assertSameSite(existing(".."), existing(".."))).not.toThrow();
    expect(() => assertSameSite(existing(".."), existing("../web"))).toThrow(
      "create-lace <dir> --existing-site ..",
    );
    expect(() => assertSameSite(legacy, existing(".."))).toThrow("create-lace <dir> --starter");
  });
  it("merged manifests take the target's site record", () => {
    const legacy = validateUpgradeManifest(manifest({ "README.md": { owner: "user" } }));
    const target = validateUpgradeManifest({
      ...manifest({ "README.md": { owner: "user" } }),
      site: { mode: "starter", path: "site" },
    });
    expect(mergedManifest(legacy, target).site).toEqual({ mode: "starter", path: "site" });
  });
  it("accepts existing generator metadata and sorts paths", () => {
    expect(
      Object.keys(
        validateUpgradeManifest(manifest({ "z.txt": managed, "a.txt": { owner: "user" } })).files,
      ),
    ).toEqual(["a.txt", "z.txt"]);
  });
  it.each([
    null,
    [],
    { ...manifest(), schemaVersion: 2 },
    { ...manifest(), templateVersion: "../secret" },
    { ...manifest(), extra: true },
    { ...manifest(), files: [] },
    manifest({ "a.txt": { owner: "user", sha256: managed.sha256 } }),
    manifest({ "a.txt": { ...managed, sha256: "A".repeat(64) } }),
    manifest({ "a.txt": { owner: "other" } }),
    manifest({ "site/file": managed }),
    manifest({ "SITE/file": managed }),
    manifest({ "LACE.CONFIG.TS": managed }),
    manifest({ "lace.config.ts": managed }),
    manifest({ a: managed, "a/b": managed }),
  ])("rejects malformed/unknown manifest %j", (value) => {
    expect(() => validateUpgradeManifest(value)).toThrow();
  });
  it.each([
    "../outside",
    "/absolute",
    "a//b",
    "a/./b",
    "a/../b",
    ".lace/manifest.json",
    ".LACE/manifest.json",
    "a\\b",
    "C:/file",
    "a\nfile",
    "constructor/file",
    "a/",
  ])("rejects unsafe path %s", (path) => {
    expect(() => validateUpgradeManifest(manifest({ [path]: managed }))).toThrow("unsafe");
  });
  it("refuses symlink leaf, ancestor and root without reading the target", async () => {
    const path = await root();
    const outside = await root();
    await writeFile(join(outside, "file"), "content");
    await symlink(join(outside, "file"), join(path, "leaf"));
    await symlink(outside, join(path, "parent"));
    await expect(readUpgradeFile(path, "leaf")).rejects.toThrow("symbolic");
    await expect(readUpgradeFile(path, "parent/file")).rejects.toThrow("symbolic");
    await expect(readUpgradeFile(join(path, "parent"), "file")).rejects.toThrow("symbolic");
  });
  it("refuses directories and missing or invalid manifests", async () => {
    const path = await root();
    await expect(readUpgradeFile(path, "missing")).resolves.toBeUndefined();
    await expect(readUpgradeFile(path, ".")).rejects.toThrow("regular");
    await expect(readUpgradeManifest(path)).rejects.toThrow("Missing");
    await mkdir(join(path, ".lace"));
    await writeFile(join(path, ".lace/manifest.json"), "{invalid");
    await expect(readUpgradeManifest(path)).rejects.toThrow("JSON");
  });
  it("verifies target hashes and never reads user-owned bytes", async () => {
    const path = await root();
    const metadata = validateUpgradeManifest(
      manifest({ file: managed, "site/source": { owner: "user" } }),
    );
    await expect(readTargetTemplate(path, metadata)).rejects.toThrow("pristine");
    await writeFile(join(path, "file"), "modified");
    await expect(readTargetTemplate(path, metadata)).rejects.toThrow("pristine");
    await writeFile(join(path, "file"), "content");
    expect([...(await readTargetTemplate(path, metadata))].map(([name]) => name)).toEqual(["file"]);
  });
});
