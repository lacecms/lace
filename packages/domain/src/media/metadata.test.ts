import { expect, test } from "vitest";
import { normalizeMediaTag, normalizeMediaTags } from "./metadata.js";

test("normalizes only ASCII media tags with stable limits and ordering", () => {
  expect(normalizeMediaTag(" Project-2026 ")).toBe("project-2026");
  expect(normalizeMediaTags(["Z", " a ", "A", "0", "-"])).toEqual({ tags: ["-", "0", "a", "z"] });
  expect(normalizeMediaTag("a".repeat(40))).toBe("a".repeat(40));
  for (const value of [
    "",
    " ",
    "a".repeat(41),
    "a b",
    "a,b",
    "a_b",
    "Выставка",
    "ＲＥＡＤＹＭＡＧ",
    "😀",
    "a\nb",
    "\ta",
    "a\r",
    "a\u0000",
    "\ud800",
  ]) {
    expect(normalizeMediaTag(value)).toBeUndefined();
    expect(normalizeMediaTags(["valid", value])).toEqual({ issue: 1 });
  }
  expect(normalizeMediaTags(Array(21).fill("A"))).toEqual({ tags: ["a"] });
  const twenty = normalizeMediaTags(Array.from({ length: 20 }, (_, i) => `tag-${i}`));
  expect("tags" in twenty ? twenty.tags : undefined).toHaveLength(20);
  expect(normalizeMediaTags(Array.from({ length: 21 }, (_, i) => `tag-${i}`))).toEqual({
    issue: 20,
  });
});
