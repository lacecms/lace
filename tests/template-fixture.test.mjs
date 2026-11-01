import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const root = fileURLToPath(new URL("fixtures/", import.meta.url));
const directories = (await readdir(root, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && /^template-\d+\.\d+\.\d+$/u.test(entry.name))
  .map((entry) => entry.name)
  .sort();
assert.ok(directories.length > 0, "No published-template fixtures retained");

async function verifyFixture(path, version) {
  const fixture = JSON.parse(await readFile(path, "utf8"));
  const provenance = fixture.provenance;
  assert.equal(provenance.templateVersion, version, `${path}: provenance version`);
  assert.match(provenance.sourceRevision, /^[a-f0-9]{40}$/u, `${path}: source revision`);
  assert.match(provenance.generator, /^create-lace@\S+$/u, `${path}: generator`);
  assert.match(provenance.archiveSha256, /^[a-f0-9]{64}$/u, `${path}: generator digest`);
  assert.match(provenance.registryIntegrity, /^sha512-\S+$/u, `${path}: registry digest`);
  const manifest = JSON.parse(fixture.files[".lace/manifest.json"]);
  assert.equal(manifest.templateVersion, version, `${path}: manifest version`);
  for (const [name, record] of Object.entries(manifest.files)) {
    if (record.owner !== "managed") continue;
    assert.equal(
      createHash("sha256").update(fixture.files[name]).digest("hex"),
      record.sha256,
      `${path}: ${name}`,
    );
  }
}

for (const directory of directories) {
  const version = directory.slice("template-".length);
  for (const variant of ["default", "cloudflare"]) {
    const path = join(root, directory, `${variant}.json`);
    test(`${directory}/${variant} retains provenance, manifest and managed digests`, async () => {
      await verifyFixture(path, version);
    });
  }
}

test("fixture verification rejects changed managed bytes in a temporary copy", async () => {
  const directory = directories[0];
  const fixture = JSON.parse(await readFile(join(root, directory, "default.json"), "utf8"));
  const manifest = JSON.parse(fixture.files[".lace/manifest.json"]);
  const [name] = Object.entries(manifest.files).find(([, record]) => record.owner === "managed");
  fixture.files[name] += "x";
  const temporary = await mkdtemp(join(tmpdir(), "lace-template-fixture-"));
  try {
    const path = join(temporary, "default.json");
    await writeFile(path, JSON.stringify(fixture));
    await expect(verifyFixture(path, directory.slice("template-".length))).rejects.toThrow(name);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
