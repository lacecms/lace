import { screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { renderInRouter } from "../../../app/testing/index.js";
import { UsersTable } from "./index.js";

test("marks the signed-in account and offers only the actions each row allows", async () => {
  renderInRouter(
    <UsersTable
      currentUserId="admin-1"
      users={[
        { disabled: false, email: "admin@lace.test", id: "admin-1", role: "admin" },
        { disabled: false, email: "editor@lace.test", id: "editor-1", role: "editor" },
        { disabled: true, email: "old@lace.test", id: "old-1", role: "viewer" },
      ]}
    />,
    { session: { id: "admin-1", role: "admin" } },
  );
  const table = await screen.findByRole("table", { name: "Users" });
  const [self, editor, disabled] = within(table).getAllByRole("row").slice(1);
  expect(self).toHaveTextContent("You");
  expect(
    within(self!)
      .getAllByRole("button")
      .map((button) => button.textContent),
  ).toEqual(["Change role"]);
  expect(within(editor!).getByRole("button", { name: "Disable editor@lace.test" })).toBeVisible();
  expect(
    within(editor!)
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-label")),
  ).toEqual([
    "Change role for editor@lace.test",
    "Send password reset to editor@lace.test",
    "Sign out editor@lace.test everywhere",
    "Disable editor@lace.test",
  ]);
  expect(editor).toHaveTextContent("Editor");
  expect(
    within(disabled!)
      .getAllByRole("button")
      .map((button) => button.textContent),
  ).toEqual(["Enable"]);
  expect(table).not.toHaveTextContent("editor-1");
});
