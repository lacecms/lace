import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "@lacecms/content";
import * as v from "valibot";
import { expect, test } from "vitest";
import {
  adminPageLimitQuerySchema,
  numericPageLimitSchema,
  pageLimitQuerySchema,
} from "./primitives.js";

test("the page limit grammar accepts exactly 1 to MAX_PAGE_SIZE", () => {
  const accepted: number[] = [];
  for (let limit = 0; limit <= 1_000; limit += 1)
    if (v.safeParse(pageLimitQuerySchema, String(limit)).success) accepted.push(limit);
  expect(accepted).toEqual(Array.from({ length: MAX_PAGE_SIZE }, (_, index) => index + 1));
  expect(DEFAULT_PAGE_SIZE).toBeLessThanOrEqual(MAX_PAGE_SIZE);
  for (const value of ["", "01", "+5", "1.0", "1e2", " 5", "5 ", "-1"])
    expect(v.safeParse(pageLimitQuerySchema, value).success).toBe(false);
});

test("REST and MCP normalize supported page sizes and defaults to the same number", () => {
  for (const size of [1, 50, MAX_PAGE_SIZE]) {
    expect(v.parse(adminPageLimitQuerySchema, String(size))).toBe(size);
    expect(v.parse(numericPageLimitSchema, size)).toBe(size);
  }
  expect(v.parse(adminPageLimitQuerySchema, undefined)).toBe(DEFAULT_PAGE_SIZE);
  expect(v.parse(numericPageLimitSchema, undefined)).toBe(DEFAULT_PAGE_SIZE);
  for (const size of [0, 1.5, MAX_PAGE_SIZE + 1, "10"])
    expect(v.safeParse(numericPageLimitSchema, size).success).toBe(false);
});
