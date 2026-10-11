import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { useRef, useState } from "react";
import { expect, test, vi } from "vitest";
import { renderInRouter, stubClient } from "../../../app/testing/index.js";
import { AdminClientError } from "../../../shared/api/index.js";
import { RevertEntryDialog } from "./index.js";

function Harness({
  onDiscardUnsaved = () => undefined,
  onReverted = () => undefined,
  savedChanges,
  unsavedChanges,
}: {
  readonly onDiscardUnsaved?: () => void;
  readonly onReverted?: () => void;
  readonly savedChanges: boolean;
  readonly unsavedChanges: boolean;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button onClick={() => setOpen(true)} ref={trigger} type="button">
        Open revert
      </button>
      <RevertEntryDialog
        entryId="entry-1"
        expectedRevision={5}
        onDiscardUnsaved={onDiscardUnsaved}
        onOpenChange={setOpen}
        onReverted={onReverted}
        open={open}
        returnFocus={trigger}
        savedChanges={savedChanges}
        unsavedChanges={unsavedChanges}
      />
    </>
  );
}

test("lists both losses and reverts saved changes through the API", async () => {
  const user = userEvent.setup();
  const reverted = { id: "entry-1" } as never;
  const onReverted = vi.fn();
  const revertEntry = vi
    .fn()
    .mockRejectedValueOnce(
      new AdminClientError({
        code: "CONTENT_REVISION_CONFLICT",
        message: "Draft changed.",
        status: 409,
      }),
    )
    .mockResolvedValueOnce(reverted);
  renderInRouter(<Harness onReverted={onReverted} savedChanges unsavedChanges />, {
    client: stubClient({ revertEntry }),
  });
  await user.click(await screen.findByRole("button", { name: "Open revert" }));
  const dialog = screen.getByRole("dialog", { name: "Revert to published?" });
  expect(
    within(dialog)
      .getAllByRole("listitem")
      .map((item) => item.textContent),
  ).toEqual(["The saved draft changes since the last publication", "Your unsaved changes"]);
  await user.click(within(dialog).getByRole("button", { name: "Revert to published" }));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("Draft changed.");
  expect(onReverted).not.toHaveBeenCalled();
  await user.click(within(dialog).getByRole("button", { name: "Revert to published" }));
  await waitFor(() => expect(onReverted).toHaveBeenCalledWith(reverted));
  expect(revertEntry).toHaveBeenCalledWith("entry-1", 5);
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});

test("only unsaved changes are discarded locally without a request", async () => {
  const user = userEvent.setup();
  const onDiscardUnsaved = vi.fn();
  const revertEntry = vi.fn();
  renderInRouter(
    <Harness onDiscardUnsaved={onDiscardUnsaved} savedChanges={false} unsavedChanges />,
    { client: stubClient({ revertEntry }) },
  );
  await user.click(await screen.findByRole("button", { name: "Open revert" }));
  const dialog = screen.getByRole("dialog", { name: "Revert to published?" });
  expect(
    within(dialog)
      .getAllByRole("listitem")
      .map((item) => item.textContent),
  ).toEqual(["Your unsaved changes"]);
  await user.click(within(dialog).getByRole("button", { name: "Revert to published" }));
  expect(onDiscardUnsaved).toHaveBeenCalledTimes(1);
  expect(revertEntry).not.toHaveBeenCalled();
});

test("cancelling sends nothing and returns focus to the opener", async () => {
  const user = userEvent.setup();
  const revertEntry = vi.fn();
  renderInRouter(<Harness savedChanges unsavedChanges={false} />, {
    client: stubClient({ revertEntry }),
  });
  const opener = await screen.findByRole("button", { name: "Open revert" });
  await user.click(opener);
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(opener).toHaveFocus();
  expect(revertEntry).not.toHaveBeenCalled();
});
