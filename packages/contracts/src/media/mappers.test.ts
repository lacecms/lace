// @ts-nocheck
// TODO(rf2): Type mutable transport fixtures and deliberately malformed metadata.
import { DomainError, unixMilliseconds } from "@lacecms/domain";
import * as v from "valibot";
import { describe, expect, test } from "vitest";
import { classifyError, fromIsoTimestamp, toMediaMetadataDto } from "../index.js";

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
  test("the media precondition is exactly one strong updatedAt tag", () => {
    expect(mediaEntityTag(source.updatedAt)).toBe('"1791647444998"');
    expect(resolveMediaPrecondition('"1791647444998"')).toBe(1_791_647_444_998);
    expect(
      resolveMediaPrecondition(
        mediaEntityTag(fromIsoTimestamp(toMediaMetadataDto(source, url).updatedAt)),
      ),
    ).toBe(source.updatedAt);
    for (const invalid of [
      undefined,
      'W/"1791647444998"',
      "*",
      '"1", "2"',
      "1791647444998",
      '"abc"',
      '"99999999999999999"',
    ]) {
      expect(() => resolveMediaPrecondition(invalid)).toThrow(TypeError);
    }
  });
  test("stale media edits classify as a sanitized conflict", () => {
    expect(
      classifyError(new DomainError("MEDIA_UPDATE_CONFLICT", "media-1 changed at 17:00")),
    ).toEqual({
      body: {
        error: {
          code: "MEDIA_UPDATE_CONFLICT",
          message: "The media was modified by another request.",
        },
      },
      status: 409,
    });
  });
});
