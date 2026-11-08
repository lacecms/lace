import { lstat, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { requireSitePath, SiteError } from "./modes.js";

const ASTRO_CONFIGS = ["mjs", "js", "ts", "mts", "cjs", "cts"].map((ext) => `astro.config.${ext}`);

async function maybeLstat(path: string): Promise<Awaited<ReturnType<typeof lstat>> | undefined> {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

/** True when the directory holds `astro.config.*` and a package.json declaring astro. */
export async function isAstroProject(directory: string): Promise<boolean> {
  let config = false;
  for (const name of ASTRO_CONFIGS) {
    if ((await maybeLstat(join(directory, name)))?.isFile()) config = true;
  }
  if (!config || !(await maybeLstat(join(directory, "package.json")))?.isFile()) return false;
  try {
    const manifest = JSON.parse(await readFile(join(directory, "package.json"), "utf8")) as {
      dependencies?: Record<string, unknown>;
      devDependencies?: Record<string, unknown>;
    };
    return (
      Object.hasOwn(manifest?.dependencies ?? {}, "astro") ||
      Object.hasOwn(manifest?.devDependencies ?? {}, "astro")
    );
  } catch {
    return false;
  }
}

/**
 * Checks that the existing site lies outside the target, is reached without
 * symbolic links and is an Astro project root. Never writes anything.
 */
export async function validateExistingSite(target: string, path: string): Promise<string> {
  const normalized = requireSitePath(path);
  const root = resolve(target);
  const site = resolve(root, normalized);
  const inside = relative(root, site);
  if (inside === "" || (!inside.startsWith(`..${sep}`) && inside !== ".."))
    throw new SiteError(
      `Existing site "${normalized}" must resolve outside the generated project; use a path such as "..".`,
    );
  let cursor = root;
  for (const segment of normalized.split("/")) {
    if (segment === "..") {
      cursor = dirname(cursor);
      continue;
    }
    cursor = join(cursor, segment);
    const stat = await maybeLstat(cursor);
    if (stat === undefined)
      throw new SiteError(`Existing site path does not exist: ${normalized}.`);
    if (stat.isSymbolicLink())
      throw new SiteError(
        `Existing site path "${normalized}" must not pass through a symbolic link.`,
      );
    if (!stat.isDirectory())
      throw new SiteError(`Existing site path "${normalized}" must be a directory.`);
  }
  if (!(await maybeLstat(site))?.isDirectory())
    throw new SiteError(`Existing site path does not exist: ${normalized}.`);
  if (!(await isAstroProject(site)))
    throw new SiteError(
      `Existing site "${normalized}" is not an Astro project root: it needs astro.config.* and a package.json declaring astro.`,
    );
  return normalized;
}
