import { MODEL_KEY_PATTERN } from "@lacecms/content";
import { fail } from "./errors.js";

function assertString(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string") {
    fail(`${name} must be a string.`);
  }
}

export function assertOptionalDisplayValue(value: unknown, name: string): void {
  if (value !== undefined && typeof value !== "string") {
    fail(`${name} must be a string when provided.`);
  }
}

export function assertStableKey(value: unknown, name: string): asserts value is string {
  assertString(value, name);
  if (!MODEL_KEY_PATTERN.test(value)) {
    fail(`${name} must be a lowercase kebab-case key.`);
  }
}

export function assertVersion(value: unknown): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    fail("version must be a positive integer.");
  }
}

export function assertOnlyKeys(value: object, allowed: readonly string[], label: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) fail(`${label} must not declare "${key}".`);
  }
}
