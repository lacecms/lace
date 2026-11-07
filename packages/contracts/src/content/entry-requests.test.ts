// @ts-nocheck
// TODO(rf2): Type mutable transport fixtures and deliberately malformed metadata.
import * as v from "valibot";
import { describe, expect, test } from "vitest";
import {
  createContentEntryRequestSchema,
  deleteContentEntryRequestSchema,
  duplicateContentEntryRequestSchema,
  revertContentEntryRequestSchema,
  unpublishContentEntryRequestSchema,
  publishContentEntryRequestSchema,
  saveDraftRequestSchema,
} from "../index.js";

describe("shared REST contract DTOs", () => {
  test("accepts complete mutation request contracts", () => {
    const draftRequest = {
      blocks: [
        {
          data: { heading: "Welcome" },
          key: "hero-1",
          position: 1_000,
          schemaVersion: 1,
          type: "hero",
        },
      ],
      expectedRevision: 4,
      fields: { author: "Lace" },
      slug: "welcome",
      title: "Welcome",
    };
    const { expectedRevision: _expectedRevision, ...createRequest } = draftRequest;
    expect(v.parse(createContentEntryRequestSchema, createRequest)).toMatchObject({
      title: "Welcome",
    });
    // Omitted envelope values parse to their defaults.
    expect(v.parse(saveDraftRequestSchema, draftRequest)).toEqual({
      ...draftRequest,
      blocks: [{ ...draftRequest.blocks[0], hidden: false, settings: {} }],
    });
    expect(v.parse(publishContentEntryRequestSchema, { expectedRevision: 4 })).toEqual({
      expectedRevision: 4,
    });
    expect(v.parse(deleteContentEntryRequestSchema, { expectedRevision: 4 })).toEqual({
      expectedRevision: 4,
    });
    expect(
      v.parse(unpublishContentEntryRequestSchema, { expectedPublishedSnapshotId: "snapshot-1" }),
    ).toEqual({ expectedPublishedSnapshotId: "snapshot-1" });
    for (const invalid of [{}, { expectedPublishedSnapshotId: "" }, { expectedRevision: 4 }]) {
      expect(v.safeParse(unpublishContentEntryRequestSchema, invalid).success).toBe(false);
    }
    for (const schema of [revertContentEntryRequestSchema, duplicateContentEntryRequestSchema]) {
      expect(v.parse(schema, { expectedRevision: 4 })).toEqual({ expectedRevision: 4 });
      expect(v.parse(schema, {})).toEqual({});
      expect(v.safeParse(schema, { expectedRevision: -1 }).success).toBe(false);
      expect(v.safeParse(schema, { title: "x" }).success).toBe(false);
    }
  });
});

describe("invalid shared REST payloads", () => {
  test("rejects unknown keys and invalid mutation values", () => {
    expect(
      v.safeParse(saveDraftRequestSchema, {
        blocks: [],
        fields: {},
        title: "Welcome",
        unknown: true,
      }).success,
    ).toBe(false);
    expect(
      v.safeParse(saveDraftRequestSchema, {
        blocks: [],
        expectedRevision: -1,
        fields: {},
        title: "Welcome",
      }).success,
    ).toBe(false);
    expect(
      v.safeParse(createContentEntryRequestSchema, { blocks: [], fields: {}, title: "" }).success,
    ).toBe(false);
  });
});
