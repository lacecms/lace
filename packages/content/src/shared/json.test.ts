import { expect, test } from "vitest";
import { FieldConfigurationError } from "./errors.js";
import { isPortableJsonValue, normalizeJsonValue } from "./json.js";

function failure(value: unknown): string {
  try {
    normalizeJsonValue(value, "value");
  } catch (error) {
    expect(error).toBeInstanceOf(FieldConfigurationError);
    expect(isPortableJsonValue(value)).toBe(false);
    return (error as Error).message;
  }
  throw new Error("expected a portable JSON failure");
}

/** A copy of `values` with a hole at `index`. */
function withHole(values: readonly unknown[], index: number): unknown[] {
  const copy = [...values];
  delete copy[index];
  return copy;
}

function nested(depth: number, innermost: unknown): unknown {
  let value = innermost;
  for (let level = 0; level < depth; level += 1) value = [value];
  return value;
}

test("portable values normalize to a detached copy", () => {
  const shared = { leaf: 1 };
  const value = {
    list: [null, true, -0, "text", { nested: [1.5] }],
    a: shared,
    b: shared,
    bare: Object.assign(Object.create(null), { key: "value" }),
  };
  const normalized = normalizeJsonValue(value, "value") as Record<string, unknown>;
  expect(normalized).toEqual(value);
  expect(normalized).not.toBe(value);
  expect(normalized.list).not.toBe(value.list);
  expect(normalized.a).not.toBe(shared);
  expect(Object.getPrototypeOf(normalized.bare)).toBe(Object.prototype);
  expect(isPortableJsonValue(value)).toBe(true);
  for (const primitive of [null, false, 0, "", -0]) {
    expect(normalizeJsonValue(primitive, "value")).toBe(primitive);
    expect(isPortableJsonValue(primitive)).toBe(true);
  }
});

test("each refused node is reported with its rule and path", () => {
  const cyclic: Record<string, unknown> = {};
  cyclic.self = { back: cyclic };
  const sparse = withHole([1, 2, 3], 1);
  const accessor = Object.defineProperty({}, "value", { enumerable: true, get: () => 1 });
  const hidden = Object.defineProperty({}, "value", { enumerable: false, value: 1 });
  const arrayAccessor = Object.defineProperty([1, 2], 1, { enumerable: true, get: () => 2 });
  const cases: readonly (readonly [unknown, string])[] = [
    [{ a: [Number.NaN] }, "value.a[0] must not contain a non-finite number."],
    [{ a: Number.POSITIVE_INFINITY }, "value.a must not contain a non-finite number."],
    [{ a: undefined }, "value.a must be JSON-serializable."],
    [[() => 1], "value[0] must be JSON-serializable."],
    [{ a: 1n }, "value.a must be JSON-serializable."],
    [Symbol("s"), "value must be JSON-serializable."],
    [cyclic, "value.self.back must not contain a cyclic reference."],
    [{ a: new Date(0) }, "value.a must not contain a non-plain object."],
    [{ a: new Map() }, "value.a must not contain a non-plain object."],
    [{ [Symbol("s")]: 1 }, "value must not contain symbol keys."],
    [{ a: accessor }, "value.a.value must not contain accessor properties."],
    [{ a: hidden }, "value.a.value must contain an enumerable data property."],
    [{ a: sparse }, "value.a[1] must not contain sparse array entries."],
    [{ a: arrayAccessor }, "value.a[1] must not contain accessor properties."],
    [
      { a: Object.assign([1], { extra: 2 }) },
      "value.a must not contain non-index array properties or symbols.",
    ],
    [
      { a: Object.assign([1], { [Symbol("s")]: 2 }) },
      "value.a must not contain non-index array properties or symbols.",
    ],
  ];
  for (const [value, message] of cases) expect(failure(value), message).toBe(message);
});

test("a non-enumerable array element is portable, as JSON.stringify reads it by index", () => {
  const value = Object.defineProperty([1, 2], 1, { enumerable: false, value: 2 });
  expect(JSON.stringify(value)).toBe("[1,2]");
  expect(isPortableJsonValue(value)).toBe(true);
  expect(normalizeJsonValue(value, "value")).toEqual([1, 2]);
});

test("the first failure in depth-first order is reported", () => {
  // The first key's subtree is visited before the second key is checked.
  expect(failure({ a: { b: undefined }, [Symbol("s")]: 1 })).toBe(
    "value.a.b must be JSON-serializable.",
  );
  // Every own key of an array is checked before its elements are visited.
  expect(failure({ a: Object.assign([undefined], { extra: 1 }) })).toBe(
    "value.a must not contain non-index array properties or symbols.",
  );
  // A hole is reported only after the elements before it.
  expect(failure(withHole([[undefined], 0, 1], 1))).toBe("value[0][0] must be JSON-serializable.");
  expect(failure(withHole([1, 0, [undefined]], 1))).toBe(
    "value[1] must not contain sparse array entries.",
  );
});

test("deeply nested values normalize without exhausting the stack", () => {
  const depth = 100_000;
  const value = nested(depth, { leaf: [1] });
  expect(isPortableJsonValue(value)).toBe(true);
  let copy = normalizeJsonValue(value, "value") as unknown;
  let source = value;
  let shared = 0;
  for (let level = 0; level < depth; level += 1) {
    if (copy === source) shared += 1;
    copy = (copy as unknown[])[0];
    source = (source as unknown[])[0];
  }
  expect(shared).toBe(0);
  expect(copy).toEqual({ leaf: [1] });
  expect(failure(nested(depth, undefined))).toBe(
    `value${"[0]".repeat(depth)} must be JSON-serializable.`,
  );
});
