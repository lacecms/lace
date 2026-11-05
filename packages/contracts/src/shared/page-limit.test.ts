import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "@lacecms/content";
import * as v from "valibot";
import { expect, test } from "vitest";
import { pageLimitQuerySchema } from "./primitives.js";

test("the page limit grammar accepts exactly 1 to MAX_PAGE_SIZE", () => {
  const accepted: number[] = [];
  for (let limit = 0; limit <= 1_000; limit += 1)
    if (v.safeParse(pageLimitQuerySchema, String(limit)).success) accepted.push(limit);
  expect(accepted).toEqual(Array.from({ length: MAX_PAGE_SIZE }, (_, index) => index + 1));
  expect(DEFAULT_PAGE_SIZE).toBeLessThanOrEqual(MAX_PAGE_SIZE);
  for (const value of ["", "01", "+5", "1.0", "1e2", " 5", "5 ", "-1"])
    expect(v.safeParse(pageLimitQuerySchema, value).success).toBe(false);
});
