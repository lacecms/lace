import { screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { renderInRouter, stubClient } from "../../../app/testing/index.js";
import { McpConsentForm } from "./index.js";
const transaction = "d7df3dd2-e3b3-4f42-a88d-f8c421628fab";
const details = {
  transaction,
  clientName: "<img src=private> Assistant",
  callbackHostname: "client.test",
  scopes: ["content:read", "content:write", "offline_access"] as const,
  canWrite: true,
};
test("consent escapes client identity, explains restrictions and submits keyboard-selected access", async () => {
  const user = userEvent.setup();
  const submit = vi.fn(() => new Promise<never>(() => {}));
  renderInRouter(<McpConsentForm transaction={transaction} />, {
    client: stubClient({
      loadMcpConsent: async () => ({ ...details, scopes: [...details.scopes] }),
      submitMcpConsent: submit,
    }),
  });
  expect(await screen.findByText(details.clientName)).toBeInTheDocument();
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(screen.getByText(/Publishing, unpublishing, deleting/)).toBeInTheDocument();
  const write = screen.getByRole("radio", { name: /Read and edit drafts/ });
  write.focus();
  await user.keyboard(" ");
  expect(write).toBeChecked();
  await user.click(screen.getByRole("button", { name: "Allow access" }));
  expect(submit).toHaveBeenCalledWith({
    transaction,
    accept: true,
    scope: "content:read content:write offline_access",
  });
  expect(screen.getByRole("button", { name: "Continuing…" })).toBeDisabled();
});
test("viewer can deny but cannot select draft writes", async () => {
  const user = userEvent.setup();
  const submit = vi.fn(() => new Promise<never>(() => {}));
  renderInRouter(<McpConsentForm transaction={transaction} />, {
    client: stubClient({
      loadMcpConsent: async () => ({ ...details, scopes: [...details.scopes], canWrite: false }),
      submitMcpConsent: submit,
    }),
  });
  expect(await screen.findByRole("radio", { name: /Read and edit drafts/ })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Deny" }));
  expect(submit).toHaveBeenCalledWith({
    transaction,
    accept: false,
    scope: "content:read offline_access",
  });
});
test("expired request shows a safe restart instruction without approval controls", async () => {
  renderInRouter(<McpConsentForm transaction={transaction} />, {
    client: stubClient({
      loadMcpConsent: async () => {
        throw new Error("private-token");
      },
    }),
  });
  expect(await screen.findByRole("alert")).toHaveTextContent("Start a new connection");
  expect(screen.queryByRole("button", { name: "Allow access" })).not.toBeInTheDocument();
  expect(document.body.textContent).not.toContain("private-token");
});
