import { randomUUID } from "node:crypto";
import { readFile, writeFile, rename, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

export function releaseVersionSource(version) {
  if (!/^\d+\.\d+\.\d+(?:-[\dA-Za-z.-]+)?$/u.test(version) || version === "0.0.0")
    throw new Error("Invalid platform release version");
  return `// Generated from this platform package's manifest; run its build to refresh.\nexport const engineVersion = ${JSON.stringify(version)};\n`;
}

export async function platformReleaseVersion(directory, { check = false } = {}) {
  const manifest = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
  if (!/^@lacecms\/platform-(?:node|cloudflare)$/u.test(manifest.name))
    throw new Error("Expected a Lace platform package");
  const source = releaseVersionSource(manifest.version);
  const destination = join(directory, "src/release-version.ts");
  if (check) {
    if ((await readFile(destination, "utf8")) !== source)
      throw new Error(`Stale platform release version: ${manifest.name}`);
  } else {
    const current = await readFile(destination, "utf8").catch((error) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    });
    if (current === source) return;
    // Build and typecheck can read this source concurrently. Never expose a
    // truncated destination, even when regenerating a changed release version.
    const temporary = `${destination}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, source, { flag: "wx" });
      await rename(temporary, destination);
    } finally {
      await rm(temporary, { force: true });
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await platformReleaseVersion(process.cwd(), { check: process.argv.includes("--check") });
