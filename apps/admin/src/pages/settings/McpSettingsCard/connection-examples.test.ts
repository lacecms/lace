import { execFileSync } from "node:child_process";
import { expect, test } from "vitest";
import { mcpConnectionExamples } from "./connection-examples.js";

test("shell quotes protect unusual endpoint hosts and TOML retains exact text", () => {
  const endpoint = "https://odd'$(echo unwanted).example/mcp";
  const { cli, toml } = mcpConnectionExamples(endpoint, "read");
  // Substitute a harmless function for codex, then let a real shell parse the example.
  const result = execFileSync(
    "sh",
    ["-c", `codex() { printf '%s\\n' "$@"; }; ${cli.split("\n")[0]}`],
    { encoding: "utf8" },
  );
  expect(result.split("\n")[4]).toBe(endpoint);
  expect(toml).toContain(`url = ${JSON.stringify(endpoint)}`);
  expect(mcpConnectionExamples('https://quote"\\host.example/mcp', "write").toml).toContain(
    'url = "https://quote\\"\\\\host.example/mcp"',
  );
});

test.each(["read", "write"] as const)(
  "Claude and Gemini preserve %s access and exact endpoint as data",
  (access) => {
    const endpoint = "https://odd'$(echo unwanted).example:54321/mcp";
    const scopes =
      access === "write"
        ? ["content:read", "content:write", "offline_access"]
        : ["content:read", "offline_access"];
    const examples = mcpConnectionExamples(endpoint, access);
    const args = execFileSync(
      "sh",
      ["-c", `claude() { printf '%s\\n' "$@"; }; ${examples.claudeCommand}`],
      { encoding: "utf8" },
    )
      .trimEnd()
      .split("\n");
    expect(args.slice(0, 4)).toEqual(["mcp", "add-json", "--scope", "user"]);
    expect(args[4]).toBe("lace");
    expect(args).toHaveLength(6);
    expect(JSON.parse(args[5]!)).toEqual({
      type: "http",
      url: endpoint,
      oauth: { scopes: scopes.join(" ") },
    });
    expect(JSON.parse(examples.geminiJson)).toEqual({
      mcpServers: { lace: { httpUrl: endpoint, oauth: { enabled: true, scopes } } },
    });
  },
);
