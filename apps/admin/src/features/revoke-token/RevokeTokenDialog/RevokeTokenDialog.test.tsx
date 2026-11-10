import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { renderInRouter, stubClient } from "../../../app/testing/index.js";
import { AdminClientError, adminQueryKeys } from "../../../shared/api/index.js";
import { RevokeTokenDialog } from "./index.js";

const token = {
  capabilities: ["content:build:read"] as ["content:build:read"],
  createdAt: "2026-09-27T10:00:00.000Z",
  id: "token-1",
  name: "production site",
  tokenPrefix: "lace_bt_abcd",
};

test("revokes after confirmation and announces the token", async () => {
  const user = userEvent.setup();
  const revokeToken = vi.fn(async () => ({ ...token, revokedAt: "2026-09-27T11:00:00.000Z" }));
  renderInRouter(<RevokeTokenDialog kind="build" token={token} />, {
    client: stubClient({ revokeToken }),
  });
  await user.click(await screen.findByRole("button", { name: "Revoke production site" }));
  const dialog = await screen.findByRole("dialog", { name: "Revoke build token?" });
  expect(dialog).toHaveTextContent("production site");
  await user.click(within(dialog).getByRole("button", { name: "Revoke token" }));
  await waitFor(() => expect(revokeToken).toHaveBeenCalledWith("token-1"));
  expect(await screen.findByText("Revoked production site.")).toBeInTheDocument();
});

test("shows a failed revocation in the dialog and cancels without a request", async () => {
  const user = userEvent.setup();
  const revokeToken = vi.fn(async () => {
    throw new AdminClientError({ message: "Revocation failed.", requestId: "req-3" });
  });
  renderInRouter(<RevokeTokenDialog kind="build" token={token} />, {
    client: stubClient({ revokeToken }),
  });
  const trigger = await screen.findByRole("button", { name: "Revoke production site" });
  await user.click(trigger);
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(revokeToken).not.toHaveBeenCalled();
  await user.click(trigger);
  const dialog = await screen.findByRole("dialog", { name: "Revoke build token?" });
  await user.click(within(dialog).getByRole("button", { name: "Revoke token" }));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("Revocation failed.");
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  await user.click(trigger);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("keeps the action pending and invalidates the matching token list", async () => {
  const user = userEvent.setup();
  const pending = Promise.withResolvers<typeof token & { revokedAt: string }>();
  const mutation = vi.fn(() => pending.promise);
  const { queryClient } = renderInRouter(<RevokeTokenDialog kind="build" token={token} />, {
    client: stubClient({ revokeToken: mutation }),
  });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  await user.click(await screen.findByRole("button", { name: `Revoke ${token.name}` }));
  await user.click(screen.getByRole("button", { name: "Revoke token" }));
  expect(await screen.findByRole("button", { name: "Revoking…" })).toBeDisabled();
  pending.resolve({ ...token, revokedAt: "2026-11-01T11:00:00.000Z" });
  await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: adminQueryKeys.tokens }));
});
