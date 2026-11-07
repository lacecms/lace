import type { JsonValue } from "@lacecms/content";
import { DomainError } from "./errors.js";
import type { DomainErrorCode } from "./errors.js";

export function fail(code: DomainErrorCode, message: string): never {
  throw new DomainError(code, message);
}

export function cloneJson(value: JsonValue): JsonValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(cloneJson);
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [key, cloneJson(nestedValue)]),
  );
}
