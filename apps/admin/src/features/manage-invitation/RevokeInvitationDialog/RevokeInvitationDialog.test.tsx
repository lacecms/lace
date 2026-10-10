import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { renderInRouter, stubClient } from "../../../app/testing/index.js";
import { AdminClientError } from "../../../shared/api/index.js";
import { RevokeInvitationDialog } from "./index.js";

const invitation = {
  createdAt: "2026-10-01T00:00:00.000Z",
  email: "new@lace.test",
  expiresAt: "2026-10-04T00:00:00.000Z",
  id: "invitation-1",
  invitedBy: "Ada Admin",
  role: "viewer" as const,
  state: "pending" as const,
};

test("revokes after confirmation and announces it", async () => {
  const user = userEvent.setup();
  const revokeInvitation = vi.fn(async () => undefined);
  renderInRouter(<RevokeInvitationDialog invitation={invitation} />, {
    client: stubClient({ revokeInvitation }),
    session: { id: "admin-1", role: "admin" },
  });
  await user.click(
    await screen.findByRole("button", { name: "Revoke invitation for new@lace.test" }),
  );
  const dialog = await screen.findByRole("dialog", { name: "Revoke invitation?" });
  await user.click(within(dialog).getByRole("button", { name: "Revoke invitation" }));
  expect(await screen.findByText("Revoked the invitation for new@lace.test.")).toBeInTheDocument();
  expect(revokeInvitation).toHaveBeenCalledWith("invitation-1");
});

test("a failure stays in the dialog", async () => {
  const user = userEvent.setup();
  renderInRouter(<RevokeInvitationDialog invitation={invitation} />, {
    client: stubClient({
      revokeInvitation: async () => {
        throw new AdminClientError({
          message: "The invitation was already accepted.",
          status: 409,
        });
      },
    }),
    session: { id: "admin-1", role: "admin" },
  });
  await user.click(
    await screen.findByRole("button", { name: "Revoke invitation for new@lace.test" }),
  );
  const dialog = await screen.findByRole("dialog", { name: "Revoke invitation?" });
  await user.click(within(dialog).getByRole("button", { name: "Revoke invitation" }));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent(
    "The invitation was already accepted.",
  );
});

test("cancelling sends nothing and returns focus to the trigger", async () => {
  const user = userEvent.setup();
  const revokeInvitation = vi.fn();
  renderInRouter(<RevokeInvitationDialog invitation={invitation} />, {
    client: stubClient({ revokeInvitation }),
  });
  const trigger = await screen.findByRole("button", {
    name: "Revoke invitation for new@lace.test",
  });
  await user.click(trigger);
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(revokeInvitation).not.toHaveBeenCalled();
});
