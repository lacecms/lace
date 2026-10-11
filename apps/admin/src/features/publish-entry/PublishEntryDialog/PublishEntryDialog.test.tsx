import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { useState } from "react";
import { expect, test, vi } from "vitest";
import { buildDispatchDescription, publicationBuildDescription } from "../build-dispatch.js";
import { PublishEntryDialog } from "./index.js";

function Harness({ onConfirm, pending = false }: { onConfirm: () => void; pending?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <PublishEntryDialog
      disabled={false}
      onConfirm={onConfirm}
      onOpenChange={setOpen}
      open={open}
      pending={pending}
      publicPath="/posts/first-post"
      revision={4}
    />
  );
}

test("confirms publication only from the explained dialog", async () => {
  const user = userEvent.setup();
  const confirm = vi.fn();
  render(<Harness onConfirm={confirm} />);

  await user.click(screen.getByRole("button", { name: "Publish" }));
  const dialog = screen.getByRole("dialog", { name: "Publish this entry?" });
  expect(dialog).toHaveAccessibleDescription(
    "Draft revision 4 becomes the public version at /posts/first-post. A later draft save will not change it.",
  );
  expect(confirm).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Confirm publication" }));
  expect(confirm).toHaveBeenCalledTimes(1);
});

test("cancelling the dialog closes it without confirming", async () => {
  const user = userEvent.setup();
  const confirm = vi.fn();
  render(<Harness onConfirm={confirm} />);
  const trigger = screen.getByRole("button", { name: "Publish" });
  await user.click(trigger);
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
  expect(confirm).not.toHaveBeenCalled();
});

test("disables the trigger and describes build dispatch outcomes separately", () => {
  render(
    <PublishEntryDialog
      disabled
      onConfirm={() => undefined}
      onOpenChange={() => undefined}
      open={false}
      pending={false}
    />,
  );
  expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
  expect(buildDispatchDescription("queued")).toBe("Published. Build pending.");
  expect(buildDispatchDescription("not-dispatched")).toContain("no new build was requested");
});

test("offers save and publish when the draft has unsaved changes", async () => {
  const user = userEvent.setup();
  const confirm = vi.fn();
  function Unsaved() {
    const [open, setOpen] = useState(false);
    return (
      <PublishEntryDialog
        disabled={false}
        onConfirm={confirm}
        onOpenChange={setOpen}
        open={open}
        pending={false}
        publicPath="/posts/first-post"
        revision={4}
        unsavedChanges
      />
    );
  }
  render(<Unsaved />);
  await user.click(screen.getByRole("button", { name: "Save and publish" }));
  const dialog = screen.getByRole("dialog", { name: "Save and publish this entry?" });
  expect(dialog).toHaveAccessibleDescription(
    "Your unsaved changes are saved as a new draft revision, which then becomes the public version at /posts/first-post. If the draft cannot be saved, nothing is published.",
  );
  await user.click(within(dialog).getByRole("button", { name: "Save and publish" }));
  expect(confirm).toHaveBeenCalledTimes(1);
});

test("describes unpublication builds with their own wording", () => {
  expect(buildDispatchDescription("queued", "unpublished")).toBe("Unpublished. Build pending.");
  expect(buildDispatchDescription("not-dispatched", "unpublished")).toBe(
    "Unpublication was already accepted; no new build was requested.",
  );
  expect(publicationBuildDescription("running", 7, "Main site", "unpublished")).toBe(
    "Unpublished. Build for version 7 of Main site is running.",
  );
  expect(publicationBuildDescription("failed", 7)).toBe(
    "Published. Build for version 7 failed; the previous release stays served.",
  );
});
