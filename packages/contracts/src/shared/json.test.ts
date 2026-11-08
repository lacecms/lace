import { expect, test } from "vitest";
import * as v from "valibot";
import { jsonObjectSchema, jsonValueSchema } from "./json.js";

function nested(depth: number, innermost: unknown): unknown {
  let value = innermost;
  for (let level = 0; level < depth; level += 1) value = [value];
  return value;
}

test("an array with a named property is refused, because serialization drops it", () => {
  const list = Object.assign([1], { extra: 2 });
  expect(JSON.stringify(list)).toBe("[1]");
  expect(v.is(jsonValueSchema, list)).toBe(false);
  expect(v.is(jsonObjectSchema, { list })).toBe(false);
});

test("a non-enumerable array element is accepted, because serialization reads it", () => {
  const list = Object.defineProperty([1, 2], 1, { enumerable: false, value: 2 });
  expect(JSON.stringify(list)).toBe("[1,2]");
  expect(v.is(jsonValueSchema, list)).toBe(true);
  expect(v.is(jsonObjectSchema, { list })).toBe(true);
});

test("JSON objects are non-array objects that hold portable JSON", () => {
  expect(v.is(jsonObjectSchema, { a: [null, true, 1, "x"] })).toBe(true);
  expect(v.is(jsonObjectSchema, [])).toBe(false);
  expect(v.is(jsonObjectSchema, null)).toBe(false);
  expect(v.is(jsonObjectSchema, { a: undefined })).toBe(false);
  expect(v.is(jsonValueSchema, "text")).toBe(true);
  expect(v.is(jsonValueSchema, Number.NaN)).toBe(false);
});

test("deeply nested values are validated without exhausting the stack", () => {
  const depth = 100_000;
  expect(v.is(jsonValueSchema, nested(depth, 1))).toBe(true);
  expect(v.is(jsonObjectSchema, { deep: nested(depth, 1) })).toBe(true);
  expect(v.is(jsonValueSchema, nested(depth, undefined))).toBe(false);
  expect(v.safeParse(jsonObjectSchema, { deep: nested(depth, undefined) }).success).toBe(false);
});
