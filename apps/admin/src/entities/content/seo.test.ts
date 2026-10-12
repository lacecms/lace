import type { ContentModelDto } from "@lacecms/contracts";
import { describe, expect, test } from "vitest";
import {
  canonicalProblem,
  SEO_MESSAGES,
  seoDefaultsAnnotation,
  seoFormValues,
  seoInput,
  seoProblems,
  seoTextLength,
} from "./seo.js";

const empty = { canonical: "", description: "", image: null, noindex: false, title: "" };

describe("SEO form values", () => {
  test("loads unset values as empty inputs and saves them as null", () => {
    expect(seoFormValues(undefined)).toEqual(empty);
    expect(
      seoFormValues({
        canonical: null,
        description: "Intro",
        image: "media-1",
        noindex: true,
        title: null,
      }),
    ).toEqual({ ...empty, description: "Intro", image: "media-1", noindex: true });
    expect(seoInput({ ...empty, description: "   ", title: "  Hello  " })).toEqual({
      canonical: null,
      description: null,
      image: null,
      noindex: false,
      title: "Hello",
    });
  });

  test("counts code points of the trimmed text", () => {
    expect(seoTextLength("  héllo 👋 ")).toBe(7);
  });
});

describe("SEO validation", () => {
  test("accepts empty and valid values", () => {
    expect(seoProblems(empty)).toEqual({});
    expect(
      seoProblems({ ...empty, canonical: " https://example.com/a?b=1 ", title: "x".repeat(200) }),
    ).toEqual({});
  });

  test("rejects line breaks, over-long text and invalid canonical URLs", () => {
    expect(
      seoProblems({
        ...empty,
        canonical: "/posts/hello",
        description: "a\nb",
        title: "x".repeat(201),
      }),
    ).toEqual({
      canonical: SEO_MESSAGES.canonical,
      description: SEO_MESSAGES.singleLine,
      title: SEO_MESSAGES.titleTooLong,
    });
    expect(seoProblems({ ...empty, description: "y".repeat(501) }).description).toBe(
      SEO_MESSAGES.descriptionTooLong,
    );
    expect(canonicalProblem("https://user:pw@example.com/")).toBe(SEO_MESSAGES.canonical);
    expect(canonicalProblem("https://example.com/#top")).toBe(SEO_MESSAGES.canonical);
    expect(canonicalProblem(`https://example.com/${"a".repeat(2_048)}`)).toBe(
      "Enter no more than 2,048 characters.",
    );
  });
});

test("names the site defaults a field of the defaults global provides", () => {
  const settings = {
    blocks: [],
    fields: {},
    key: "settings",
    kind: "global",
    seoDefaults: { description: "tagline", image: null, siteName: "siteName", titleTemplate: null },
    version: 1,
  } as unknown as ContentModelDto;
  expect(seoDefaultsAnnotation(settings, "siteName")).toBe(
    "Site name used in search and social titles.",
  );
  expect(seoDefaultsAnnotation(settings, "tagline")).toBe(
    "Default description for search and social previews.",
  );
  expect(seoDefaultsAnnotation(settings, "other")).toBeUndefined();
  expect(
    seoDefaultsAnnotation({ ...settings, seoDefaults: undefined }, "siteName"),
  ).toBeUndefined();
});
