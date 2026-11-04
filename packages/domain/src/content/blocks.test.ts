import type { JsonObject } from "@lacecms/content";
import { expect, test } from "vitest";
import { blockKey } from "../shared/brands.js";
import { DomainError } from "../shared/errors.js";
import { expectDomainError } from "../test-support/assertions.js";
import {
  BLOCK_POSITION_STEP,
  assertOrderedBlockPositions,
  normalizeBlockPositions,
  planBlockPosition,
} from "./blocks.js";
import type { ContentBlock } from "./blocks.js";

function block(
  key: string,
  position: number,
  data: JsonObject = { body: "Original" },
): ContentBlock {
  return {
    data,
    hidden: false,
    key: blockKey(key),
    position,
    schemaVersion: 1,
    settings: {},
    type: "richText",
  };
}

test("plans sparse positions and preserves order when normalizing them", () => {
  expect(planBlockPosition(undefined, undefined)).toEqual({
    kind: "position",
    position: BLOCK_POSITION_STEP,
  });
  expect(planBlockPosition(1000, 2000)).toEqual({ kind: "position", position: 1500 });
  expect(planBlockPosition(1000, 1001)).toEqual({ kind: "normalize" });
  expect(planBlockPosition(undefined, 1)).toEqual({ kind: "normalize" });

  const normalized = normalizeBlockPositions([block("last", 8), block("first", 3)]);
  expect(normalized.map(({ key, position }) => [key, position])).toEqual([
    ["last", 1000],
    ["first", 2000],
  ]);
  expect(() => assertOrderedBlockPositions(normalized)).not.toThrow();
  expectDomainError(
    () => assertOrderedBlockPositions([block("one", 1000), block("two", 1000)]),
    "CONTENT_INVALID_STATE",
  );
  expectDomainError(() => assertOrderedBlockPositions([block("zero", 0)]), "CONTENT_INVALID_STATE");
});

test.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, 1000, 500])(
  "rejects invalid position %s with bounded ordering diagnostics",
  (position) => {
    const key = "01ARZ3NDEKTSV4RRFFQ69G5FA1";
    const input = [block("first", 1000), block(key, position, { body: "secret-content" })];
    expect(() => assertOrderedBlockPositions(input)).toThrow(`Block at index 1 (key ${key})`);
    expect(input.map((block) => block.position)).toEqual([1000, position]);
    for (const unsafe of ["secret\npassword", "x".repeat(200)]) {
      try {
        assertOrderedBlockPositions([block(unsafe, 0, { body: "secret-content" })]);
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        if (!(error instanceof DomainError)) throw error;
        expect(error.code).toBe("CONTENT_INVALID_STATE");
        expect(error.message).toContain("Block at index 0");
        expect(error.message).toContain("Resubmit positions");
        expect(error.message).not.toContain(unsafe);
        expect(error.message).not.toContain("secret-content");
      }
    }
  },
);
