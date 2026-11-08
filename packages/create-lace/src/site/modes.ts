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
