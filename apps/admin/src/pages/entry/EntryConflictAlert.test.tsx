import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { EntryConflictAlert } from "./EntryConflictAlert.js";

test("the conflict alert offers reload and copy and reports their failures", async () => {
  const user = userEvent.setup();
  const onCopy = vi.fn();
  const onReload = vi.fn();
  render(
    <EntryConflictAlert
      conflict="save"
      copyError="Could not copy local JSON."
      onCopy={onCopy}
      onReload={onReload}
      reloadError="The Lace API could not be reached."
      reloading={false}
    />,
  );
  const alert = screen.getByRole("alert", { name: "Draft changed elsewhere" });
  expect(alert).toHaveTextContent("Your local save values are still available.");
  await user.click(screen.getByRole("button", { name: "Reload server draft" }));
  await user.click(screen.getByRole("button", { name: "Copy my JSON" }));
  expect(onReload).toHaveBeenCalledTimes(1);
  expect(onCopy).toHaveBeenCalledTimes(1);
  expect(screen.getByText("Could not copy local JSON.")).toHaveAttribute("role", "alert");
  expect(screen.getByText("The Lace API could not be reached.")).toHaveAttribute("role", "alert");
});
