// @ts-nocheck
// TODO(rf2): Type legacy SQLite rows, branded snapshot fixtures and malformed projection inputs.
import { expect, test } from "vitest";
import { assertDraftPersistenceBounds } from "../content/snapshots.js";
import { sqliteWriteError } from "./write-errors.js";

test("bounds drafts and maps SQLite constraint failures to stable codes", () => {
  expect(() =>
    assertDraftPersistenceBounds(Array.from({ length: 200 }), Array.from({ length: 200 })),
  ).not.toThrow();
  expect(() => assertDraftPersistenceBounds(Array.from({ length: 201 }), [])).toThrow(
    expect.objectContaining({ code: "CONTENT_INVALID_STATE" }),
  );
  expect(() => assertDraftPersistenceBounds([], Array.from({ length: 201 }))).toThrow(
    expect.objectContaining({ code: "CONTENT_INVALID_STATE" }),
  );
  const mapped = (message, page = false) => {
    try {
      sqliteWriteError(new Error(message), page, "Test");
    } catch (error) {
      return [error.code, error.message];
    }
  };
  expect(mapped("D1_ERROR: UNIQUE constraint failed: published_routes.path: SQLITE")).toEqual([
    "CONTENT_ROUTE_CONFLICT",
    "The public path belongs to another entry.",
  ]);
  expect(mapped("UNIQUE constraint failed: content_entries.model_key", true)[0]).toBe(
    "CONTENT_MODEL_CARDINALITY_CONFLICT",
  );
  expect(mapped("NOT NULL constraint failed: content_media_references.media_id")).toEqual([
    "CONTENT_INVALID_STATE",
    "Media is unavailable for reference.",
  ]);
  expect(mapped("anything else")).toEqual(["CONTENT_INVALID_STATE", "Test content write failed."]);
});
