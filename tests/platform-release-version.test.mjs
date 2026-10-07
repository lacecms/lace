import { mkdtemp, readFile, mkdir, writeFile, rm } from "node:fs/promises";
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
