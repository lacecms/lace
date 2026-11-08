// @ts-nocheck
// TODO(rf2): Type mutable transport fixtures and deliberately malformed metadata.
import * as v from "valibot";
import { describe, expect, test } from "vitest";
import { ContractValidationError } from "../errors/envelope.js";
import {
  entityTagForVersion,
  resolveExpectedRevision,
  versionFromEntityTag,
} from "./preconditions.js";
import { entityTagSchema, toIsoTimestamp } from "./primitives.js";
import { timestamp } from "../test-support/rest-fixtures.js";

/** A contract validation failure whose single request-level issue mentions `text`. */
const precondition = (text) =>
  expect.objectContaining({
    name: "ContractValidationError",
    issues: [expect.objectContaining({ message: expect.stringContaining(text), path: "" })],
  });

describe("shared REST transport conventions", () => {
  test("uses canonical ISO timestamps and version-derived entity tags", () => {
    expect(toIsoTimestamp(timestamp)).toBe("2025-01-01T00:00:00.000Z");
    expect(entityTagForVersion(7)).toBe('"7"');
    expect(versionFromEntityTag('"7"')).toBe(7);
  });
  test("normalizes body and If-Match revisions only when they agree", () => {
    expect(resolveExpectedRevision({ expectedRevision: 4 })).toBe(4);
    expect(resolveExpectedRevision({ ifMatch: '"4"' })).toBe(4);
    expect(resolveExpectedRevision({ expectedRevision: 4, ifMatch: '"4"' })).toBe(4);
    expect(() => resolveExpectedRevision({ expectedRevision: 4, ifMatch: '"5"' })).toThrow(
      precondition("must agree"),
    );
    expect(() => resolveExpectedRevision({ ifMatch: "5" })).toThrow(precondition("ETag"));
    expect(() => resolveExpectedRevision({})).toThrow(precondition("required"));
  });
});

test.each(['"0"', 'W/"0"', '"7"', 'W/"7"', 'W/"007"', '"9007199254740991"'])(
  "accepts a safe version-derived validator %s",
  (tag) => {
    expect(v.safeParse(entityTagSchema, tag).success).toBe(true);
    expect(versionFromEntityTag(tag)).toBe(Number(tag.replace(/^W\//u, "").slice(1, -1)));
  },
);

test.each([
  "7",
  '"hash"',
  "*",
  '"1", "2"',
  'w/"1"',
  'W/ "1"',
  '"-1"',
  '"1.5"',
  '""',
  '"9007199254740992"',
  'W/"9007199254740992"',
  ' "1"',
  '"1"\n',
])("rejects unsupported validator %s", (tag) => {
  expect(v.safeParse(entityTagSchema, tag).success).toBe(false);
  expect(() => versionFromEntityTag(tag)).toThrow(ContractValidationError);
});

test("rejects unsafe generated versions and weak mutation preconditions", () => {
  for (const version of [-1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1])
    expect(() => entityTagForVersion(version)).toThrow(TypeError);
  expect(() => resolveExpectedRevision({ ifMatch: 'W/"4"' })).toThrow(precondition("strong"));
  expect(() => resolveExpectedRevision({ expectedRevision: 4, ifMatch: 'W/"4"' })).toThrow(
    precondition("strong"),
  );
});
