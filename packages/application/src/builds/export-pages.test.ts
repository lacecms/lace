import { expect, test } from "vitest";
import {
  BUILD_EXPORT_PAGE_BYTE_BUDGET,
  MAX_BUILD_EXPORT_PAGE_SIZE,
  assertBuildExportPageSize,
  selectBuildExportPage,
} from "../index.js";

test("selects build-export pages by limit and stored byte budget", () => {
  expect(MAX_BUILD_EXPORT_PAGE_SIZE).toBe(100);
  expect(BUILD_EXPORT_PAGE_BYTE_BUDGET).toBe(4_000_000);
  const small = (count: number) => Array.from({ length: count }, () => ({ bytes: 10 }));
  expect(selectBuildExportPage(small(3), 2)).toEqual({ count: 2, more: true });
  expect(selectBuildExportPage(small(2), 2)).toEqual({ count: 2, more: false });
  expect(selectBuildExportPage([], 2)).toEqual({ count: 0, more: false });
  const large = [{ bytes: 1_500_000 }, { bytes: 1_500_000 }, { bytes: 1_500_000 }];
  expect(selectBuildExportPage(large, 100)).toEqual({ count: 2, more: true });
  // An entry above the budget is still delivered, alone.
  expect(selectBuildExportPage([{ bytes: 5_000_000 }, { bytes: 1 }], 100)).toEqual({
    count: 1,
    more: true,
  });
  // The first page's globals count against the budget, but one entry always fits.
  expect(selectBuildExportPage(large, 100, 2_000_000)).toEqual({ count: 1, more: true });
  expect(selectBuildExportPage(large, 100, 5_000_000)).toEqual({ count: 1, more: true });
  expect(selectBuildExportPage([{ bytes: 2_000_000 }, { bytes: 2_000_000 }], 100)).toEqual({
    count: 2,
    more: false,
  });
  for (const limit of [0, 101, 1.5, Number.NaN]) {
    expect(() => assertBuildExportPageSize(limit)).toThrow(/between 1 and 100/u);
  }
  expect(assertBuildExportPageSize(100)).toBe(100);
});
