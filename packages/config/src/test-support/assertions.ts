import { expect } from "vitest";

/** Assert a test value exists and narrow it for later assertions. */
export function present<T>(value: T | null | undefined): T {
  expect(value).toBeDefined();
  expect(value).not.toBeNull();
  if (value === undefined || value === null) throw new Error("Expected a value");
  return value;
}

/** Read an expected JSON path while rejecting missing or non-container values. */
export function at(value: unknown, ...path: readonly (string | number)[]): unknown {
  let current = value;
  for (const key of path) {
    expect(current).not.toBeNull();
    if (current === null || typeof current !== "object") throw new Error("Expected JSON container");
    if (Array.isArray(current) && typeof key === "number") current = current[key];
    else if (typeof key === "string" && !Array.isArray(current))
      current = (current as Record<string, unknown>)[key];
    else throw new Error("Invalid JSON path");
    expect(current).toBeDefined();
  }
  return current;
}
