import { strict as assert } from "node:assert";

/** Narrow JSON returned by the runtime before inspecting fields in product tests. */
export function object(value: unknown): Record<string, unknown> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, unknown>;
}

export function array(value: unknown): unknown[] {
  assert(Array.isArray(value));
  return value;
}

export function string(value: unknown): string {
  assert(typeof value === "string");
  return value;
}

export function number(value: unknown): number {
  assert(typeof value === "number");
  return value;
}
