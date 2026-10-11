import { expect, test } from "vitest";
import { consumeFocusRequest, requestFocus } from "./pending-focus.js";

test("a focus request is consumed exactly once", () => {
  expect(consumeFocusRequest("collection:posts")).toBe(false);
  requestFocus("collection:posts");
  expect(consumeFocusRequest("collection:pages")).toBe(false);
  expect(consumeFocusRequest("collection:posts")).toBe(true);
  expect(consumeFocusRequest("collection:posts")).toBe(false);
});
