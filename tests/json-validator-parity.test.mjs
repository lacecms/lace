import { expect, test } from "vitest";
import * as v from "valibot";
import { jsonValueSchema } from "../packages/contracts/dist/index.js";
import { normalizeJsonValue } from "../packages/content/dist/shared/json.js";

function contentAccepts(value) {
  try {
    normalizeJsonValue(value, "value", new WeakSet());
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

/** Edge values with the result each validator gives. */
const edges = [
  ["null", null, true, true],
  ["negative zero", -0, true, true],
  ["string", "text", true, true],
  ["NaN", Number.NaN, false, false],
  ["Infinity", Number.POSITIVE_INFINITY, false, false],
  ["undefined", undefined, false, false],
  ["function", () => 1, false, false],
  ["bigint", 1n, false, false],
  ["symbol", Symbol("s"), false, false],
  ["plain object", { a: [1, { b: null }] }, true, true],
  ["null-prototype object", Object.assign(Object.create(null), { a: 1 }), true, true],
  ["class instance", new (class Box {})(), false, false],
  ["date", new Date(0), false, false],
  ["map", new Map(), false, false],
  ["parsed __proto__ key", JSON.parse('{"__proto__":{"a":1}}'), true, true],
  ["symbol key", { [Symbol("s")]: 1 }, false, false],
  ["accessor property", accessor, false, false],
  ["non-enumerable property", hidden, false, false],
  ["object cycle", cyclic, false, false],
  ["array cycle", cyclicArray, false, false],
  ["shared acyclic reference", { a: shared, b: shared }, true, true],
  ["sparse array", sparse, false, false],
  ["array accessor element", arrayAccessor, false, false],
  ["array with a named property", arrayWithProperty, true, false],
  ["array with a non-enumerable element", hiddenElement, false, true],
];

test("contracts and content JSON validators agree except on two array edge cases", () => {
  const results = edges.map(([name, value]) => [
    name,
    v.is(jsonValueSchema, value),
    contentAccepts(value),
  ]);
  expect(results).toEqual(edges.map(([name, , contracts, content]) => [name, contracts, content]));
  expect(
    results.filter(([, contracts, content]) => contracts !== content).map(([name]) => name),
  ).toEqual(["array with a named property", "array with a non-enumerable element"]);
});
