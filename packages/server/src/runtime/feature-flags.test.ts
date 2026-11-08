import { expect, test } from "vitest";
import { parseRuntimeFeatureFlags } from "../index.js";

test("absent and false disable both flags; true enables them", () => {
  expect(parseRuntimeFeatureFlags({})).toEqual({
    flags: { apiDocsEnabled: false, mcpEnabled: false },
    issues: [],
  });
  expect(
    parseRuntimeFeatureFlags({ LACE_API_DOCS_ENABLED: "false", LACE_MCP_ENABLED: "false" }),
  ).toEqual({ flags: { apiDocsEnabled: false, mcpEnabled: false }, issues: [] });
  expect(
    parseRuntimeFeatureFlags({ LACE_API_DOCS_ENABLED: "true", LACE_MCP_ENABLED: "true" }),
  ).toEqual({ flags: { apiDocsEnabled: true, mcpEnabled: true }, issues: [] });
});

test.each(["TRUE", "1", "", " true", 1, true])(
  "names an invalid value %j once per variable without repeating it",
  (value) => {
    const result = parseRuntimeFeatureFlags({
      LACE_API_DOCS_ENABLED: value,
      LACE_MCP_ENABLED: value,
    });
    expect(result.flags).toEqual({ apiDocsEnabled: false, mcpEnabled: false });
    expect(result.issues).toEqual([
      { reason: "invalid", variable: "LACE_MCP_ENABLED" },
      { reason: "invalid", variable: "LACE_API_DOCS_ENABLED" },
    ]);
    // Issues carry only the variable and reason, never the supplied value.
    for (const issue of result.issues)
      expect(Object.keys(issue).sort()).toEqual(["reason", "variable"]);
  },
);
