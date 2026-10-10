import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { renderInRouter, stubClient } from "../../../app/testing/index.js";
import { SendPasswordResetDialog } from "./index.js";

const account = {
  disabled: false,
  email: "eddie@lace.test",
  id: "editor-1",
  role: "editor" as const,
};
const link = `https://lace.test/admin/reset-password#token=${"C".repeat(43)}`;

test("a sent reset is announced and shows no link", async () => {
  const user = userEvent.setup();
  const sendPasswordReset = vi.fn(async () => ({ delivery: { status: "sent" as const } }));
  renderInRouter(<SendPasswordResetDialog account={account} />, {
    client: stubClient({ sendPasswordReset }),
    session: { id: "admin-1", role: "admin" },
  });
  await user.click(
    await screen.findByRole("button", { name: "Send password reset to eddie@lace.test" }),
  );
  const dialog = await screen.findByRole("dialog", { name: "Send password reset?" });
  await user.click(within(dialog).getByRole("button", { name: "Send reset link" }));
  expect(
    await screen.findByText("Password reset email sent to eddie@lace.test."),
  ).toBeInTheDocument();
  expect(sendPasswordReset).toHaveBeenCalledWith("editor-1");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.queryByTestId("once-shown-link")).not.toBeInTheDocument();
});

test("an unsent reset shows the link once until Done", async () => {
  const user = userEvent.setup();
  renderInRouter(<SendPasswordResetDialog account={account} />, {
    client: stubClient({
      sendPasswordReset: async () => ({
        delivery: { reason: "not_configured" as const, status: "failed" as const },
        link,
      }),
    }),
    session: { id: "admin-1", role: "admin" },
  });
  await user.click(
    await screen.findByRole("button", { name: "Send password reset to eddie@lace.test" }),
  );
  await user.click(screen.getByRole("button", { name: "Send reset link" }));
  const shown = await screen.findByRole("dialog", { name: "Share the reset link" });
  expect(shown).toHaveTextContent("Email delivery is not configured");
  expect(within(shown).getByTestId("once-shown-link")).toHaveTextContent(link);
  await user.click(within(shown).getByRole("button", { name: "Done" }));
  await waitFor(() => expect(document.body).not.toHaveTextContent(link));
});

test("cancelling sends nothing and returns focus to the trigger", async () => {
  const user = userEvent.setup();
  const sendPasswordReset = vi.fn();
  renderInRouter(<SendPasswordResetDialog account={account} />, {
    client: stubClient({ sendPasswordReset }),
  });
  const trigger = await screen.findByRole("button", {
    name: "Send password reset to eddie@lace.test",
  });
  await user.click(trigger);
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(sendPasswordReset).not.toHaveBeenCalled();
});
