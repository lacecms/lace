import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { renderInRouter, stubClient } from "../../../app/testing/index.js";
import { AdminClientError } from "../../../shared/api/index.js";
import { UserAccessDialog } from "./index.js";

const editor = {
  disabled: false,
  email: "editor@lace.test",
  id: "editor-1",
  role: "editor" as const,
};

test("disables an active account after confirmation", async () => {
  const user = userEvent.setup();
  const updateUser = vi.fn(async () => ({ ...editor, disabled: true }));
  renderInRouter(<UserAccessDialog account={editor} />, { client: stubClient({ updateUser }) });
  await user.click(await screen.findByRole("button", { name: "Disable editor@lace.test" }));
  const dialog = await screen.findByRole("dialog", { name: "Disable user?" });
  await user.click(within(dialog).getByRole("button", { name: "Disable user" }));
  await waitFor(() => expect(updateUser).toHaveBeenCalledWith("editor-1", { disabled: true }));
  expect(await screen.findByText("Disabled editor@lace.test.")).toBeInTheDocument();
});

test("enables a disabled account after confirmation", async () => {
  const user = userEvent.setup();
  const updateUser = vi.fn(async () => editor);
  renderInRouter(<UserAccessDialog account={{ ...editor, disabled: true }} />, {
    client: stubClient({ updateUser }),
  });
  await user.click(await screen.findByRole("button", { name: "Enable editor@lace.test" }));
  const dialog = await screen.findByRole("dialog", { name: "Enable user?" });
  await user.click(within(dialog).getByRole("button", { name: "Enable user" }));
  await waitFor(() => expect(updateUser).toHaveBeenCalledWith("editor-1", { disabled: false }));
  expect(await screen.findByText("Enabled editor@lace.test.")).toBeInTheDocument();
});

test("keeps the dialog open on rejection and returns focus on cancel", async () => {
  const user = userEvent.setup();
  const updateUser = vi.fn(async () => {
    throw new AdminClientError({ code: "LAST_ADMIN_PROTECTED", message: "No.", status: 409 });
  });
  renderInRouter(<UserAccessDialog account={editor} />, { client: stubClient({ updateUser }) });
  const trigger = await screen.findByRole("button", { name: "Disable editor@lace.test" });
  await user.click(trigger);
  const dialog = await screen.findByRole("dialog", { name: "Disable user?" });
  await user.click(within(dialog).getByRole("button", { name: "Disable user" }));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent(
    "At least one active administrator with a password must remain.",
  );
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(updateUser).toHaveBeenCalledOnce();
});
