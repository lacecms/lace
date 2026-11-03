import type { JsonObject, JsonValue } from "@lacecms/content";
import * as v from "valibot";

function isJsonValue(value: unknown): value is JsonValue {
  const ancestors = new WeakSet<object>();
  const pending: { value: unknown; exit?: boolean }[] = [{ value }];
  while (pending.length > 0) {
    const next = pending.pop()!;
    const current = next.value;
    if (
      current === null ||
      typeof current === "boolean" ||
      typeof current === "string" ||
      (typeof current === "number" && Number.isFinite(current))
    )
      continue;
    if (typeof current !== "object") return false;
    if (next.exit) {
      ancestors.delete(current);
      continue;
    }
    if (ancestors.has(current)) return false;
    const array = Array.isArray(current);
    if (
      !array &&
      Object.getPrototypeOf(current) !== null &&
      Object.getPrototypeOf(current) !== Object.prototype
    )
      return false;
    if (Object.getOwnPropertySymbols(current).length > 0) return false;
    const descriptors = Object.getOwnPropertyDescriptors(current);
    if (
      array &&
      Array.from({ length: current.length }, (_, index) => Object.hasOwn(descriptors, index)).some(
        (present) => !present,
      )
    )
      return false;
    ancestors.add(current);
    pending.push({ value: current, exit: true });
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (array && key === "length") continue;
      if (!descriptor.enumerable || !("value" in descriptor)) return false;
      pending.push({ value: descriptor.value });
    }
  }
  return true;
}

export function isJsonObject(value: unknown): value is JsonObject {
  return !Array.isArray(value) && value !== null && typeof value === "object" && isJsonValue(value);
}

/** Any portable JSON value accepted by the shared transport contract. */
export const jsonValueSchema = v.custom<JsonValue>(isJsonValue);
export const jsonObjectSchema = v.custom<JsonObject>(isJsonObject);
