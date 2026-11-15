import { expect, test } from "vitest";
import {
  architectureSizeDiagnostics,
  warnArchitectureSize,
} from "../../test-support/architecture-size.mjs";

test("reports architecture size diagnostics", () => {
  const lineCount = process.env.ARCHITECTURE_SIZE_FIXTURE === "oversized" ? 601 : 600;
  const files = new Map(
    Array.from({ length: 5 }, (_, index) => [
      `${index}.md`,
      Array(lineCount).fill("text").join("\n"),
    ]),
  );
  if (lineCount === 600) files.set("extra.md", "text");
  const { oversized, warning } = architectureSizeDiagnostics(files);
  warnArchitectureSize(warning);
  expect(oversized, "oversized architecture files").toEqual([]);
});
