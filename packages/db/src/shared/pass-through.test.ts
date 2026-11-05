import { afterEach, expect, test, vi } from "vitest";
import { InvariantError } from "@lacecms/content";
import { AccountError } from "@lacecms/domain";
import { parseCursorObject } from "./cursors.js";
import { parseObject } from "./values.js";
import { sqliteWriteError } from "./write-errors.js";

afterEach(() => vi.restoreAllMocks());

const failures = (): readonly Error[] => [
  new InvariantError("Private invariant."),
  new AccountError("NOT_FOUND"),
];

test("cursor and JSON parsing pass every shared failure through unchanged", () => {
  for (const failure of failures()) {
    vi.spyOn(JSON, "parse").mockImplementation(() => {
      throw failure;
    });
    expect(() => parseCursorObject("e30")).toThrow(failure);
    expect(() => parseObject("{}", "Snapshot fields")).toThrow(failure);
    vi.restoreAllMocks();
  }
});

test("write error mapping passes every shared failure through unchanged", () => {
  for (const failure of failures())
    expect(() => sqliteWriteError(failure, false, "SQLite")).toThrow(failure);
});
