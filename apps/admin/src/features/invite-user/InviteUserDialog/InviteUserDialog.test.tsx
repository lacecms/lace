import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { renderInRouter, stubClient } from "../../../app/testing/index.js";
import { AdminClientError, adminQueryKeys } from "../../../shared/api/index.js";
import { InviteUserDialog } from "./index.js";

const invitation = {
  createdAt: "2026-10-01T00:00:00.000Z",
  email: "new@lace.test",
  expiresAt: "2026-10-04T00:00:00.000Z",
  id: "invitation-1",
  invitedBy: "Ada Admin",
  role: "editor" as const,
  state: "pending" as const,
};
const link = `https://lace.test/admin/accept-invite#token=${"A".repeat(43)}`;

async function fillForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Invite user" }));
  const dialog = await screen.findByRole("dialog", { name: "Invite user" });
  await user.type(within(dialog).getByLabelText("Email"), "new@lace.test");
  await user.click(within(dialog).getByRole("combobox", { name: "Role" }));
  await user.click(await screen.findByRole("option", { name: "Editor" }));
  return dialog;
}

test("invites by email and role without a password and announces a sent email", async () => {
  const user = userEvent.setup();
  const createInvitation = vi.fn(async () => ({
    delivery: { status: "sent" as const },
    invitation,
  }));
  renderInRouter(<InviteUserDialog />, {
    client: stubClient({ createInvitation }),
    session: { id: "admin-1", role: "admin" },
  });
  const dialog = await fillForm(user);
  expect(within(dialog).queryByLabelText(/password/iu)).not.toBeInTheDocument();
  expect(within(dialog).getByRole("combobox", { name: "Role" })).toHaveAccessibleDescription(
    "Edits drafts and uploads media.",
  );
  await user.click(within(dialog).getByRole("button", { name: "Send invitation" }));
  await waitFor(() =>
    expect(createInvitation).toHaveBeenCalledWith({ email: "new@lace.test", role: "editor" }),
  );
  expect(await screen.findByText("Invitation sent to new@lace.test.")).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});

test("shows the accept link once when the email was not sent and drops it on Done", async () => {
  const user = userEvent.setup();
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  const { queryClient } = renderInRouter(<InviteUserDialog />, {
    client: stubClient({
      createInvitation: async () => ({
        delivery: { reason: "not_configured" as const, status: "failed" as const },
        invitation,
        link,
      }),
    }),
    session: { id: "admin-1", role: "admin" },
  });
  const dialog = await fillForm(user);
  await user.click(within(dialog).getByRole("button", { name: "Send invitation" }));
  const shown = await screen.findByRole("dialog", { name: "Share the invitation link" });
  expect(shown).toHaveTextContent("Email delivery is not configured");
  expect(within(shown).getByTestId("once-shown-link")).toHaveTextContent(link);
  expect(shown).toHaveTextContent("cannot be shown again");
  await user.click(within(shown).getByRole("button", { name: "Copy link" }));
  expect(writeText).toHaveBeenCalledWith(link);
  expect(await within(shown).findByText("Copied to the clipboard.")).toBeInTheDocument();
  const cached = JSON.stringify([
    queryClient
      .getMutationCache()
      .getAll()
      .map((mutation) => [mutation.state.data, mutation.state.variables]),
    queryClient.getQueryData(adminQueryKeys.invitations) ?? null,
  ]);
  expect(cached).not.toContain("#token=");

  await user.click(within(shown).getByRole("button", { name: "Done" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(document.body).not.toHaveTextContent(link);
  await user.click(screen.getByRole("button", { name: "Invite user" }));
  const reopened = await screen.findByRole("dialog", { name: "Invite user" });
  expect(within(reopened).getByLabelText("Email")).toHaveValue("");
  expect(document.body).not.toHaveTextContent(link);
});

test("a conflict keeps the dialog open with the entered values", async () => {
  const user = userEvent.setup();
  renderInRouter(<InviteUserDialog />, {
    client: stubClient({
      createInvitation: async () => {
        throw new AdminClientError({
          code: "CONFLICT",
          message: "The request conflicts with the current state.",
          status: 409,
        });
      },
    }),
    session: { id: "admin-1", role: "admin" },
  });
  const dialog = await fillForm(user);
  await user.click(within(dialog).getByRole("button", { name: "Send invitation" }));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent(
    "This address already has an account or a pending invitation.",
  );
  expect(within(dialog).getByLabelText("Email")).toHaveValue("new@lace.test");
  expect(within(dialog).getByRole("combobox", { name: "Role" })).toHaveTextContent("Editor");
});

test("cancelling sends nothing and returns focus to the trigger", async () => {
  const user = userEvent.setup();
  const createInvitation = vi.fn();
  renderInRouter(<InviteUserDialog />, { client: stubClient({ createInvitation }) });
  await user.click(await screen.findByRole("button", { name: "Invite user" }));
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Invite user" })).toHaveFocus());
  expect(createInvitation).not.toHaveBeenCalled();
});
