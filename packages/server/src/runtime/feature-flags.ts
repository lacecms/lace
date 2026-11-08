import { parseMcpEnabled } from "./mcp-settings.js";

/** Optional runtime surfaces switched by environment variables. */
export interface RuntimeFeatureFlags {
  /** Browser API reference; machine-readable OpenAPI is always served. */
  readonly apiDocsEnabled: boolean;
  readonly mcpEnabled: boolean;
}

export interface RuntimeFeatureFlagIssue {
  readonly reason: "invalid";
  readonly variable: "LACE_API_DOCS_ENABLED" | "LACE_MCP_ENABLED";
}

export interface RuntimeFeatureFlagEnvironment {
  readonly LACE_API_DOCS_ENABLED?: unknown;
  readonly LACE_MCP_ENABLED?: unknown;
}

/**
 * The one rule both runtime settings parsers use: absent or `false` disables a
 * flag, `true` enables it, anything else is an issue naming the variable only.
 * A flag with an issue reads as disabled.
 */
export function parseRuntimeFeatureFlags(environment: RuntimeFeatureFlagEnvironment): {
  readonly flags: RuntimeFeatureFlags;
  readonly issues: readonly RuntimeFeatureFlagIssue[];
} {
  const issues: RuntimeFeatureFlagIssue[] = [];
  let mcpEnabled = false;
  try {
    mcpEnabled = parseMcpEnabled(environment.LACE_MCP_ENABLED);
  } catch {
    issues.push({ reason: "invalid", variable: "LACE_MCP_ENABLED" });
  }
  const docs = environment.LACE_API_DOCS_ENABLED;
  if (docs !== undefined && docs !== "true" && docs !== "false")
    issues.push({ reason: "invalid", variable: "LACE_API_DOCS_ENABLED" });
  return Object.freeze({
    flags: Object.freeze({ apiDocsEnabled: docs === "true", mcpEnabled }),
    issues: Object.freeze(issues),
  });
}
