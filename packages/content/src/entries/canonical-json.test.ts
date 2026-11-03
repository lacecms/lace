// @ts-nocheck
// TODO(rf2): Type recursive descriptor fixtures, malformed runtime inputs and table tuples.
import { test, expect } from "vitest";
import { canonicalizeJson, sha256CanonicalJson } from "./canonical-json.js";

test("canonicalizes JSON and hashes canonical UTF-8 bytes with Web Crypto", async () => {
  const first = { z: [{ b: false, a: true }], a: 2 };
  const second = { a: 2, z: [{ a: true, b: false }] };

  expect(canonicalizeJson(first)).toBe('{"a":2,"z":[{"a":true,"b":false}]}');
  expect(canonicalizeJson(first)).toBe(canonicalizeJson(second));
  expect(canonicalizeJson([2, 1])).not.toBe(canonicalizeJson([1, 2]));
  expect(await sha256CanonicalJson({})).toBe(
    "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
  );
  expect(await sha256CanonicalJson(first)).toBe(await sha256CanonicalJson(second));
  expect(await sha256CanonicalJson(first, { subtle: globalThis.crypto.subtle })).toBe(
    await sha256CanonicalJson(first),
  );
});
