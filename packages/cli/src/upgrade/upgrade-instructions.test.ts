import { describe, expect, it } from "vitest";
import { validateUpgradeInstructions, presentUpgradeInstructions } from "./upgrade-instructions.js";

const valid = {
  schemaVersion: 1 as const,
  templateVersion: "2",
  database: ["Back up before migrating."],
  configuration: ["Update config.\nThen sync."],
};
describe("upgrade instruction metadata", () => {
  it("accepts matching bounded plain text without executing it", () => {
    expect(validateUpgradeInstructions(valid, "2")).toEqual(valid);
    expect(presentUpgradeInstructions("2", null)).toContain(
      "No version-specific instructions supplied.",
    );
    expect(presentUpgradeInstructions("2", valid)).toContain("explicit deployment steps");
  });
  it.each([
    null,
    [],
    { ...valid, schemaVersion: 2 },
    { ...valid, templateVersion: "3" },
    { ...valid, extra: true },
    { ...valid, database: [""] },
    { ...valid, database: ["\u001b[31m"] },
    { ...valid, database: ["\u009b31m"] },
    { ...valid, configuration: ["x".repeat(8001)] },
    { ...valid, database: Array(101).fill("x") },
    { ...valid, database: [1] },
  ])("rejects invalid guidance %j", (value) => {
    expect(() => validateUpgradeInstructions(value, "2")).toThrow("Invalid upgrade instructions");
  });
});
