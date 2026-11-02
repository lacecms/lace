import { expect, test } from "vitest";
import { deepFreeze, isPlainObject, isRecord } from "./objects.js";

test("deepFreeze preserves identity and freezes nested records and arrays", () => {
  const value = { children: [{ title: "Lace" }], optional: null };
  expect(deepFreeze(value)).toBe(value);
  expect(Object.isFrozen(value)).toBe(true);
  expect(Object.isFrozen(value.children)).toBe(true);
  expect(Object.isFrozen(value.children[0])).toBe(true);
  expect(deepFreeze(null)).toBeNull();
  expect(deepFreeze(1)).toBe(1);
});

test("plain records accept null prototypes and reject arrays and class instances", () => {
  class Example {}
  for (const value of [{}, Object.create(null) as object]) {
    expect(isPlainObject(value)).toBe(true);
    expect(isRecord(value)).toBe(true);
  }
  for (const value of [[], new Example()]) {
    expect(isPlainObject(value)).toBe(false);
    expect(isRecord(value)).toBe(false);
  }
  for (const value of [null, undefined, "text", 1, true]) expect(isRecord(value)).toBe(false);
});
