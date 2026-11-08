/** Optional site output settings forwarded unchanged to the site build. */
export interface SiteOutputSettings {
  readonly siteIndexing?: "off" | "on";
  readonly siteUrl?: string;
}

function validSiteUrl(value: string): boolean {
  // A bare `?` or `#` disappears during parsing; refuse it rather than silently dropping it.
  if (value.includes("?") || value.includes("#")) return false;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && url.username === "" && url.password === "";
  } catch {
    return false;
  }
}

/**
 * Reads `LACE_BUILD_SITE_URL` and `LACE_SITE_INDEXING`; empty values are
 * absent. Invalid values fail naming the setting, never its value.
 */
export function parseSiteOutputSettings(
  environment: Readonly<Record<string, string | undefined>>,
): SiteOutputSettings {
  const siteUrl = environment.LACE_BUILD_SITE_URL?.trim() || undefined;
  const siteIndexing = environment.LACE_SITE_INDEXING?.trim() || undefined;
  const invalid: string[] = [];
  if (siteUrl !== undefined && !validSiteUrl(siteUrl)) invalid.push("LACE_BUILD_SITE_URL");
  if (siteIndexing !== undefined && siteIndexing !== "on" && siteIndexing !== "off")
    invalid.push("LACE_SITE_INDEXING");
  if (invalid.length > 0) throw new Error(`Invalid builder configuration: ${invalid.join(", ")}.`);
  return {
    ...(siteIndexing === undefined ? {} : { siteIndexing: siteIndexing as "off" | "on" }),
    ...(siteUrl === undefined ? {} : { siteUrl }),
  };
}
