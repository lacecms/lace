import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { renderInRouter, stubClient, sessionFor } from "../../../app/testing/index.js";
import { AdminClientError } from "../../../shared/api/index.js";
import { ChangeRoleDialog } from "./index.js";

const editor = {
  disabled: false,
  email: "editor@lace.test",
  id: "editor-1",
  role: "editor" as const,
};
const admin = { disabled: false, email: "admin@lace.test", id: "admin-1", role: "admin" as const };

async function pickRole(user: ReturnType<typeof userEvent.setup>, email: string, role: string) {
  await user.click(await screen.findByRole("button", { name: `Change role for ${email}` }));
  const dialog = await screen.findByRole("dialog", { name: "Change role" });
  expect(within(dialog).getByRole("button", { name: "Save role" })).toBeDisabled();
  await user.click(within(dialog).getByRole("combobox", { name: "Role" }));
  await user.click(await screen.findByRole("option", { name: role }));
  return dialog;
}

test("saves only a different role and announces it", async () => {
  const user = userEvent.setup();
  const updateUser = vi.fn(async () => ({ ...editor, role: "viewer" as const }));
  renderInRouter(<ChangeRoleDialog account={editor} isSelf={false} />, {
    client: stubClient({ updateUser }),
    session: { id: "admin-1", role: "admin" },
  });
  const dialog = await pickRole(user, "editor@lace.test", "Viewer");
  expect(within(dialog).queryByRole("note")).not.toBeInTheDocument();
  await user.click(within(dialog).getByRole("button", { name: "Save role" }));
  await waitFor(() => expect(updateUser).toHaveBeenCalledWith("editor-1", { role: "viewer" }));
  expect(await screen.findByText("editor@lace.test is now Viewer.")).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("keeps the dialog open with the final-administrator explanation", async () => {
  const user = userEvent.setup();
  renderInRouter(<ChangeRoleDialog account={admin} isSelf />, {
    client: stubClient({
      updateUser: async () => {
        throw new AdminClientError({
          code: "LAST_ADMIN_PROTECTED",
          message: "Last administrator cannot be changed.",
          status: 409,
        });
      },
    }),
    session: { id: "admin-1", role: "admin" },
  });
  const dialog = await pickRole(user, "admin@lace.test", "Editor");
  expect(within(dialog).getByRole("note")).toHaveTextContent(
    "You will lose access to Users and Settings.",
  );
  await user.click(within(dialog).getByRole("button", { name: "Save role" }));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent(
    "The final active administrator cannot be disabled or demoted.",
  );
  expect(screen.getByRole("dialog", { name: "Change role" })).toBeInTheDocument();
});

test("re-reads the session after a confirmed self-demotion", async () => {
  const user = userEvent.setup();
  const invalidate = vi.fn();
  renderInRouter(<ChangeRoleDialog account={admin} isSelf />, {
    client: stubClient({ updateUser: async () => ({ ...admin, role: "editor" as const }) }),
    session: { id: "admin-1", role: "admin" },
    sessionSource: { get: async () => sessionFor({ id: "admin-1", role: "editor" }), invalidate },
  });
  const dialog = await pickRole(user, "admin@lace.test", "Editor");
  await user.click(within(dialog).getByRole("button", { name: "Save role" }));
  await waitFor(() => expect(invalidate).toHaveBeenCalled());
});
