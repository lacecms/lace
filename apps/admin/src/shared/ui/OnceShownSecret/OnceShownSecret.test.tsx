import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { Dialog, DialogContent, DialogTitle } from "../Dialog/index.js";
import { OnceShownSecret } from "./index.js";

function renderSecret(onOpenChange = vi.fn()) {
  render(
    <Dialog onOpenChange={onOpenChange} open>
      <DialogContent aria-describedby={undefined}>
        <DialogTitle>Copy the link</DialogTitle>
        <OnceShownSecret name="link" value="https://lace.test/once" valueTestId="secret" />
      </DialogContent>
    </Dialog>,
  );
  return onOpenChange;
}

test("shows the value once with copy feedback and a Done action", async () => {
  const user = userEvent.setup();
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  const onOpenChange = renderSecret();
  expect(screen.getByTestId("secret")).toHaveTextContent("https://lace.test/once");
  expect(screen.getByText(/cannot be shown again/u)).toBeInTheDocument();
  const copy = screen.getByRole("button", { name: "Copy link" });
  expect(copy).toHaveFocus();
  await user.click(copy);
  expect(writeText).toHaveBeenCalledWith("https://lace.test/once");
  expect(await screen.findByRole("status")).toHaveTextContent("Copied to the clipboard.");
  await user.click(screen.getByRole("button", { name: "Done" }));
  expect(onOpenChange).toHaveBeenCalledWith(false);
});

test("a failed copy explains how to copy manually", async () => {
  const user = userEvent.setup();
  const writeText = vi.fn().mockRejectedValue(new Error("denied"));
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  renderSecret();
  await user.click(screen.getByRole("button", { name: "Copy link" }));
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Copy failed. Select the link text and copy it manually.",
  );
});
