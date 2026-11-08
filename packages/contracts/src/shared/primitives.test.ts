// @ts-nocheck
// TODO(rf2): Type mutable transport fixtures and deliberately malformed metadata.
import * as v from "valibot";
import { describe, expect, test } from "vitest";
import {
  entityTagSchema,
  idempotencyKeySchema,
  isoTimestampSchema,
  jsonPointerSchema,
  opaqueCursorSchema,
} from "./primitives.js";

describe("invalid shared REST payloads", () => {
  test("rejects malformed timestamps, cursors, entity tags, idempotency keys, and issue paths", () => {
    expect(v.safeParse(isoTimestampSchema, "2025-01-01T00:00:00Z").success).toBe(false);
    expect(v.safeParse(opaqueCursorSchema, "").success).toBe(false);
    expect(v.safeParse(entityTagSchema, "7").success).toBe(false);
    expect(v.safeParse(idempotencyKeySchema, "bad\nkey").success).toBe(false);
    expect(v.safeParse(jsonPointerSchema, "fields.title").success).toBe(false);
  });
});
