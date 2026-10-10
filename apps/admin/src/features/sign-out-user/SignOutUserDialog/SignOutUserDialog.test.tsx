import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { renderInRouter, stubClient } from "../../../app/testing/index.js";
import { AdminClientError } from "../../../shared/api/index.js";
import { SignOutUserDialog } from "./index.js";

const account = {
  disabled: false,
  email: "eddie@lace.test",
  id: "editor-1",
  role: "editor" as const,
};

test("signs a user out everywhere and names the user and the ended sessions", async () => {
  const user = userEvent.setup();
  const signOutUser = vi.fn(async () => ({ revoked: 2 }));
  renderInRouter(<SignOutUserDialog account={account} />, {
    client: stubClient({ signOutUser }),
    session: { id: "admin-1", role: "admin" },
  });
  await user.click(
    await screen.findByRole("button", { name: "Sign out eddie@lace.test everywhere" }),
  );
  const dialog = await screen.findByRole("dialog", { name: "Sign out everywhere?" });
  await user.click(within(dialog).getByRole("button", { name: "Sign out everywhere" }));
  expect(
    await screen.findByText("Signed out eddie@lace.test everywhere. Ended 2 sessions."),
  ).toBeInTheDocument();
  expect(signOutUser).toHaveBeenCalledWith("editor-1");
});

test("a failure stays in the dialog", async () => {
  const user = userEvent.setup();
  renderInRouter(<SignOutUserDialog account={account} />, {
    client: stubClient({
      signOutUser: async () => {
        throw new AdminClientError({
          message: "The requested resource was not found.",
          status: 404,
        });
      },
    }),
    session: { id: "admin-1", role: "admin" },
  });
  await user.click(
    await screen.findByRole("button", { name: "Sign out eddie@lace.test everywhere" }),
  );
  const dialog = await screen.findByRole("dialog", { name: "Sign out everywhere?" });
  await user.click(within(dialog).getByRole("button", { name: "Sign out everywhere" }));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("was not found");
});

test("cancelling sends nothing and returns focus to the trigger", async () => {
  const user = userEvent.setup();
  const signOutUser = vi.fn();
  renderInRouter(<SignOutUserDialog account={account} />, { client: stubClient({ signOutUser }) });
  const trigger = await screen.findByRole("button", {
    name: "Sign out eddie@lace.test everywhere",
  });
  await user.click(trigger);
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(signOutUser).not.toHaveBeenCalled();
});
