import { expect, test } from "vitest";
import {
  architectureSizeDiagnostics,
  countArchitectureLines,
} from "./test-support/architecture-size.mjs";

const content = (count) => Array(count).fill("text").join("\n");

test("counts blank lines only per file and excludes Mermaid fences and contents", () => {
  const source = [
    "text",
    "",
    "  \t",
    "```mermaid",
    "graph TD",
    "",
    "```",
    "```js",
    "code",
    "```",
    "```mermaid",
    "flowchart LR",
    "```",
    "last",
    "",
  ].join("\n");
  expect(countArchitectureLines(source)).toEqual({ file: 7, nonblank: 5 });
  expect(countArchitectureLines("")).toEqual({ file: 0, nonblank: 0 });
  expect(countArchitectureLines("text\n\n")).toEqual({ file: 2, nonblank: 1 });
});

test("accepts 600 file lines and reports a file with 601", () => {
  const files = new Map([
    ["allowed.md", content(600)],
    ["oversized.md", content(601)],
  ]);
  expect(architectureSizeDiagnostics(files)).toEqual({
    oversized: ["oversized.md: 601 lines (limit 600)"],
    warning: null,
  });
});

test("warns only above 3000 nonblank directory lines", () => {
  const files = new Map(Array.from({ length: 5 }, (_, index) => [`${index}.md`, content(600)]));
  expect(architectureSizeDiagnostics(files)).toEqual({ oversized: [], warning: null });
  files.set("extra.md", "\n   \ntext\n```mermaid\ngraph TD\n```\n");
  expect(architectureSizeDiagnostics(files)).toEqual({
    oversized: [],
    warning: expect.stringMatching(/3001.*3000/),
  });
});
