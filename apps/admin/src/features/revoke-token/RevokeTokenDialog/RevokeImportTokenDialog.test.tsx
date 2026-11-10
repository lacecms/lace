import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { renderInRouter, stubClient } from "../../../app/testing/index.js";
import { AdminClientError, adminQueryKeys } from "../../../shared/api/index.js";
import { RevokeTokenDialog } from "./index.js";

const token = {
  capabilities: ["content:import"] as ["content:import"],
  createdAt: "2026-10-31T10:00:00.000Z",
  createdBy: { email: "admin@lace.test", id: "admin-1" },
  expiresAt: "2026-11-01T10:00:00.000Z",
  id: "import-1",
  name: "Framer import",
  tokenPrefix: "abcdefgh",
};

test("revokes after confirmation naming the token and its effect", async () => {
  const user = userEvent.setup();
  const revokeImportToken = vi.fn(async () => ({
    ...token,
    revokedAt: "2026-10-31T11:00:00.000Z",
  }));
  renderInRouter(<RevokeTokenDialog kind="import" token={token} />, {
    client: stubClient({ revokeImportToken }),
  });
  await user.click(await screen.findByRole("button", { name: "Revoke Framer import" }));
  const dialog = await screen.findByRole("dialog", { name: "Revoke import token?" });
  expect(dialog).toHaveTextContent("Imports using “Framer import” stop");
  await user.click(within(dialog).getByRole("button", { name: "Revoke token" }));
  await waitFor(() => expect(revokeImportToken).toHaveBeenCalledWith("import-1"));
  expect(await screen.findByText("Revoked Framer import.")).toBeInTheDocument();
});

test("keeps a failed revocation in the dialog and cancels without a request", async () => {
  const user = userEvent.setup();
  const revokeImportToken = vi.fn(async () => {
    throw new AdminClientError({ message: "Revocation failed.", requestId: "req-9" });
  });
  renderInRouter(<RevokeTokenDialog kind="import" token={token} />, {
    client: stubClient({ revokeImportToken }),
  });
  const trigger = await screen.findByRole("button", { name: "Revoke Framer import" });
  await user.click(trigger);
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(revokeImportToken).not.toHaveBeenCalled();
  await user.click(trigger);
  const dialog = await screen.findByRole("dialog", { name: "Revoke import token?" });
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
  const { queryClient } = renderInRouter(<RevokeTokenDialog kind="import" token={token} />, {
    client: stubClient({ revokeImportToken: mutation }),
  });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  await user.click(await screen.findByRole("button", { name: `Revoke ${token.name}` }));
  await user.click(screen.getByRole("button", { name: "Revoke token" }));
  expect(await screen.findByRole("button", { name: "Revoking…" })).toBeDisabled();
  pending.resolve({ ...token, revokedAt: "2026-11-01T11:00:00.000Z" });
  await waitFor(() =>
    expect(invalidate).toHaveBeenCalledWith({ queryKey: adminQueryKeys.importTokens }),
  );
});
