import { buildSiteIdentitySchema, type BuildSiteIdentityDto } from "@lacecms/contracts";
import * as v from "valibot";

const identityVariables = ["LACE_BUILD_SITE_ID", "LACE_BUILD_SITE_LABEL"] as const;

/** Normalizes a configured site URL to its canonical form with a trailing slash. */
function siteUrl(raw: string): string | undefined {
  // A bare `?` or `#` disappears during parsing; refuse it rather than silently dropping it.
  if (raw.includes("?") || raw.includes("#")) return undefined;
  try {
    const href = new URL(raw).href;
    return href.endsWith("/") ? href : `${href}/`;
  } catch {
    return undefined;
  }
}

/** Portable deployment parsing, with no supplied values in startup errors. */
export function parseBuildSiteIdentity(environment: {
  readonly LACE_BUILD_SITE_ID?: unknown;
  readonly LACE_BUILD_SITE_LABEL?: unknown;
  readonly LACE_BUILD_SITE_URL?: unknown;
}): BuildSiteIdentityDto | null {
  const id = environment.LACE_BUILD_SITE_ID;
  const label = environment.LACE_BUILD_SITE_LABEL;
  const rawUrl =
    environment.LACE_BUILD_SITE_URL === "" ? undefined : environment.LACE_BUILD_SITE_URL;
  if (id === undefined && label === undefined && rawUrl === undefined) return null;
  const invalid: string[] = [];
  const identity = v.safeParse(buildSiteIdentitySchema, { id, label });
  if (!identity.success) invalid.push(...identityVariables);
  let url: string | undefined;
  if (rawUrl !== undefined) {
    url = typeof rawUrl === "string" ? siteUrl(rawUrl) : undefined;
    // A site URL describes the configured site, so it also requires the identity.
    const orphan = id === undefined && label === undefined;
    if (
      orphan ||
      url === undefined ||
      !v.safeParse(buildSiteIdentitySchema.entries.url, url).success
    )
      invalid.push("LACE_BUILD_SITE_URL");
  }
  if (!identity.success || invalid.length > 0)
    throw new Error(`Invalid build site configuration: ${invalid.join(", ")}.`);
  return Object.freeze({ ...identity.output, ...(url === undefined ? {} : { url }) });
}
