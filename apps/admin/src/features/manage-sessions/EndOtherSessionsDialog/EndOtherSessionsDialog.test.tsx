import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { renderInRouter, stubClient } from "../../../app/testing/index.js";
import { EndOtherSessionsDialog } from "./index.js";

test("ends every other session after confirmation and reports how many", async () => {
  const user = userEvent.setup();
  const revokeOtherSessions = vi.fn(async () => ({ revoked: 1 }));
  renderInRouter(<EndOtherSessionsDialog />, { client: stubClient({ revokeOtherSessions }) });
  await user.click(await screen.findByRole("button", { name: "Sign out all other sessions" }));
  const dialog = await screen.findByRole("dialog", { name: "Sign out all other sessions?" });
  expect(dialog).toHaveTextContent("This device stays signed in.");
  await user.click(within(dialog).getByRole("button", { name: "Sign out other sessions" }));
  expect(await screen.findByText("Signed out 1 other session.")).toBeInTheDocument();
  expect(revokeOtherSessions).toHaveBeenCalledOnce();
});

test("cancelling sends nothing and returns focus to the trigger", async () => {
  const user = userEvent.setup();
  const revokeOtherSessions = vi.fn();
  renderInRouter(<EndOtherSessionsDialog />, { client: stubClient({ revokeOtherSessions }) });
  const trigger = await screen.findByRole("button", { name: "Sign out all other sessions" });
  await user.click(trigger);
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(revokeOtherSessions).not.toHaveBeenCalled();
});
