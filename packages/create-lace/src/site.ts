import { lstat, readFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { dirname, join, relative, resolve, sep } from "node:path";

export type SiteMode = "starter" | "existing" | "none";
export const SITE_MODES: readonly SiteMode[] = ["starter", "existing", "none"];

export type SiteSelection =
  | { readonly mode: "starter" }
  | { readonly mode: "existing"; readonly path: string }
  | { readonly mode: "none" };

/** Manifest record: starter uses `site`, existing its relative path, none `null`. */
export type SiteRecord =
  | { readonly mode: "starter"; readonly path: "site" }
  | { readonly mode: "existing"; readonly path: string }
  | { readonly mode: "none"; readonly path: null };

export class SiteError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "SiteError";
  }
}

const ASTRO_CONFIGS = ["mjs", "js", "ts", "mts", "cjs", "cts"].map((ext) => `astro.config.${ext}`);
const SEGMENT = /^[A-Za-z0-9._-]+$/u;

export function siteRecord(site: SiteSelection): SiteRecord {
  if (site.mode === "starter") return { mode: "starter", path: "site" };
  if (site.mode === "existing") return { mode: "existing", path: site.path };
  return { mode: "none", path: null };
}

/** The `create-lace` flags that generate a project for this site. */
export function siteFlags(site: SiteSelection): string {
  if (site.mode === "existing") return `--existing-site ${site.path}`;
  return site.mode === "starter" ? "--starter" : "--no-site";
}

/**
 * Validates the typed path grammar and returns it without a trailing slash.
 * Returns undefined when the path is not acceptable.
 */
export function normalizeSitePath(path: string): string | undefined {
  const trimmed = path.endsWith("/") ? path.slice(0, -1) : path;
  if (trimmed.length === 0 || trimmed.startsWith("/")) return undefined;
  const segments = trimmed.split("/");
  const valid = segments.every(
    (segment) =>
      SEGMENT.test(segment) &&
      !segment.startsWith("-") &&
      (segment === ".." || !/^\.+$/u.test(segment)),
  );
  return valid ? trimmed : undefined;
}

export function requireSitePath(path: string): string {
  const normalized = normalizeSitePath(path);
  if (normalized === undefined)
    throw new SiteError(
      `Invalid existing-site path "${path}": use a relative POSIX path of letters, digits, ".", "_" and "-" segments (no empty, "." or leading "-" segments), such as "..".`,
    );
  return normalized;
}

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

export interface Prompter {
  readonly ask: (question: string) => Promise<string | undefined>;
  readonly close: () => void;
}

/** Line-buffered prompts; lines that arrive before a question are kept. */
export function createPrompter(
  input: NodeJS.ReadableStream,
  output: Pick<NodeJS.WriteStream, "write">,
): Prompter {
  const lines = createInterface({ input, terminal: false, crlfDelay: Infinity });
  const iterator = lines[Symbol.asyncIterator]();
  return {
    ask: async (question) => {
      output.write(question);
      const next = await iterator.next();
      return next.done === true ? undefined : next.value;
    },
    close: () => lines.close(),
  };
}

const ATTEMPTS = 3;

/**
 * Asks for the site mode and, for an existing site, its path. Returns undefined
 * after three invalid answers or at end of input.
 */
export async function promptSite(
  prompter: Prompter,
  output: Pick<NodeJS.WriteStream, "write">,
  detected: boolean,
): Promise<SiteSelection | undefined> {
  const fallback = detected ? "2" : "1";
  output.write(
    `Site mode${detected ? " (an Astro project was detected in the parent directory)" : ""}:\n` +
      "  1) starter   generate an example Astro site in site/\n" +
      "  2) existing  connect an existing Astro site outside this project\n" +
      "  3) none      CMS only, no site\n",
  );
  let mode: SiteMode | undefined;
  for (let attempt = 0; attempt < ATTEMPTS && mode === undefined; attempt++) {
    const answer = await prompter.ask(`Choose 1-3 [${fallback}]: `);
    if (answer === undefined) return undefined;
    const value = answer.trim().toLowerCase() || fallback;
    mode = ({ "1": "starter", "2": "existing", "3": "none" } as Record<string, SiteMode>)[value];
    mode ??= SITE_MODES.find((name) => name === value);
    if (mode === undefined) output.write("Enter 1, 2 or 3.\n");
  }
  if (mode === undefined) return undefined;
  if (mode !== "existing") return { mode };
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const answer = await prompter.ask("Existing Astro site path, relative to the project [..]: ");
    if (answer === undefined) return undefined;
    const path = normalizeSitePath(answer.trim() || "..");
    if (path !== undefined) return { mode, path };
    output.write('Enter a relative path such as "..".\n');
  }
  return undefined;
}
