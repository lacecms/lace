import { expect, test } from "vitest";
import * as v from "valibot";
import { jsonValueSchema } from "../packages/contracts/dist/index.js";
import { normalizeJsonValue } from "../packages/content/dist/shared/json.js";

function contentAccepts(value) {
  try {
    normalizeJsonValue(value, "value");
    return true;
  } catch {
    return false;
  }
}

const cyclic = {};
cyclic.self = cyclic;
const cyclicArray = [];
cyclicArray.push(cyclicArray);
const shared = { leaf: 1 };
const sparse = [1, , 3];
const accessor = Object.defineProperty({}, "value", { enumerable: true, get: () => 1 });
const hidden = Object.defineProperty({}, "value", { enumerable: false, value: 1 });
const arrayWithProperty = Object.assign([1], { extra: 2 });
const hiddenElement = Object.defineProperty([1, 2], 1, { enumerable: false, value: 2 });
const arrayAccessor = Object.defineProperty([1], 0, { enumerable: true, get: () => 1 });

function nested(depth, innermost) {
  let value = innermost;
  for (let level = 0; level < depth; level += 1) value = [value];
  return value;
}

/** Edge values with the verdict both validators give. */
const edges = [
  ["null", null, true],
  ["negative zero", -0, true],
  ["string", "text", true],
  ["NaN", Number.NaN, false],
  ["Infinity", Number.POSITIVE_INFINITY, false],
  ["undefined", undefined, false],
  ["function", () => 1, false],
  ["bigint", 1n, false],
  ["symbol", Symbol("s"), false],
  ["plain object", { a: [1, { b: null }] }, true],
  ["null-prototype object", Object.assign(Object.create(null), { a: 1 }), true],
  ["class instance", new (class Box {})(), false],
  ["date", new Date(0), false],
  ["map", new Map(), false],
  ["parsed __proto__ key", JSON.parse('{"__proto__":{"a":1}}'), true],
  ["symbol key", { [Symbol("s")]: 1 }, false],
  ["accessor property", accessor, false],
  ["non-enumerable property", hidden, false],
  ["object cycle", cyclic, false],
  ["array cycle", cyclicArray, false],
  ["shared acyclic reference", { a: shared, b: shared }, true],
  ["sparse array", sparse, false],
  ["array accessor element", arrayAccessor, false],
  ["array with a named property", arrayWithProperty, false],
  ["array with a non-enumerable element", hiddenElement, true],
  ["array nested 100,000 levels", nested(100_000, 1), true],
  ["undefined nested 100,000 levels", nested(100_000, undefined), false],
];

test("contracts and content JSON validators give the same verdict on every edge value", () => {
  const results = edges.map(([name, value]) => [
    name,
    v.is(jsonValueSchema, value),
    contentAccepts(value),
  ]);
  expect(results).toEqual(edges.map(([name, , accepted]) => [name, accepted, accepted]));
});
