import * as v from "valibot";
import { ParsedUrl } from "../shared/url.js";

export const MAX_BUILD_SITE_URL_LENGTH = 2048;

function isSiteBaseUrl(value: string): boolean {
  if (!value.endsWith("/") || value.includes("?") || value.includes("#")) return false;
  let url: ParsedUrl;
  try {
    url = new ParsedUrl(value);
  } catch {
    return false;
  }
  return (
    (url.protocol === "http:" || url.protocol === "https:") &&
    url.username === "" &&
    url.password === "" &&
    url.href === value
  );
}

/** The public site's absolute HTTP(S) base URL: no credentials, query or fragment, trailing slash. */
export const buildSiteUrlSchema = v.pipe(
  v.string(),
  v.maxLength(MAX_BUILD_SITE_URL_LENGTH),
  v.check(isSiteBaseUrl, "Site URL must be an absolute HTTP(S) base URL ending with a slash."),
);

/** Operator-authored current configuration; never a filesystem path or historical attribution. */
export const buildSiteIdentitySchema = v.strictObject({
  id: v.pipe(v.string(), v.minLength(1), v.maxLength(64), v.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)),
  label: v.pipe(
    v.string(),
    v.minLength(1),
    v.maxLength(80),
    v.regex(/^[A-Za-z0-9](?:[A-Za-z0-9 _-]*[A-Za-z0-9])?$/u),
  ),
  url: v.optional(buildSiteUrlSchema),
});
export const buildSiteSelectionSchema = v.strictObject({
  site: v.nullable(buildSiteIdentitySchema),
});
export type BuildSiteIdentityDto = v.InferOutput<typeof buildSiteIdentitySchema>;
export type BuildSiteSelectionDto = v.InferOutput<typeof buildSiteSelectionSchema>;
