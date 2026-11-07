import { expect } from "vitest";
import { DomainError } from "../shared/errors.js";
import type { DomainErrorCode } from "../shared/errors.js";

/** Asserts that an operation throws a `DomainError` carrying the stable code. */
export function expectDomainError(operation: () => unknown, code: DomainErrorCode): void {
  expect(operation).toThrow(DomainError);
  try {
    operation();
  } catch (error) {
    expect(error).toMatchObject({ code });
  }
}

/** Asserts a test value exists and narrows it for later assertions. */
export function present<T>(value: T | null | undefined): T {
  expect(value).toBeDefined();
  expect(value).not.toBeNull();
  if (value === undefined || value === null) throw new Error("Expected a value");
  return value;
}
