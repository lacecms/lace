import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import {
  renderRoute,
  staticSessionSource,
  stubClient as client,
} from "../../../app/testing/index.js";
import { AdminClientError } from "../../../shared/api/index.js";

const admin = staticSessionSource({ id: "admin-1", role: "admin" });
const endpoint = "http://127.0.0.1:54321/mcp";
function status(enabled = true) {
  return {
    configuredModels: 1,
    email: { provider: "none" as const },
    engineVersion: "test",
    ready: true,
    mcp: { enabled, endpoint },
  };
}

test("MCP status stays visible when disabled and refreshes from server-confirmed values", async () => {
  let enabled = false;
  let fail = false;
  const load = vi.fn(async () => {
    if (fail) throw new Error("Status unavailable");
    return status(enabled);
  });
  renderRoute("/settings", admin, client({ loadSettingsStatus: load }));
  const card = await screen.findByRole("region", { name: "MCP" });
  await within(card).findByText("Disabled");
  expect(card).toHaveTextContent(endpoint);
  expect(card).toHaveTextContent("LACE_MCP_ENABLED=true");
  expect(within(card).queryByRole("link", { name: "Account" })).not.toBeInTheDocument();
  enabled = true;
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Refresh status" }));
  await within(card).findByText("Enabled");
  expect(within(card).getByRole("link", { name: "Account" })).toHaveAttribute(
    "href",
    "/admin/account",
  );
  fail = true;
  await user.click(screen.getByRole("button", { name: "Refresh status" }));
  await screen.findByText("Status is stale. Showing the last confirmed values.");
  expect(card).toHaveTextContent("Enabled");
});

test("unknown MCP configuration never becomes Disabled", async () => {
  let reject!: (error: Error) => void;
  renderRoute(
    "/settings",
    admin,
    client({
      loadSettingsStatus: () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    }),
  );
  const card = await screen.findByRole("region", { name: "MCP" });
  expect(card).toHaveTextContent("Loading MCP configuration");
  expect(within(card).queryByText("Disabled")).not.toBeInTheDocument();
  reject(new AdminClientError({ message: "Unavailable", status: 503 }));
  await within(card).findByText("Unavailable");
  expect(card).not.toHaveTextContent(endpoint);
});

test.each(["viewer", "editor"] as const)("%s cannot load MCP settings", async (role) => {
  const load = vi.fn(async () => status());
  renderRoute(
    "/settings",
    staticSessionSource({ id: "other", role }),
    client({ loadSettingsStatus: load }),
  );
  await screen.findByRole("region", { name: "Access denied" });
  expect(load).not.toHaveBeenCalled();
});

test("endpoint copy reports clipboard failure and leaves selectable text", async () => {
  const user = userEvent.setup();
  const write = vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));
  renderRoute("/settings", admin, client({ loadSettingsStatus: async () => status() }));
  await user.click(await screen.findByRole("button", { name: "Copy endpoint" }));
  await screen.findByText("Copy failed. Select the text and copy it manually.");
  expect(write).toHaveBeenCalledWith(endpoint);
  expect(screen.getByText(endpoint)).toBeInTheDocument();
  write.mockResolvedValue();
  await user.click(screen.getByRole("button", { name: "Copy endpoint" }));
  await waitFor(() => expect(screen.getByText("Copied to the clipboard.")).toBeInTheDocument());
});

test("connection examples use selected scopes, canonical endpoint and DCR without issuing requests", async () => {
  const user = userEvent.setup();
  const write = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
  const register = vi.spyOn(globalThis, "fetch");
  renderRoute("/settings", admin, client({ loadSettingsStatus: async () => status() }));
  const card = await screen.findByRole("region", { name: "MCP" });
  await within(card).findByRole("radio", { name: "Read only" });
  expect(within(card).getByRole("radio", { name: "Read only" })).toBeChecked();
  await user.click(within(card).getByRole("button", { name: "Copy Codex commands" }));
  expect(write).toHaveBeenLastCalledWith(
    `codex mcp add lace --url '${endpoint}'\ncodex mcp login lace --oauth-client-registration dcr --scopes content:read,offline_access`,
  );
  await user.click(within(card).getByRole("radio", { name: "Read and edit drafts" }));
  await user.click(within(card).getByRole("button", { name: "Copy Codex commands" }));
  expect(write.mock.lastCall?.[0]).toContain("content:read,content:write,offline_access");
  await user.click(within(card).getByRole("tab", { name: "Codex TOML" }));
  await user.click(within(card).getByRole("button", { name: "Copy TOML configuration" }));
  expect(write).toHaveBeenLastCalledWith(
    `[mcp_servers.lace]\nurl = "${endpoint}"\nscopes = ["content:read", "content:write", "offline_access"]`,
  );
  await user.click(within(card).getByRole("tab", { name: "Other clients" }));
  expect(card).toHaveTextContent("Streamable HTTP");
  expect(card).toHaveTextContent("PKCE");
  expect(card).toHaveTextContent("Publishing, unpublishing, and deletion are always unavailable");
  expect(register).not.toHaveBeenCalled();
});

test("Claude Code and Gemini CLI keep selected access, exact endpoint and separate sign-in instructions", async () => {
  const user = userEvent.setup();
  const write = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
  const fetch = vi.spyOn(globalThis, "fetch");
  renderRoute("/settings", admin, client({ loadSettingsStatus: async () => status() }));
  const card = await screen.findByRole("region", { name: "MCP" });
  await within(card).findByRole("tab", { name: "Claude Code" });
  for (const editing of [false, true]) {
    if (editing)
      await user.click(within(card).getByRole("radio", { name: "Read and edit drafts" }));
    const scopes = editing
      ? ["content:read", "content:write", "offline_access"]
      : ["content:read", "offline_access"];
    await user.click(within(card).getByRole("tab", { name: "Claude Code" }));
    await user.click(within(card).getByRole("button", { name: "Copy Claude Code command" }));
    expect(write.mock.lastCall?.[0]).toContain(`"url":"${endpoint}"`);
    expect(write.mock.lastCall?.[0]).toContain(`"scopes":"${scopes.join(" ")}"`);
    expect(card).toHaveTextContent("Inside Claude Code");
    expect(card).toHaveTextContent("it does not grant extra Lace permissions");
    await user.click(
      within(card).getByRole("button", { name: "Copy Claude Code sign-in command" }),
    );
    expect(write).toHaveBeenLastCalledWith("/mcp");
    await user.click(within(card).getByRole("tab", { name: "Gemini CLI" }));
    await user.click(within(card).getByRole("button", { name: "Copy Gemini CLI configuration" }));
    expect(JSON.parse(write.mock.lastCall![0])).toEqual({
      mcpServers: { lace: { httpUrl: endpoint, oauth: { enabled: true, scopes } } },
    });
    expect(card).toHaveTextContent("Inside an interactive Gemini CLI session");
    expect(card).toHaveTextContent("keep your other settings");
    await user.click(within(card).getByRole("button", { name: "Copy Gemini CLI sign-in command" }));
    expect(write).toHaveBeenLastCalledWith("/mcp auth lace");
    expect(
      within(card).getByRole("radio", {
        name: editing ? "Read and edit drafts" : "Read only",
      }),
    ).toBeChecked();
  }
  await user.click(within(card).getByRole("tab", { name: "Codex CLI" }));
  await user.click(within(card).getByRole("button", { name: "Copy Codex commands" }));
  expect(write.mock.lastCall?.[0]).toContain("content:read,content:write,offline_access");
  expect(fetch).not.toHaveBeenCalled();
});

test.each([
  ["Claude Code", "Copy Claude Code command"],
  ["Gemini CLI", "Copy Gemini CLI configuration"],
])("%s copy failure keeps setup text available", async (name, copyLabel) => {
  const user = userEvent.setup();
  const write = vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));
  renderRoute("/settings", admin, client({ loadSettingsStatus: async () => status() }));
  await user.click(await screen.findByRole("tab", { name }));
  await user.click(screen.getByRole("button", { name: copyLabel }));
  await screen.findByText("Copy failed. Select the text and copy it manually.");
  const panel = screen.getByRole("tabpanel", { name });
  expect(panel).toHaveTextContent(endpoint);
  expect(within(panel).queryByText("Copied to the clipboard.")).not.toBeInTheDocument();
  write.mockResolvedValue();
  await user.click(screen.getByRole("button", { name: copyLabel }));
  await within(panel).findByText("Copied to the clipboard.");
});
