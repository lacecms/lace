import { fail } from "./errors.js";
import { isPlainObject } from "./objects.js";

/** A JSON primitive that can be transported between Lace runtimes. */
export type JsonPrimitive = boolean | null | number | string;

/** A portable JSON value. Field descriptors never retain executable values. */
export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];

/** A portable JSON object. */
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export type MutableJsonObject = { [key: string]: MutableJsonValue };
export type MutableJsonValue =
  | boolean
  | null
  | number
  | string
  | MutableJsonObject
  | MutableJsonValue[];

function isArrayIndex(key: string): boolean {
  if (key === "0") {
    return true;
  }

  if (!/^[1-9][0-9]*$/u.test(key)) {
    return false;
  }

  const index = Number(key);
  return Number.isSafeInteger(index) && index < 4_294_967_295;
}

export function normalizeJsonValue(
  value: unknown,
  path: string,
  ancestors: WeakSet<object>,
): MutableJsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      fail(path, "must not contain a non-finite number.");
    }

    return value;
  }

  if (typeof value !== "object") {
    fail(path, "must be JSON-serializable.");
  }

  if (ancestors.has(value)) {
    fail(path, "must not contain a cyclic reference.");
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const keys = Reflect.ownKeys(value);
      for (const key of keys) {
        if (key === "length") {
          continue;
        }

        if (typeof key !== "string" || !isArrayIndex(key)) {
          fail(path, "must not contain non-index array properties or symbols.");
        }

        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (descriptor === undefined) {
          fail(`${path}[${key}]`, "must contain an own data property.");
        }
        if ("get" in descriptor || "set" in descriptor) {
          fail(`${path}[${key}]`, "must not contain accessor properties.");
        }
      }

      const normalized: MutableJsonValue[] = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index)) {
          fail(`${path}[${index}]`, "must not contain sparse array entries.");
        }

        normalized.push(normalizeJsonValue(value[index], `${path}[${index}]`, ancestors));
      }

      return normalized;
    }

    if (!isPlainObject(value)) {
      fail(path, "must not contain a non-plain object.");
    }

    const normalized: MutableJsonObject = {};
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") {
        fail(path, "must not contain symbol keys.");
      }

      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined) {
        fail(`${path}.${key}`, "must contain an own data property.");
      }
      if ("get" in descriptor || "set" in descriptor) {
        fail(`${path}.${key}`, "must not contain accessor properties.");
      }
      if (!descriptor.enumerable) {
        fail(`${path}.${key}`, "must contain an enumerable data property.");
      }

      normalized[key] = normalizeJsonValue(descriptor.value, `${path}.${key}`, ancestors);
    }

    return normalized;
  } finally {
    ancestors.delete(value);
  }
}
