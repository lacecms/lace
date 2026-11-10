import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { DiscardChangesDialog } from "./DiscardChangesDialog.js";

test("the discard prompt is a modal alert dialog that focuses Stay", async () => {
  const user = userEvent.setup();
  const onLeave = vi.fn();
  const onStay = vi.fn();
  render(<DiscardChangesDialog onLeave={onLeave} onStay={onStay} open />);
  const dialog = screen.getByRole("alertdialog", { name: "Discard unsaved changes?" });
  expect(dialog).toHaveAccessibleDescription("Your draft has not been saved.");
  expect(screen.getByRole("button", { name: "Stay" })).toHaveFocus();
  await user.click(screen.getByRole("button", { name: "Leave without saving" }));
  expect(onLeave).toHaveBeenCalledTimes(1);
  await user.keyboard("{Escape}");
  expect(onStay).toHaveBeenCalledTimes(1);
});
