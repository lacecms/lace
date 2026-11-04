// @ts-nocheck
// TODO(rf2): Type legacy SQLite rows, branded snapshot fixtures and malformed projection inputs.
import { expect, test } from "vitest";
import { mediaMetadata, mediaMetadataUpdateParams } from "./catalog.js";

test("maps descriptive media metadata and refuses inconsistent rows", () => {
  const row = {
    created_at: 1,
    created_by: "editor",
    filename: "bike.png",
    height: 2,
    id: "m-1",
    mime_type: "image/png",
    size: 3,
    status: "active",
    storage_key: "media/m-1",
    updated_at: 4,
    width: 5,
  };
  const bare = mediaMetadata({ ...row, alt: null, caption: null, focal_x: null, focal_y: null });
  expect(bare).not.toHaveProperty("alt");
  expect(bare).not.toHaveProperty("caption");
  expect(bare).not.toHaveProperty("focalPoint");
  expect(
    mediaMetadata({ ...row, alt: "Bike", caption: "A\nbike", focal_x: 0, focal_y: 1 }),
  ).toMatchObject({ alt: "Bike", caption: "A\nbike", focalPoint: { x: 0, y: 1 } });
  for (const invalid of [
    { focal_x: 0.5, focal_y: null },
    { focal_x: 0.5, focal_y: 1.5 },
    { alt: "" },
    { alt: 7 },
    { caption: "x".repeat(2001) },
  ]) {
    expect(() => mediaMetadata({ ...row, ...invalid })).toThrow(
      expect.objectContaining({ code: "CONTENT_INVALID_STATE" }),
    );
  }
  const input = {
    alt: "Bike",
    caption: null,
    expectedUpdatedAt: 4,
    focalPoint: { x: 0.25, y: 0.75 },
    mediaId: "m-1",
    requestedBy: { id: "editor", role: "editor" },
    updatedAt: 5,
  };
  expect(mediaMetadataUpdateParams(input)).toEqual(["Bike", null, 0.25, 0.75, 5, "m-1", 4]);
  expect(() => mediaMetadataUpdateParams({ ...input, updatedAt: 4 })).toThrow(
    expect.objectContaining({ code: "CONTENT_INVALID_STATE" }),
  );
});
