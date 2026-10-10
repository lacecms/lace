import { screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { renderInRouter, stubClient } from "../../../app/testing/index.js";
import { AdminClientError } from "../../../shared/api/index.js";
import { ChangePasswordForm } from "./index.js";

async function fill(user: ReturnType<typeof userEvent.setup>, confirmation = "new-password-123") {
  await user.type(await screen.findByLabelText("Current password"), "old-password");
  await user.type(screen.getByLabelText("New password"), "new-password-123");
  await user.type(screen.getByLabelText("Confirm new password"), confirmation);
}

test("signs out other sessions by default and announces the change", async () => {
  const user = userEvent.setup();
  const changePassword = vi.fn(async () => ({ revoked: 2 }));
  renderInRouter(<ChangePasswordForm />, { client: stubClient({ changePassword }) });
  const signOutOthers = await screen.findByRole("checkbox", { name: "Sign out other sessions" });
  expect(signOutOthers).toBeChecked();
  expect(screen.getByLabelText("New password")).toHaveAccessibleDescription(
    "At least 12 characters.",
  );
  await fill(user);
  await user.click(screen.getByRole("button", { name: "Change password" }));
  await waitFor(() =>
    expect(changePassword).toHaveBeenCalledWith({
      currentPassword: "old-password",
      newPassword: "new-password-123",
      signOutOtherSessions: true,
    }),
  );
  expect(
    await screen.findByText("Password changed. Signed out 2 other sessions."),
  ).toBeInTheDocument();
  expect(screen.getByLabelText("Current password")).toHaveValue("");
});

test("keeps other sessions when the option is cleared", async () => {
  const user = userEvent.setup();
  const changePassword = vi.fn(async () => ({ revoked: 0 }));
  renderInRouter(<ChangePasswordForm />, { client: stubClient({ changePassword }) });
  await fill(user);
  await user.click(screen.getByRole("checkbox", { name: "Sign out other sessions" }));
  await user.click(screen.getByRole("button", { name: "Change password" }));
  await waitFor(() =>
    expect(changePassword).toHaveBeenCalledWith(
      expect.objectContaining({ signOutOtherSessions: false }),
    ),
  );
  expect(await screen.findByText("Password changed.")).toBeInTheDocument();
});

test("a wrong current password stays in the form with the error", async () => {
  const user = userEvent.setup();
  renderInRouter(<ChangePasswordForm />, {
    client: stubClient({
      changePassword: async () => {
        throw new AdminClientError({
          code: "INVALID_CREDENTIALS",
          message: "The current password is incorrect.",
          status: 400,
        });
      },
    }),
  });
  await fill(user);
  await user.click(screen.getByRole("button", { name: "Change password" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("The current password is incorrect.");
  expect(screen.getByLabelText("New password")).toHaveValue("new-password-123");
});

test("mismatched new passwords send nothing", async () => {
  const user = userEvent.setup();
  const changePassword = vi.fn();
  renderInRouter(<ChangePasswordForm />, { client: stubClient({ changePassword }) });
  await fill(user, "different-password");
  await user.click(screen.getByRole("button", { name: "Change password" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("The new passwords do not match.");
  expect(screen.getByLabelText("Confirm new password")).toHaveAttribute("aria-invalid", "true");
  expect(changePassword).not.toHaveBeenCalled();
});
