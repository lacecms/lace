// @ts-nocheck
// TODO(rf2): Type legacy SQLite rows, branded snapshot fixtures and malformed projection inputs.
import { expect, test } from "vitest";
import { decodeBase64Url, encodeBase64Url } from "./base64.js";
import { decodeCursor, encodeCursor, encodeSortCursor } from "./cursors.js";

test("encodes cursors byte-identically to Node Buffer base64url", () => {
  for (const text of ["", "a", "ab", "abc", '{"kind":"é✓😀","id":"x"}', "\u0000ÿ/+?"]) {
    expect(encodeBase64Url(text)).toBe(Buffer.from(text).toString("base64url"));
    expect(decodeBase64Url(encodeBase64Url(text))).toBe(text);
  }
  const payload = { id: "e-1", kind: "public:posts", timestamp: 7, version: 1 };
  expect(encodeCursor("public:posts", 7, "e-1")).toBe(
    Buffer.from(JSON.stringify(payload)).toString("base64url"),
  );
  expect(decodeCursor(encodeCursor("public:posts", 7, "e-1"), "public:posts")).toEqual({
    id: "e-1",
    timestamp: 7,
  });
  expect(encodeSortCursor("k", "Ünïcode", "id")).toBe(
    Buffer.from(JSON.stringify({ id: "id", kind: "k", value: "Ünïcode", version: 2 })).toString(
      "base64url",
    ),
  );
  for (const invalid of ["not a cursor", "a", encodeBase64Url("[]")]) {
    expect(() => decodeCursor(invalid, "public:posts")).toThrow(
      expect.objectContaining({ code: "CONTENT_INVALID_STATE" }),
    );
  }
});
