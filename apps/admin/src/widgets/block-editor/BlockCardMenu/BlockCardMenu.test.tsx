import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { BlockCardMenu } from "./index.js";

test("menu respects move boundaries and invokes duplicate after closing", async () => {
  const duplicate = vi.fn();
  const user = userEvent.setup();
  render(
    <BlockCardMenu
      busy={false}
      hiddenOnSite={false}
      index={0}
      label="Text"
      onDuplicate={duplicate}
      onHiddenChange={() => {}}
      onMove={() => {}}
      onRemove={() => {}}
      readOnly={false}
      total={1}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Actions for Text block" }));
  expect(screen.getByRole("menuitem", { name: "Move up" })).toHaveAttribute("data-disabled");
  await user.click(screen.getByRole("menuitem", { name: "Duplicate" }));
  expect(duplicate).toHaveBeenCalledOnce();
});

test("a pending operation disables the menu trigger", () => {
  const props = {
    hiddenOnSite: false,
    index: 0,
    label: "Text",
    onDuplicate: () => {},
    onHiddenChange: () => {},
    onMove: () => {},
    onRemove: () => {},
    readOnly: false,
    total: 1,
  };
  const { rerender } = render(<BlockCardMenu {...props} busy={false} />);
  expect(screen.getByRole("button", { name: "Actions for Text block" })).toBeEnabled();
  rerender(<BlockCardMenu {...props} busy />);
  expect(screen.getByRole("button", { name: "Actions for Text block" })).toBeDisabled();
});
