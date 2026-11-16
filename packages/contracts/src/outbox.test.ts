import { describe, expect, it } from "vitest";
import {
  MEDIA_DELETE_REQUESTED,
  SITE_BUILD_REQUESTED,
  outboxEvents,
  type OutboxEnqueuePayload,
} from "@lacecms/contracts/outbox";

const build = outboxEvents[SITE_BUILD_REQUESTED];
const media = outboxEvents[MEDIA_DELETE_REQUESTED];

const buildRequest: OutboxEnqueuePayload<typeof SITE_BUILD_REQUESTED> = {
  publishedSnapshotId: null,
  reason: "configuration_sync",
  requestedAt: 0,
  requestedBy: "admin",
};

describe("version 1 outbox contracts", () => {
  it("accepts both generated payloads and selects contracts by persisted identity", () => {
    expect(build).toMatchObject({ type: SITE_BUILD_REQUESTED, version: 1 });
    expect(media).toMatchObject({ type: MEDIA_DELETE_REQUESTED, version: 1 });
    const writtenBuild = { ...build.parseEnqueue(buildRequest), targetVersion: 0 };
    const writtenMedia = media.parseEnqueue({ mediaId: "media", requestedBy: "admin" });
    expect(build.decodeJson(JSON.stringify(writtenBuild))).toEqual(writtenBuild);
    expect(media.decodeJson(JSON.stringify(writtenMedia))).toEqual(writtenMedia);
    expect(build.decode(writtenMedia)).toBeNull();
    expect(media.decode(writtenBuild)).toBeNull();
  });

  it("reads legacy omissions and discards extra fields", () => {
    const { publishedSnapshotId, ...legacy } = buildRequest;
    expect(publishedSnapshotId).toBeNull();
    const payload = { ...legacy, reason: "media_metadata", targetVersion: 8 };
    expect(build.decode({ ...payload, extra: true })).toEqual(payload);
    expect(media.decode({ mediaId: "media", extra: true })).toEqual({ mediaId: "media" });
    expect(() => media.parseEnqueue({ mediaId: "media" })).toThrow();
    expect(() => build.parseEnqueue(legacy)).toThrow();
  });

  it.each([
    { targetVersion: -1 },
    { targetVersion: 0.5 },
    { targetVersion: Number.MAX_SAFE_INTEGER + 1 },
    { targetVersion: "1" },
    { requestedAt: Number.MIN_SAFE_INTEGER - 1 },
    { requestedAt: 0.5 },
    { reason: "" },
    { requestedBy: "" },
    { retryOfBuildId: "" },
    { retryOfBuildId: null },
    { publishedSnapshotId: "" },
  ])("rejects invalid build field values %j", (fields) => {
    expect(build.decode({ ...buildRequest, targetVersion: 0, ...fields })).toBeNull();
  });

  it("accepts safe integer boundaries and rejects invalid media fields or JSON", () => {
    const payload = {
      ...buildRequest,
      targetVersion: Number.MAX_SAFE_INTEGER,
      requestedAt: Number.MIN_SAFE_INTEGER,
    };
    expect(build.decode(payload)).toEqual(payload);
    expect(build.decodeJson("{")).toBeNull();
    expect(media.decodeJson("[]")).toBeNull();
    expect(media.decode({ mediaId: "" })).toBeNull();
    expect(media.decode({ mediaId: "media", requestedBy: null })).toBeNull();
  });
});
