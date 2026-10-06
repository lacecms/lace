import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, test } from "vitest";
import { BuildStatusBadge } from "./BuildStatusBadge.js";

test("the badge names the status and its info button opens and closes the explanation", async () => {
  const user = userEvent.setup();
  render(<BuildStatusBadge status="running" />);
  expect(screen.getByText("Running")).toBeInTheDocument();
  const trigger = screen.getByRole("button", { name: "About the Running status" });
  trigger.focus();
  await user.keyboard("{Enter}");
  const popover = await screen.findByRole("dialog", { name: "Running" });
  expect(popover).toHaveTextContent("tracking deadline");
  expect(popover).toHaveTextContent("Not yet confirmed");
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(trigger).toHaveFocus();
});
