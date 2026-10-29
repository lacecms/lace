export type McpAccess = "read" | "write";

const shellQuote = (value: string) => `'${value.replaceAll("'", "'\"'\"'")}'`;

/** Shell, TOML and JSON values stay data, even for unusual but valid URL hosts. */
export function mcpConnectionExamples(endpoint: string, access: McpAccess) {
  const scopes =
    access === "write"
      ? ["content:read", "content:write", "offline_access"]
      : ["content:read", "offline_access"];
  const shellUrl = shellQuote(endpoint);
  const claude = { type: "http", url: endpoint, oauth: { scopes: scopes.join(" ") } };
  const login = `codex mcp login lace --oauth-client-registration dcr --scopes ${scopes.join(",")}`;
  return {
    claudeCommand: `claude mcp add-json --scope user lace ${shellQuote(JSON.stringify(claude))}`,
    geminiJson: JSON.stringify(
      { mcpServers: { lace: { httpUrl: endpoint, oauth: { enabled: true, scopes } } } },
      null,
      2,
    ),
    cli: `codex mcp add lace --url ${shellUrl}\n${login}`,
    login,
    toml: `[mcp_servers.lace]\nurl = ${JSON.stringify(endpoint)}\nscopes = [${scopes.map((scope) => JSON.stringify(scope)).join(", ")}]`,
  };
}
