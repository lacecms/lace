import { expect, test } from "vitest";
import { encodeEntryLink } from "./internal-link-tokens.js";
import { field } from "./builders.js";
import { parseSchemaPath, schemaFieldAt } from "./schema-path.js";

test("entry links reject invalid target IDs with TypeError", () => {
  expect(() => encodeEntryLink("")).toThrow(TypeError);
  expect(() => encodeEntryLink("")).toThrow("Invalid internal link target ID.");
});

test("schema paths reject non-string arguments with TypeError", () => {
  // @ts-expect-error Test an untyped caller.
  expect(() => parseSchemaPath(null)).toThrow(TypeError);
});

test("schema paths reject invalid path syntax with TypeError", () => {
  expect(() => parseSchemaPath("/items/0")).toThrow(TypeError);
  expect(() => parseSchemaPath("/items/0")).toThrow("Invalid schema path: /items/0.");
});

test("schema traversal rejects scalar container transitions with TypeError", () => {
  expect(() => schemaFieldAt({ title: field.text() }, ["title", "nested"])).toThrow(TypeError);
  expect(() => schemaFieldAt({ title: field.text() }, ["title", "nested"])).toThrow(
    "Invalid schema traversal: /title/nested.",
  );
});
