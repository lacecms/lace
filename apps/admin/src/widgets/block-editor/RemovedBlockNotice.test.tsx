import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { RemovedBlockNotice } from "./RemovedBlockNotice.js";

test("names the removed block, focuses Undo, and offers Dismiss", async () => {
  const user = userEvent.setup();
  const onDismiss = vi.fn();
  const onUndo = vi.fn();
  render(<RemovedBlockNotice label="Hero" onDismiss={onDismiss} onUndo={onUndo} />);
  expect(screen.getByRole("status")).toHaveTextContent("Removed Hero block.");
  expect(screen.getByRole("button", { name: "Undo" })).toHaveFocus();
  await user.keyboard("{Enter}");
  expect(onUndo).toHaveBeenCalledOnce();
  await user.click(screen.getByRole("button", { name: "Dismiss" }));
  expect(onDismiss).toHaveBeenCalledOnce();
});
