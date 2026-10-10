import { afterEach, expect, test } from "vitest";
import { readFragmentToken, removeFragment } from "./fragment-token.js";

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

test("reads only the token parameter of a fragment", () => {
  expect(readFragmentToken("#token=abc_DEF-123")).toBe("abc_DEF-123");
  expect(readFragmentToken("token=abc")).toBe("abc");
  expect(readFragmentToken("#other=1&token=xyz")).toBe("xyz");
  expect(readFragmentToken("")).toBeUndefined();
  expect(readFragmentToken("#token=")).toBeUndefined();
  expect(readFragmentToken("#section")).toBeUndefined();
});

test("drops the fragment from the address bar and keeps path and query", () => {
  window.history.replaceState({ key: "kept" }, "", "/admin/reset-password?from=mail#token=secret");
  const length = window.history.length;
  removeFragment();
  expect(window.location.href).not.toContain("secret");
  expect(window.location.pathname).toBe("/admin/reset-password");
  expect(window.location.search).toBe("?from=mail");
  expect(window.location.hash).toBe("");
  expect(window.history.state).toEqual({ key: "kept" });
  expect(window.history.length).toBe(length);
});
