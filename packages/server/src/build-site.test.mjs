import { expect, test } from "vitest";
import { parseBuildSiteIdentity } from "../dist/index.js";
import { buildSiteSelectionSchema } from "@lacecms/contracts";
import * as v from "valibot";

test("current identity is explicitly configured or absent", () => {
  expect(parseBuildSiteIdentity({})).toBe(null);
  const site = parseBuildSiteIdentity({
    LACE_BUILD_SITE_ID: "main-site",
    LACE_BUILD_SITE_LABEL: "Main site",
  });
  expect(v.parse(buildSiteSelectionSchema, { site })).toEqual({
    site: { id: "main-site", label: "Main site" },
  });
  expect(v.safeParse(buildSiteSelectionSchema, { site, source: "/private" }).success).toBe(false);
});
test.each([
  { LACE_BUILD_SITE_ID: "site" },
  { LACE_BUILD_SITE_LABEL: "Site" },
  { LACE_BUILD_SITE_ID: "/private", LACE_BUILD_SITE_LABEL: "Site" },
  { LACE_BUILD_SITE_ID: "site", LACE_BUILD_SITE_LABEL: "https://user:secret@host/" },
  { LACE_BUILD_SITE_ID: "site", LACE_BUILD_SITE_LABEL: "a".repeat(81) },
  { LACE_BUILD_SITE_ID: "a".repeat(65), LACE_BUILD_SITE_LABEL: "Site" },
  { LACE_BUILD_SITE_ID: "site", LACE_BUILD_SITE_LABEL: " Site " },
])("startup rejects unsafe identity without supplied values", (env) => {
  expect(() => parseBuildSiteIdentity(env)).toThrow(
    "Invalid build site configuration: LACE_BUILD_SITE_ID, LACE_BUILD_SITE_LABEL.",
  );
});

test("a configured site URL is normalized with a trailing slash", () => {
  const identity = { LACE_BUILD_SITE_ID: "main-site", LACE_BUILD_SITE_LABEL: "Main site" };
  expect(
    parseBuildSiteIdentity({ ...identity, LACE_BUILD_SITE_URL: "https://Example.com/blog" }),
  ).toEqual({ id: "main-site", label: "Main site", url: "https://example.com/blog/" });
  expect(
    parseBuildSiteIdentity({ ...identity, LACE_BUILD_SITE_URL: "http://127.0.0.1:4321" }),
  ).toEqual({
    id: "main-site",
    label: "Main site",
    url: "http://127.0.0.1:4321/",
  });
  expect(parseBuildSiteIdentity({ ...identity, LACE_BUILD_SITE_URL: "" })).toEqual({
    id: "main-site",
    label: "Main site",
  });
  expect(parseBuildSiteIdentity({ LACE_BUILD_SITE_URL: "" })).toBe(null);
});
test.each([
  "https://user:secret@example.com/",
  "https://example.com/?",
  "https://example.com/?preview=1",
  "https://example.com/#",
  "javascript:alert(1)",
  "ftp://example.com/",
  "example.com",
  `https://example.com/${"a".repeat(2048)}`,
])("startup rejects a malformed site URL without its value: %s", (url) => {
  let message = "";
  try {
    parseBuildSiteIdentity({
      LACE_BUILD_SITE_ID: "main-site",
      LACE_BUILD_SITE_LABEL: "Main site",
      LACE_BUILD_SITE_URL: url,
    });
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  expect(message).toBe("Invalid build site configuration: LACE_BUILD_SITE_URL.");
});
test("a site URL without an identity fails startup", () => {
  expect(() => parseBuildSiteIdentity({ LACE_BUILD_SITE_URL: "https://example.com/" })).toThrow(
    "Invalid build site configuration: LACE_BUILD_SITE_ID, LACE_BUILD_SITE_LABEL, LACE_BUILD_SITE_URL.",
  );
});
