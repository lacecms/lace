import {
  mkdtemp,
  readFile,
  mkdir,
  writeFile,
  rm,
  open,
  stat,
  utimes,
  readdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { platformReleaseVersion } from "../scripts/platform-release-version.mjs";

test("platform release generation uses the platform manifest and rejects drift", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lace-release-version-"));
  try {
    await mkdir(join(directory, "src"));
    await writeFile(
      join(directory, "package.json"),
      JSON.stringify({
        name: "@lacecms/platform-cloudflare",
        version: "1.2.3-alpha.7",
      }),
    );
    await platformReleaseVersion(directory);
    expect(await readFile(join(directory, "src/release-version.ts"), "utf8")).toContain(
      'engineVersion = "1.2.3-alpha.7"',
    );
    await platformReleaseVersion(directory, { check: true });
    await writeFile(
      join(directory, "src/release-version.ts"),
      'export const engineVersion = "0.0.0";',
    );
    await expect(platformReleaseVersion(directory, { check: true })).rejects.toThrow("Stale");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("generation preserves unchanged files and replaces changed versions atomically", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lace-release-version-"));
  try {
    const source = join(directory, "src/release-version.ts");
    const manifest = join(directory, "package.json");
    const writeManifest = (version) =>
      writeFile(manifest, JSON.stringify({ name: "@lacecms/platform-node", version }));
    await mkdir(join(directory, "src"));
    await writeManifest("1.2.3");
    await platformReleaseVersion(directory);
    const original = await readFile(source, "utf8");
    const timestamp = new Date("2000-01-01T00:00:00Z");
    await utimes(source, timestamp, timestamp);
    await Promise.all(Array.from({ length: 20 }, () => platformReleaseVersion(directory)));
    expect((await stat(source)).mtimeMs).toBe(timestamp.getTime());

    // An already-open reader must retain the complete old source while new
    // readers see the complete replacement, rather than a truncated inode.
    const reader = await open(source, "r");
    try {
      await writeManifest("1.2.4");
      await Promise.all(Array.from({ length: 20 }, () => platformReleaseVersion(directory)));
      expect(await reader.readFile("utf8")).toBe(original);
      expect(await readFile(source, "utf8")).toContain('engineVersion = "1.2.4"');
      await platformReleaseVersion(directory, { check: true });
      expect(await readdir(join(directory, "src"))).toEqual(["release-version.ts"]);
    } finally {
      await reader.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
