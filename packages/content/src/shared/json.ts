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

/** The first rule a value breaks, with the path of the offending node. */
class JsonValueFailure {
  public constructor(
    public readonly path: string,
    public readonly message: string,
  ) {}
}

/**
 * One open array or object. Arrays have no `keys`. `parent` and `key` locate
 * the node, so a path is built only when a rule fails.
 */
interface Frame {
  readonly parent: Frame | undefined;
  readonly key: number | string | undefined;
  readonly source: object;
  readonly keys: readonly (string | symbol)[] | undefined;
  readonly target: MutableJsonObject | MutableJsonValue[] | undefined;
  next: number;
}

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

function segment(frame: Frame, key: number | string): string {
  return frame.keys === undefined ? `[${key}]` : `.${key}`;
}

/** The path of `key` inside `frame`, or of `frame` itself without a key. */
function pathAt(root: string, frame: Frame | undefined, key?: number | string): string {
  let path = frame === undefined || key === undefined ? "" : segment(frame, key);
  for (let current = frame; current?.parent !== undefined; current = current.parent) {
    path = segment(current.parent, current.key!) + path;
  }

  return root + path;
}

/**
 * Walks a value depth first with an explicit stack, so any nesting depth that
 * a JSON parser produces is safe. Nodes are visited, and rules checked, in the
 * order of the former recursive walk, so the first failure is the same. With
 * `copy`, returns a detached copy; otherwise the returned value is meaningless.
 */
function walkJsonValue(
  value: unknown,
  root: string,
  copy: boolean,
): MutableJsonValue | JsonValueFailure {
  const ancestors = new Set<object>();
  const stack: Frame[] = [];

  const open = (
    current: unknown,
    parent: Frame | undefined,
    key: number | string | undefined,
  ): MutableJsonValue | JsonValueFailure => {
    if (current === null || typeof current === "boolean" || typeof current === "string") {
      return current;
    }

    if (typeof current === "number") {
      return Number.isFinite(current)
        ? current
        : new JsonValueFailure(pathAt(root, parent, key), "must not contain a non-finite number.");
    }

    if (typeof current !== "object") {
      return new JsonValueFailure(pathAt(root, parent, key), "must be JSON-serializable.");
    }

    if (ancestors.has(current)) {
      return new JsonValueFailure(
        pathAt(root, parent, key),
        "must not contain a cyclic reference.",
      );
    }

    let keys: readonly (string | symbol)[] | undefined;
    let target: MutableJsonObject | MutableJsonValue[] | undefined;
    if (Array.isArray(current)) {
      for (const own of Reflect.ownKeys(current)) {
        if (own === "length") {
          continue;
        }

        if (typeof own !== "string" || !isArrayIndex(own)) {
          return new JsonValueFailure(
            pathAt(root, parent, key),
            "must not contain non-index array properties or symbols.",
          );
        }

        const descriptor = Object.getOwnPropertyDescriptor(current, own);
        if (descriptor === undefined) {
          return new JsonValueFailure(
            `${pathAt(root, parent, key)}[${own}]`,
            "must contain an own data property.",
          );
        }
        if ("get" in descriptor || "set" in descriptor) {
          return new JsonValueFailure(
            `${pathAt(root, parent, key)}[${own}]`,
            "must not contain accessor properties.",
          );
        }
      }

      target = copy ? [] : undefined;
    } else {
      if (!isPlainObject(current)) {
        return new JsonValueFailure(
          pathAt(root, parent, key),
          "must not contain a non-plain object.",
        );
      }

      keys = Reflect.ownKeys(current);
      target = copy ? {} : undefined;
    }

    ancestors.add(current);
    stack.push({ parent, key, source: current, keys, target, next: 0 });
    return target ?? null;
  };

  const result = open(value, undefined, undefined);
  while (stack.length > 0 && !(result instanceof JsonValueFailure)) {
    const frame = stack[stack.length - 1]!;
    let child: MutableJsonValue | JsonValueFailure;
    if (frame.keys === undefined) {
      const array = frame.source as readonly unknown[];
      if (frame.next >= array.length) {
        ancestors.delete(array);
        stack.pop();
        continue;
      }

      const index = frame.next++;
      if (!Object.hasOwn(array, index)) {
        return new JsonValueFailure(
          pathAt(root, frame, index),
          "must not contain sparse array entries.",
        );
      }

      child = open(array[index], frame, index);
      if (child instanceof JsonValueFailure) {
        return child;
      }
      (frame.target as MutableJsonValue[] | undefined)?.push(child);
    } else {
      if (frame.next >= frame.keys.length) {
        ancestors.delete(frame.source);
        stack.pop();
        continue;
      }

      const key = frame.keys[frame.next++]!;
      if (typeof key !== "string") {
        return new JsonValueFailure(pathAt(root, frame), "must not contain symbol keys.");
      }

      const descriptor = Object.getOwnPropertyDescriptor(frame.source, key);
      if (descriptor === undefined) {
        return new JsonValueFailure(pathAt(root, frame, key), "must contain an own data property.");
      }
      if ("get" in descriptor || "set" in descriptor) {
        return new JsonValueFailure(
          pathAt(root, frame, key),
          "must not contain accessor properties.",
        );
      }
      if (!descriptor.enumerable) {
        return new JsonValueFailure(
          pathAt(root, frame, key),
          "must contain an enumerable data property.",
        );
      }

      child = open(descriptor.value, frame, key);
      if (child instanceof JsonValueFailure) {
        return child;
      }
      if (frame.target !== undefined) {
        (frame.target as MutableJsonObject)[key] = child;
      }
    }
  }

  return result;
}

/**
 * Whether a value is portable JSON: the set `normalizeJsonValue` accepts.
 * Transport contracts use this check, so both layers accept one set.
 */
export function isPortableJsonValue(value: unknown): value is JsonValue {
  return !(walkJsonValue(value, "", false) instanceof JsonValueFailure);
}

/** Returns a detached copy of a portable JSON value or fails with its path. */
export function normalizeJsonValue(value: unknown, path: string): MutableJsonValue {
  const result = walkJsonValue(value, path, true);
  if (result instanceof JsonValueFailure) {
    fail(result.path, result.message);
  }

  return result;
}
