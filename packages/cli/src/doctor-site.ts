import { dirname, join, resolve } from "node:path";
import { validateLock, LOCK_FILE } from "./blocks-site.js";
import type { DoctorIO } from "./doctor-io.js";
import { observation } from "./doctor-probes.js";
import type { Observation } from "./doctor-report.js";
import { manifestSite, validateUpgradeManifest } from "./upgrade-input.js";

const ASTRO_CONFIGS = ["mjs", "js", "ts", "mts", "cjs", "cts"].map((ext) => `astro.config.${ext}`);
const SITE_PACKAGES = ["@lacecms/astro", "@lacecms/render"] as const;

const missing = (error: unknown): boolean => (error as { code?: string })?.code === "ENOENT";

/** Reads a bounded regular file; undefined when absent, throws on other failures. */
async function optional(io: DoctorIO, path: string, signal: AbortSignal) {
  try {
    return await io.file(path, signal);
  } catch (error) {
    if (missing(error)) return undefined;
    throw error;
  }
}

/** A directory probe: the bounded reader refuses directories but reports absence. */
async function exists(io: DoctorIO, path: string, signal: AbortSignal): Promise<boolean> {
  try {
    await io.file(path, signal);
    return true;
  } catch (error) {
    return !missing(error);
  }
}

/** Nearest installed package, walking up from the site like Node resolution. */
async function installed(io: DoctorIO, site: string, name: string, signal: AbortSignal) {
  for (let directory = site; ; directory = dirname(directory)) {
    if (
      (await optional(io, join(directory, "node_modules", name, "package.json"), signal)) !==
      undefined
    )
      return true;
    if (dirname(directory) === directory) return false;
  }
}

/** Manifest-driven site check; reads only, never follows a final symbolic link. */
export async function siteCheck(
  io: DoctorIO,
  cwd: string,
  signal: AbortSignal,
): Promise<Observation> {
  let text: string | undefined;
  try {
    text = await optional(io, resolve(cwd, ".lace/manifest.json"), signal);
  } catch {
    text = "";
  }
  if (text === undefined)
    return observation(
      "skipped",
      "SITE_NOT_APPLICABLE",
      "No .lace/manifest.json in this directory; the site mode is unknown.",
      "Run doctor from a generated project root to check its site.",
    );
  let site;
  try {
    site = manifestSite(validateUpgradeManifest(JSON.parse(text)));
  } catch {
    return observation(
      "config",
      "MANIFEST_INVALID",
      "The project manifest .lace/manifest.json cannot be read or validated.",
      "Restore .lace/manifest.json from version control or regenerate the project with a compatible create-lace, then repeat doctor.",
    );
  }
  if (site.mode === "none")
    return observation(
      "pass",
      "SITE_NONE",
      "Site mode none: no build site is configured and no site/ is expected.",
      "Connect a site later with docs/lace-astro-site.md if the project should build one.",
    );
  const root = resolve(cwd, site.path);
  const packageJson = await optional(io, join(root, "package.json"), signal);
  let astro = false;
  try {
    const manifest = JSON.parse(packageJson ?? "null") as {
      dependencies?: Record<string, unknown>;
      devDependencies?: Record<string, unknown>;
    } | null;
    astro =
      Object.hasOwn(manifest?.dependencies ?? {}, "astro") ||
      Object.hasOwn(manifest?.devDependencies ?? {}, "astro");
  } catch {
    astro = false;
  }
  let config = false;
  for (const name of ASTRO_CONFIGS)
    if ((await optional(io, join(root, name), signal)) !== undefined) config = true;
  if (!astro || !config) {
    if (packageJson === undefined && !(await exists(io, root, signal)))
      return observation(
        "config",
        "SITE_MISSING",
        `The ${site.mode} site directory ${site.path} recorded in .lace/manifest.json does not exist.`,
        `Restore the site at ${site.path} relative to this project, or regenerate the project in the matching site mode.`,
      );
    return observation(
      "config",
      "SITE_NOT_ASTRO",
      `The site at ${site.path} is not an Astro project root: it needs astro.config.* and a package.json declaring astro.`,
      `Restore the Astro project at ${site.path} relative to this project.`,
    );
  }
  const packages: string[] = [];
  for (const name of SITE_PACKAGES)
    if (!(await installed(io, root, name, signal))) packages.push(name);
  let blocks = false;
  const lockText = await optional(io, join(root, LOCK_FILE), signal);
  if (lockText !== undefined) {
    try {
      const lock = validateLock(JSON.parse(lockText));
      blocks = (await optional(io, join(root, lock.blockMap), signal)) !== undefined;
    } catch {
      blocks = false;
    }
  }
  if (packages.length === 0 && blocks)
    return observation(
      "pass",
      "SITE_READY",
      `The ${site.mode} site at ${site.path} has its Lace packages, ${LOCK_FILE} and block map.`,
      "Continue with the remaining checks.",
    );
  const reasons = [
    ...(packages.length > 0 ? [`${packages.join(" and ")} not installed`] : []),
    ...(blocks ? [] : [`${LOCK_FILE} or its block map missing`]),
  ];
  const actions = [
    ...(packages.length > 0
      ? [
          site.mode === "starter"
            ? "run pnpm install"
            : `add ${packages.join(" and ")} to the site and run pnpm install in ${site.path}`,
        ]
      : []),
    ...(blocks ? [] : [`run pnpm exec lace add block --all --site ${site.path}`]),
  ];
  return observation(
    "unfinished",
    packages.length > 0 ? "SITE_PACKAGES_MISSING" : "SITE_BLOCKS_MISSING",
    `The ${site.mode} site at ${site.path} is not connected yet: ${reasons.join("; ")}.`,
    `${actions.join(", then ")}; see docs/lace-astro-site.md.`.replace(/^./u, (c) =>
      c.toUpperCase(),
    ),
  );
}
