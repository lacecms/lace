// @ts-nocheck
// TODO(rf2): Type legacy SQLite rows, branded snapshot fixtures and malformed projection inputs.
import { expect, test } from "vitest";
import { DatabaseSync } from "node:sqlite";

test("ordinary literal LIKE escapes wildcards and preserves SQLite case semantics", async () => {
  const { literalLikePattern } = await import("./literal-like.js");
  const db = new DatabaseSync(":memory:");
  try {
    const match = (value, text) =>
      db.prepare("select ? like ? escape '\\' as matched").get(value, literalLikePattern(text))
        .matched;
    expect(match("Launch", "LAUNCH")).toBe(1);
    expect(match("Москва", "Москва")).toBe(1);
    expect(match("Москва", "МОСКВА")).toBe(0);
    expect(match("Ёлка", "ёЛКА")).toBe(0);
    expect(match("Ёлка", "Елка")).toBe(0);
    expect(match("Їжак Ђак AЯ", "Їжак Ђак aЯ")).toBe(1);
    expect(match("Їжак Ђак AЯ", "їжак Ђак aЯ")).toBe(0);
    for (const symbol of [
      "[",
      "]",
      "*",
      "?",
      "'",
      '"',
      "%",
      "_",
      "\\",
      "[]*?%_\\",
      "[a-z]",
      "[[]",
      "é",
      "😀",
    ]) {
      expect(match(`before ${symbol} after`, symbol)).toBe(1);
      expect(match("unrelated", symbol)).toBe(0);
    }
    expect(literalLikePattern("%_\\")).toBe("%\\%\\_\\\\%");
    expect(Buffer.byteLength(literalLikePattern("a".repeat(48)))).toBe(50);
    expect(Buffer.byteLength(literalLikePattern("я".repeat(24)))).toBe(50);
    expect(Buffer.byteLength(literalLikePattern("%".repeat(24)))).toBe(50);
    expect(Buffer.byteLength(literalLikePattern("я".repeat(24) + "a"))).toBe(51);
    expect(match("x".repeat(200), "x".repeat(200))).toBe(1);
  } finally {
    db.close();
  }
});
