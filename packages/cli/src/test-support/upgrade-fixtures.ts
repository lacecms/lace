import { mkdtemp, realpath, mkdir, writeFile, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach } from "vitest";
import { createHash } from "node:crypto";
type FixtureFiles = Record<string, string | { bytes: string | Uint8Array; user?: boolean }>;
const upgradeHash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
export async function directory() {
  const root = await realpath(await mkdtemp(join(tmpdir(), "lace-apply-")));
  roots.push(root);
  return root;
}
export async function project(files: FixtureFiles, version = "1") {
  const root = await directory(),
    inventory: Record<string, { owner: "user" } | { owner: "managed"; sha256: string }> = {};
  for (const [path, value] of Object.entries(files)) {
    const bytes = Buffer.from(typeof value === "string" ? value : value.bytes);
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), bytes);
    inventory[path] =
      typeof value !== "string" && value.user
        ? { owner: "user" }
        : { owner: "managed", sha256: upgradeHash(bytes) };
  }
  await mkdir(join(root, ".lace"));
  await writeFile(
    join(root, ".lace/manifest.json"),
    JSON.stringify({
      schemaVersion: 1,
      templateVersion: version,
      site: { mode: "starter", path: "site" },
      files: inventory,
    }),
  );
  return root;
}
export async function pair(old: FixtureFiles, next: FixtureFiles) {
  return { project: await project(old), template: await project(next, "2") };
}
export async function snapshot(root: string, metadata = true) {
  const files: Record<string, string> = {};
  async function visit(dir: string, prefix = "") {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = prefix + entry.name;
      if (!metadata && (path === ".lace/upgrade" || path === ".lace/conflicts")) continue;
      if (entry.isDirectory()) await visit(join(dir, entry.name), `${path}/`);
      else files[path] = (await readFile(join(dir, entry.name))).toString("base64");
    }
  }
  await visit(root);
  return files;
}
