import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { useRef, useState } from "react";
import { expect, test, vi } from "vitest";
import { renderInRouter, stubClient } from "../../../app/testing/index.js";
import { AdminClientError } from "../../../shared/api/index.js";
import { DeleteEntryDialog } from "./index.js";

function Harness({
  onDeleted,
  published = false,
}: {
  readonly onDeleted?: () => void;
  readonly published?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button onClick={() => setOpen(true)} ref={trigger} type="button">
        Open delete
      </button>
      <DeleteEntryDialog
        entryId="entry-1"
        expectedRevision={4}
        modelKey="posts"
        onOpenChange={setOpen}
        open={open}
        published={published}
        returnFocus={trigger}
        title="First"
        {...(onDeleted === undefined ? {} : { onDeleted })}
      />
    </>
  );
}

test("deletes a draft-only entry after one confirmation and keeps failures visible", async () => {
  const user = userEvent.setup();
  const onDeleted = vi.fn();
  const deleteEntry = vi
    .fn()
    .mockRejectedValueOnce(new AdminClientError({ message: "Draft changed.", status: 409 }))
    .mockResolvedValueOnce(undefined);
  renderInRouter(<Harness onDeleted={onDeleted} />, { client: stubClient({ deleteEntry }) });

  await user.click(await screen.findByRole("button", { name: "Open delete" }));
  const dialog = screen.getByRole("dialog", { name: "Delete entry?" });
  expect(dialog).toHaveAccessibleDescription(
    "“First” will be permanently deleted. This cannot be undone.",
  );
  expect(within(dialog).queryByRole("textbox")).not.toBeInTheDocument();
  expect(deleteEntry).not.toHaveBeenCalled();
  await user.click(within(dialog).getByRole("button", { name: "Delete entry" }));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("Draft changed.");
  expect(onDeleted).not.toHaveBeenCalled();
  await user.click(within(dialog).getByRole("button", { name: "Delete entry" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(deleteEntry).toHaveBeenCalledWith("entry-1", 4, {
    receipt: "receipt",
    acknowledgePublishedLinks: true,
  });
  await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
});

test("a published entry is deleted only after its saved title is typed exactly", async () => {
  const user = userEvent.setup();
  const deleteEntry = vi.fn(async () => undefined);
  renderInRouter(<Harness published />, { client: stubClient({ deleteEntry }) });

  await user.click(await screen.findByRole("button", { name: "Open delete" }));
  const dialog = screen.getByRole("dialog", { name: "Delete entry?" });
  expect(dialog).toHaveAccessibleDescription(
    "“First” will be permanently deleted and its page disappears from the site after the next build. This cannot be undone.",
  );
  const confirm = within(dialog).getByRole("button", { name: "Delete entry" });
  const input = within(dialog).getByRole("textbox", { name: "Type “First” to confirm" });
  expect(confirm).toBeDisabled();
  await user.type(input, "first");
  expect(confirm).toBeDisabled();
  await user.keyboard("{Enter}");
  expect(deleteEntry).not.toHaveBeenCalled();
  await user.clear(input);
  await user.type(input, "First");
  expect(confirm).toBeEnabled();
  await user.click(confirm);
  await waitFor(() =>
    expect(deleteEntry).toHaveBeenCalledWith("entry-1", 4, {
      receipt: "receipt",
      acknowledgePublishedLinks: true,
    }),
  );
});

test("cancelling sends no request, clears the typed title, and returns focus to the opener", async () => {
  const user = userEvent.setup();
  const deleteEntry = vi.fn(async () => undefined);
  renderInRouter(<Harness published />, { client: stubClient({ deleteEntry }) });

  const opener = await screen.findByRole("button", { name: "Open delete" });
  await user.click(opener);
  await user.type(screen.getByRole("textbox", { name: "Type “First” to confirm" }), "First");
  await user.click(
    within(screen.getByRole("dialog", { name: "Delete entry?" })).getByRole("button", {
      name: "Cancel",
    }),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(opener).toHaveFocus();
  expect(deleteEntry).not.toHaveBeenCalled();
  await user.click(opener);
  expect(screen.getByRole("textbox", { name: "Type “First” to confirm" })).toHaveValue("");
});
