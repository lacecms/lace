import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { renderInRouter, stubClient } from "../../../app/testing/index.js";
import { AdminClientError } from "../../../shared/api/index.js";
import { ResendInvitationButton } from "./index.js";

const invitation = {
  createdAt: "2026-10-01T00:00:00.000Z",
  email: "new@lace.test",
  expiresAt: "2026-10-04T00:00:00.000Z",
  id: "invitation-1",
  invitedBy: "Ada Admin",
  role: "editor" as const,
  state: "expired" as const,
};
const link = `https://lace.test/admin/accept-invite#token=${"B".repeat(43)}`;

test("a sent resend is announced without showing a link", async () => {
  const user = userEvent.setup();
  const resendInvitation = vi.fn(async () => ({
    delivery: { status: "sent" as const },
    invitation: { ...invitation, state: "pending" as const },
  }));
  renderInRouter(<ResendInvitationButton invitation={invitation} />, {
    client: stubClient({ resendInvitation }),
    session: { id: "admin-1", role: "admin" },
  });
  await user.click(
    await screen.findByRole("button", { name: "Resend invitation to new@lace.test" }),
  );
  expect(await screen.findByText("Invitation resent to new@lace.test.")).toBeInTheDocument();
  expect(resendInvitation).toHaveBeenCalledWith("invitation-1");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("an unsent resend shows the new link once and returns focus on Done", async () => {
  const user = userEvent.setup();
  renderInRouter(<ResendInvitationButton invitation={invitation} />, {
    client: stubClient({
      resendInvitation: async () => ({
        delivery: { reason: "unavailable" as const, status: "failed" as const },
        invitation,
        link,
      }),
    }),
    session: { id: "admin-1", role: "admin" },
  });
  const opener = await screen.findByRole("button", { name: "Resend invitation to new@lace.test" });
  await user.click(opener);
  const dialog = await screen.findByRole("dialog", { name: "Share the invitation link" });
  expect(dialog).toHaveTextContent("The email provider could not be reached");
  expect(within(dialog).getByTestId("once-shown-link")).toHaveTextContent(link);
  await user.click(within(dialog).getByRole("button", { name: "Done" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(document.body).not.toHaveTextContent(link);
  expect(opener).toHaveFocus();
});

test("a failed resend is announced with the error", async () => {
  const user = userEvent.setup();
  renderInRouter(<ResendInvitationButton invitation={invitation} />, {
    client: stubClient({
      resendInvitation: async () => {
        throw new AdminClientError({ message: "Too many requests were received.", status: 429 });
      },
    }),
    session: { id: "admin-1", role: "admin" },
  });
  await user.click(
    await screen.findByRole("button", { name: "Resend invitation to new@lace.test" }),
  );
  expect(
    await screen.findByText(
      "Invitation to new@lace.test not resent. Too many requests were received.",
    ),
  ).toBeInTheDocument();
});
