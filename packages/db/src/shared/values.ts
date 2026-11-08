import type { JsonObject } from "@lacecms/content";
import { LaceError } from "@lacecms/content";
import type { Role } from "@lacecms/domain";
import { failure } from "./failures.js";
import { SQL_MAX_PAGE_SIZE } from "./limits.js";
export interface SortSql {
  readonly order: string;
  readonly value: string;
}

export function assertPageSize(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > SQL_MAX_PAGE_SIZE) {
    failure(`Page limit must be a positive integer no greater than ${SQL_MAX_PAGE_SIZE}.`);
  }
  return value;
}

export function assertNonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    failure(`${label} is invalid.`);
  }
  return value;
}

export function assertTimestamp(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0)
    failure(`${label} must be a UTC millisecond value.`);
  return value;
}

export function parseObject(value: string, label: string): JsonObject {
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
      failure(`${label} must contain a JSON object.`);
    }
    return parsed as JsonObject;
  } catch (error) {
    if (error instanceof LaceError) throw error;
    failure(`${label} contains invalid JSON.`);
  }
}

export function storedRole(value: string | null | undefined): Role {
  return value === "admin" || value === "editor" || value === "viewer" ? value : "viewer";
}

export function chunks<Value>(
  values: readonly Value[],
  size: number,
): readonly (readonly Value[])[] {
  const result: Value[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}
