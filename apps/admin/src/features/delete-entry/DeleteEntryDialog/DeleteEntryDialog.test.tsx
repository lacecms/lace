import { act, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { useRef, useState } from "react";
import { expect, test, vi } from "vitest";
import { renderInRouter, stubClient } from "../../../app/testing/index.js";
import { AdminClientError, type AdminClient } from "../../../shared/api/index.js";
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

test("deletion submits only the current acknowledged impact after a refresh or conflict", async () => {
  const user = userEvent.setup();
  let receipt = "first";
  const linkSource = {
    entryId: "source",
    snapshotId: "published",
    modelKey: "posts",
    phase: "published" as const,
    locations: [
      { sourceKey: "$fields", area: "fields" as const, pointer: "/url", delivered: true },
    ],
  };
  const deleteEntry = vi
    .fn<AdminClient["deleteEntry"]>()
    .mockImplementationOnce(async () => {
      receipt = "third";
      throw new AdminClientError({
        code: "CONTENT_LINK_IMPACT_CHANGED",
        message: "The incoming links changed before deletion.",
        status: 409,
      });
    })
    .mockResolvedValueOnce(undefined);
  const { queryClient } = renderInRouter(<Harness published />, {
    client: stubClient({
      deleteEntry,
      linkImpact: async () => ({
        mode: "sources",
        sources: [{ ...linkSource, title: `Link source ${receipt}` }],
        hasPublishedUsages: true,
        receipt,
      }),
      referenceImpact: async () => ({
        mode: "sources",
        sources: [
          { ...linkSource, title: "Reference source", phase: "draft", snapshotId: "draft" },
        ],
        hasDraftUsages: true,
        hasPublishedBlockers: false,
        receipt: "references",
      }),
    }),
  });
  await user.click(await screen.findByRole("button", { name: "Open delete" }));
  const dialog = within(screen.getByRole("dialog"));
  const confirm = dialog.getByRole("button", { name: "Delete entry" });
  const title = dialog.getByRole("textbox", { name: "Type “First” to confirm" });
  const linkCheckbox = () => dialog.getByRole("checkbox", { name: /published links/ });
  await user.type(title, "First");
  await user.click(await dialog.findByRole("checkbox", { name: /published links/ }));
  const referenceCheckbox = await dialog.findByRole("checkbox", {
    name: /drafts will keep missing selections/,
  });
  await user.click(referenceCheckbox);
  expect(confirm).toBeEnabled();

  receipt = "second";
  await act(async () => queryClient.refetchQueries({ queryKey: ["admin", "link-impact"] }));
  expect(await dialog.findByRole("link", { name: "Link source second" })).toBeVisible();
  expect(linkCheckbox()).not.toBeChecked();
  expect(confirm).toBeDisabled();
  await user.click(title);
  await user.keyboard("{Enter}");
  expect(deleteEntry).not.toHaveBeenCalled();

  await user.click(linkCheckbox());
  await user.click(confirm);
  expect(await dialog.findByRole("alert")).toHaveTextContent("changed before deletion");
  expect(await dialog.findByRole("link", { name: "Link source third" })).toBeVisible();
  expect(deleteEntry).toHaveBeenCalledExactlyOnceWith(
    "entry-1",
    4,
    { receipt: "second", acknowledgePublishedLinks: true },
    { receipt: "references", acknowledgeDraftReferences: true },
  );
  expect(linkCheckbox()).not.toBeChecked();
  expect(confirm).toBeDisabled();
  expect(title).toHaveValue("First");
  expect(referenceCheckbox).toBeChecked();

  await user.click(linkCheckbox());
  await user.click(confirm);
  expect(deleteEntry).toHaveBeenNthCalledWith(
    2,
    "entry-1",
    4,
    { receipt: "third", acknowledgePublishedLinks: true },
    { receipt: "references", acknowledgeDraftReferences: true },
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});

test("separately reviews link and draft reference receipts and refreshes a new hard blocker", async () => {
  const user = userEvent.setup();
  let published = false;
  const deleteEntry = vi.fn(async () => {
    published = true;
    throw new AdminClientError({
      code: "CONTENT_REFERENCES_IN_USE",
      message: "A source has published this reference.",
      status: 409,
    });
  });
  const source = {
    entryId: "source",
    modelKey: "posts",
    title: "Source",
    snapshotId: "source-draft",
    phase: "draft" as const,
    locations: [
      { sourceKey: "$fields", area: "fields" as const, pointer: "/value", delivered: true },
    ],
    nextLocationsCursor: "more-locations",
  };
  renderInRouter(<Harness />, {
    client: stubClient({
      deleteEntry,
      linkImpact: async () => ({
        mode: "sources",
        hasPublishedUsages: true,
        receipt: "url-receipt",
        sources: [],
      }),
      referenceImpact: async (_id, query) => {
        const summary = {
          hasDraftUsages: true,
          hasPublishedBlockers: published,
          ...(published ? {} : { receipt: "reference-receipt" }),
        };
        if (query.locationsAfter)
          return {
            ...summary,
            mode: "locations",
            sourceEntryId: "source",
            snapshotId: source.snapshotId,
            locations: [{ ...source.locations[0]!, pointer: "/another" }],
          };
        return {
          ...summary,
          mode: "sources",
          sources: published
            ? [{ ...source, phase: "published", snapshotId: "new-publication" }]
            : query.after
              ? [{ ...source, title: "Second source", snapshotId: "second-draft" }]
              : [source],
          ...(!published && !query.after ? { nextCursor: "more-sources" } : {}),
        };
      },
    }),
  });
  await user.click(await screen.findByRole("button", { name: "Open delete" }));
  const dialog = within(screen.getByRole("dialog", { name: "Delete entry?" }));
  const confirm = dialog.getByRole("button", { name: "Delete entry" });
  await user.click(await dialog.findByRole("checkbox", { name: /published links/ }));
  expect(confirm).toBeDisabled();
  await user.click(await dialog.findByRole("button", { name: "More locations in Source" }));
  expect(await dialog.findByRole("link", { name: "Field /another" })).toBeVisible();
  await user.click(dialog.getByRole("button", { name: "More referring entries" }));
  expect(await dialog.findByText("Second source")).toBeVisible();
  await user.click(dialog.getByRole("checkbox", { name: /drafts will keep missing selections/ }));
  expect(confirm).toBeEnabled();
  await user.click(confirm);
  expect(deleteEntry).toHaveBeenCalledExactlyOnceWith(
    "entry-1",
    4,
    { receipt: "url-receipt", acknowledgePublishedLinks: true },
    { receipt: "reference-receipt", acknowledgeDraftReferences: true },
  );
  await dialog.findByText(/Published references block removal/);
  expect(dialog.getByRole("link", { name: "Field /value" })).toBeVisible();
  expect(confirm).toBeDisabled();
  expect(
    dialog.queryByRole("checkbox", { name: /drafts will keep missing selections/ }),
  ).toBeNull();
});
