import { expect } from "vitest";

/** Asserts a test value exists and narrows it for later assertions. */
export function present<T>(value: T | null | undefined): T {
  expect(value).toBeDefined();
  expect(value).not.toBeNull();
  if (value === undefined || value === null) throw new Error("Expected a value");
  return value;
}
