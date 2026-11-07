import { ContentValidationError } from "@lacecms/content";
import { expect, test } from "vitest";
import {
  MAX_SEO_CANONICAL_LENGTH,
  isCanonicalUrl,
  normalizeEntrySeo,
  normalizeSeoText,
} from "./seo.js";

function seoIssue(input: unknown, enabled = true) {
  try {
    normalizeEntrySeo(input, { enabled });
  } catch (error) {
    expect(error).toBeInstanceOf(ContentValidationError);
    if (!(error instanceof ContentValidationError)) throw error;
    return error.issues.map(({ code, path }) => ({ code, path: `/${path.join("/")}` }));
  }
  throw new Error("Expected an SEO validation failure.");
}

test("normalizes SEO groups and clears empty values", () => {
  expect(
    normalizeEntrySeo({ title: "  Hello  ", description: "", noindex: false }, { enabled: true }),
  ).toEqual({
    title: "Hello",
  });
  expect(
    normalizeEntrySeo({ title: " ", canonical: "", noindex: false }, { enabled: true }),
  ).toBeUndefined();
  expect(normalizeEntrySeo(null, { enabled: false })).toBeUndefined();
  expect(normalizeEntrySeo(undefined, { enabled: true })).toBeUndefined();
  expect(
    normalizeEntrySeo(
      {
        canonical: " https://example.com/blog/hello?ref=1 ",
        description: "About",
        image: "media-1",
        noindex: true,
        title: null,
      },
      { enabled: true },
    ),
  ).toEqual({
    canonical: "https://example.com/blog/hello?ref=1",
    description: "About",
    image: "media-1",
    noindex: true,
  });
  expect(normalizeSeoText("x".repeat(200), "title")).toBe("x".repeat(200));
  expect(normalizeSeoText("x".repeat(201), "title")).toBeUndefined();
  expect(normalizeSeoText("😀".repeat(500), "description")).toBe("😀".repeat(500));
  expect(normalizeSeoText("x".repeat(501), "description")).toBeUndefined();
  expect(normalizeSeoText("a\nb", "title")).toBeUndefined();
});

test("rejects invalid SEO values with JSON pointers under /seo", () => {
  expect(seoIssue({ title: "x" }, false)).toEqual([{ code: "seo_not_allowed", path: "/seo" }]);
  expect(seoIssue("title")).toEqual([{ code: "invalid_seo", path: "/seo" }]);
  expect(seoIssue([])).toEqual([{ code: "invalid_seo", path: "/seo" }]);
  expect(seoIssue({ keywords: "x" })).toEqual([{ code: "unknown_key", path: "/seo/keywords" }]);
  expect(seoIssue({ title: 5 })).toEqual([{ code: "invalid_seo_text", path: "/seo/title" }]);
  expect(seoIssue({ title: "a\nb" })).toEqual([{ code: "invalid_seo_text", path: "/seo/title" }]);
  expect(seoIssue({ title: "x".repeat(201) })).toEqual([
    { code: "seo_text_too_long", path: "/seo/title" },
  ]);
  expect(seoIssue({ description: "x".repeat(501) })).toEqual([
    { code: "seo_text_too_long", path: "/seo/description" },
  ]);
  expect(seoIssue({ description: "line\r\nbreak" })).toEqual([
    { code: "invalid_seo_text", path: "/seo/description" },
  ]);
  expect(seoIssue({ canonical: "/blog/hello" })).toEqual([
    { code: "invalid_canonical_url", path: "/seo/canonical" },
  ]);
  expect(
    seoIssue({ canonical: `https://example.com/${"a".repeat(MAX_SEO_CANONICAL_LENGTH)}` }),
  ).toEqual([{ code: "canonical_too_long", path: "/seo/canonical" }]);
  expect(seoIssue({ image: "" })).toEqual([{ code: "invalid_seo_image", path: "/seo/image" }]);
  expect(seoIssue({ image: 3 })).toEqual([{ code: "invalid_seo_image", path: "/seo/image" }]);
  expect(seoIssue({ noindex: "yes" })).toEqual([{ code: "invalid_noindex", path: "/seo/noindex" }]);
});

test("accepts only absolute http and https canonical URLs", () => {
  for (const value of [
    "https://example.com/",
    "http://example.com/a?b=c",
    "https://sub.example.com:8443/path",
  ]) {
    expect(isCanonicalUrl(value)).toBe(true);
  }
  for (const value of [
    "/blog/hello",
    "//example.com/a",
    "ftp://example.com/",
    "https://user:pass@example.com/",
    "https://user@example.com/",
    "https://example.com/a#top",
    "https://exa mple.com/",
    "mailto:a@example.com",
    "entry:target",
    "entry:a%2Fb",
    "https://",
    "",
    5,
  ]) {
    expect(isCanonicalUrl(value)).toBe(false);
  }
});
