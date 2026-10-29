/** One runtime-neutral parser; diagnostics never include supplied values. */
export function parseMcpEnabled(value: unknown): boolean {
  if (value === undefined || value === "false") return false;
  if (value === "true") return true;
  throw new TypeError("Invalid LACE_MCP_ENABLED.");
}
