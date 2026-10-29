import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { renderInRouter, stubClient, staticSessionSource } from "../../../app/testing/index.js";
import { AdminClientError } from "../../../shared/api/index.js";
import { McpConnections } from "./index.js";
const connection = {
  id: "connection-1",
  clientName: "Assistant <script>",
  scopes: ["content:read" as const, "content:write" as const],
  createdAt: "2026-10-29T10:00:00.000Z",
  expiresAt: "2035-10-29T10:00:00.000Z",
  revokedAt: null,
};
test("disabled capability hides connections without querying their endpoint", async () => {
  const list = vi.fn(async () => ({ items: [], nextCursor: null }));
  const capabilities = vi.fn(async () => ({ mcpEnabled: false }));
  renderInRouter(<McpConnections />, {
    client: stubClient({ loadAccountCapabilities: capabilities, listMcpConnections: list }),
  });
  await waitFor(() => expect(capabilities).toHaveBeenCalled());
  expect(screen.queryByRole("heading", { name: "Assistant connections" })).not.toBeInTheDocument();
  expect(list).not.toHaveBeenCalled();
});
test.each(["admin", "editor", "viewer"] as const)(
  "%s can review safe connection details and cancel revocation",
  async (role) => {
    const user = userEvent.setup();
    const revoke = vi.fn(async () => undefined);
    renderInRouter(<McpConnections />, {
      sessionSource: staticSessionSource({ id: role, role }),
      client: stubClient({
        loadAccountCapabilities: async () => ({ mcpEnabled: true }),
        listMcpConnections: async () => ({ items: [connection], nextCursor: null }),
        revokeMcpConnection: revoke,
      }),
    });
    expect(await screen.findByText(connection.clientName)).toBeInTheDocument();
    expect(screen.getByText("Read and edit drafts")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: `Revoke ${connection.clientName}` }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("must reconnect with your approval");
    expect(revoke).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(revoke).not.toHaveBeenCalled();
  },
);
test("failed revocation stays reviewable and succeeds on explicit retry", async () => {
  const user = userEvent.setup();
  let revoked = false;
  const revoke = vi
    .fn()
    .mockRejectedValueOnce(new AdminClientError({ message: "Try again later." }))
    .mockImplementation(async () => {
      revoked = true;
    });
  renderInRouter(<McpConnections />, {
    client: stubClient({
      loadAccountCapabilities: async () => ({ mcpEnabled: true }),
      listMcpConnections: async () => ({
        items: [{ ...connection, revokedAt: revoked ? "2026-10-29T11:00:00.000Z" : null }],
        nextCursor: null,
      }),
      revokeMcpConnection: revoke,
    }),
  });
  await user.click(await screen.findByRole("button", { name: `Revoke ${connection.clientName}` }));
  await user.click(screen.getByRole("button", { name: "Revoke access" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Connection not revoked");
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Revoke access" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(revoke).toHaveBeenCalledTimes(2);
  expect(revoke).toHaveBeenLastCalledWith(connection.id);
  expect(await screen.findByText(/Read and edit drafts · Revoked/)).toBeInTheDocument();
});
