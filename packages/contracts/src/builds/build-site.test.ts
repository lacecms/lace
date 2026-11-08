// @ts-nocheck
// TODO(rf2): Type mutable transport fixtures and deliberately malformed metadata.
import * as v from "valibot";
import { expect, test } from "vitest";
import { buildSiteIdentitySchema, buildSiteUrlSchema } from "./build-site.js";

test("build-site URLs are absolute HTTP(S) base URLs", () => {
  for (const url of ["https://example.com/", "http://127.0.0.1:4321/blog/"])
    expect(v.safeParse(buildSiteUrlSchema, url).success).toBe(true);
  for (const url of [
    "https://user:secret@example.com/",
    "https://example.com/?preview=1",
    "https://example.com/#top",
    "ftp://example.com/",
    "https://example.com/blog",
    "/blog/",
    `https://example.com/${"a".repeat(2048)}/`,
  ])
    expect(v.safeParse(buildSiteUrlSchema, url).success).toBe(false);
  expect(
    v.parse(buildSiteIdentitySchema, {
      id: "main-site",
      label: "Main site",
      url: "https://example.com/",
    }),
  ).toEqual({ id: "main-site", label: "Main site", url: "https://example.com/" });
});
