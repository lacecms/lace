// @ts-nocheck
// TODO(rf2): Type mutable transport fixtures and deliberately malformed metadata.
import { unixMilliseconds } from "@lacecms/domain";
import * as v from "valibot";
import { describe, expect, test } from "vitest";
import { mediaMetadataSchema, toMediaMetadataDto } from "../index.js";

describe("media metadata contracts", async () => {
  const {
    mediaEntityTag,
    resolveMediaPrecondition,
    toUpdateMediaMetadataResultDto,
    updateMediaMetadataRequestSchema,
    updateMediaMetadataResultSchema,
  } = await import("../index.js");
  const source = {
    createdAt: unixMilliseconds(1_700_000_000_000),
    createdBy: { displayName: "Ada", id: "user-1" },
    filename: "bike.png",
    height: 600,
    id: "media-1",
    mimeType: "image/png",
    size: 12,
    status: "active",
    updatedAt: unixMilliseconds(1_791_647_444_998),
    usageCount: 0,
    width: 800,
  };
  const url = "https://cms.example/api/v1/public/media/media-1";
  const issuePaths = (input) => {
    const result = v.safeParse(updateMediaMetadataRequestSchema, input);
    return result.success
      ? []
      : result.issues.map((issue) =>
          (issue.path ?? []).map((segment) => `/${String(segment.key)}`).join(""),
        );
  };
  test("media DTOs carry set descriptive values and omit unset ones", () => {
    const bare = toMediaMetadataDto(source, url);
    expect(bare).not.toHaveProperty("alt");
    expect(bare).not.toHaveProperty("caption");
    expect(bare).not.toHaveProperty("focalPoint");
    expect(bare.tags).toEqual([]);
    const { tags: _tags, ...withoutTags } = bare;
    expect(v.safeParse(mediaMetadataSchema, withoutTags).success).toBe(false);
    for (const tags of [["a\n"], ["A"], ["a", "a"], ["b", "a"]]) {
      expect(v.safeParse(mediaMetadataSchema, { ...bare, tags }).success).toBe(false);
    }
    expect(bare.updatedAt).toBe("2026-10-10T15:50:44.998Z");
    const described = toMediaMetadataDto(
      { ...source, alt: "Red bicycle", focalPoint: { x: 0.25, y: 0.75 } },
      url,
    );
    expect(described).toMatchObject({ alt: "Red bicycle", focalPoint: { x: 0.25, y: 0.75 } });
    expect(described).not.toHaveProperty("caption");
    expect(v.parse(mediaMetadataSchema, described)).toEqual(described);
    for (const invalid of [
      { ...described, alt: null },
      { ...described, alt: "" },
      { ...described, focalPoint: { x: 2, y: 0 } },
      { ...described, focalPoint: { x: 0.5 } },
    ]) {
      expect(v.safeParse(mediaMetadataSchema, invalid).success).toBe(false);
    }
  });
  test("update requests accept partial patches and clearing nulls", () => {
    for (const valid of [
      { alt: "Red bicycle", focalPoint: { x: 0.5, y: 0.3 } },
      { caption: "Line one\r\nLine two" },
      { alt: null, caption: null, focalPoint: null },
      { alt: "   " },
      { alt: "x".repeat(1000), focalPoint: { x: 0, y: 1 } },
      { caption: "😀".repeat(2000) },
      { alt: "<b>bold</b>" },
    ]) {
      expect(v.safeParse(updateMediaMetadataRequestSchema, valid).success).toBe(true);
    }
  });
  test("invalid update requests fail with JSON Pointer issues", () => {
    expect(issuePaths({ focalPoint: { x: -0.1, y: 0.5 }, title: "x" }).sort()).toEqual([
      "/focalPoint/x",
      "/title",
    ]);
    expect(issuePaths({ alt: "x".repeat(1001) })).toEqual(["/alt"]);
    expect(issuePaths({ alt: "line\nbreak" })).toEqual(["/alt"]);
    expect(issuePaths({ caption: "tab\there" })).toEqual(["/caption"]);
    expect(issuePaths({ caption: "x".repeat(2001) })).toEqual(["/caption"]);
    expect(issuePaths({ alt: "\ud800" })).toEqual(["/alt"]);
    expect(issuePaths({ alt: 3 })).toEqual(["/alt"]);
    expect(issuePaths({ focalPoint: { x: 0.5, y: Number.NaN } })).toEqual(["/focalPoint/y"]);
    expect(issuePaths({ focalPoint: { x: 0.5, y: 0.5, z: 1 } })).toEqual(["/focalPoint/z"]);
    expect(v.safeParse(updateMediaMetadataRequestSchema, {}).success).toBe(false);
  });
  test("update results reuse the build dispatch outcome", () => {
    const queued = toUpdateMediaMetadataResultDto(
      { build: { status: "queued", targetVersion: 7 }, media: { ...source, caption: "Hi" } },
      url,
    );
    expect(queued.build).toEqual({ status: "queued", targetVersion: 7 });
    expect(queued.media.caption).toBe("Hi");
    expect(v.parse(updateMediaMetadataResultSchema, queued)).toEqual(queued);
    const idle = toUpdateMediaMetadataResultDto(
      { build: { status: "not-dispatched" }, media: source },
      url,
    );
    expect(idle.build).toEqual({ status: "not-dispatched" });
  });
});
