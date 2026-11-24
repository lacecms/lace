import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { useRef, useState } from "react";
import { expect, test, vi } from "vitest";
import { renderInRouter, stubClient } from "../../../app/testing/index.js";
import { AdminClientError, type AdminClient } from "../../../shared/api/index.js";
import { UnpublishEntryDialog } from "./index.js";

function Harness({
  kind = "collection",
  onReload = () => undefined,
  onUnpublished = () => undefined,
  routeLess = false,
}: {
  readonly kind?: "collection" | "global" | "page";
  readonly routeLess?: boolean;
  readonly onReload?: () => void;
  readonly onUnpublished?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button onClick={() => setOpen(true)} ref={trigger} type="button">
        Open unpublish
      </button>
      <UnpublishEntryDialog
        entryId="entry-1"
        expectedPublishedSnapshotId="published-1"
        model={{ kind, route: kind === "collection" && !routeLess ? "/posts/:slug" : undefined }}
        onOpenChange={setOpen}
        onReload={onReload}
        onUnpublished={onUnpublished}
        open={open}
        publicPath={
          kind === "global" || routeLess ? undefined : kind === "page" ? "/about" : "/posts/first"
        }
        returnFocus={trigger}
      />
    </>
  );
}

const result = { build: { status: "queued" }, entry: {}, unpublication: "unpublished" } as never;

test("states the public consequence for collection entries and pages", async () => {
  const user = userEvent.setup();
  renderInRouter(<Harness />, { client: stubClient() });
  await user.click(await screen.findByRole("button", { name: "Open unpublish" }));
  expect(screen.getByRole("dialog", { name: "Unpublish this entry?" })).toHaveAccessibleDescription(
    "Its public path /posts/first stops working after the next site build. The draft and any unsaved changes are kept; publishing again makes the current draft public.",
  );
  cleanup();
  renderInRouter(<Harness kind="page" />, { client: stubClient() });
  await user.click(await screen.findByRole("button", { name: "Open unpublish" }));
  expect(screen.getByRole("dialog", { name: "Unpublish this page?" })).toHaveAccessibleDescription(
    /The page's fixed path \/about will return 404 after the next site build\./u,
  );
  cleanup();
  renderInRouter(<Harness kind="global" />, { client: stubClient() });
  await user.click(await screen.findByRole("button", { name: "Open unpublish" }));
  expect(
    screen.getByRole("dialog", { name: "Unpublish this site content?" }),
  ).toHaveAccessibleDescription(
    /Pages that show this content fall back to their defaults after the next site build\./u,
  );
});

test("cancelling sends nothing and returns focus to the opener", async () => {
  const user = userEvent.setup();
  const unpublishEntry = vi.fn();
  renderInRouter(<Harness />, { client: stubClient({ unpublishEntry }) });
  const opener = await screen.findByRole("button", { name: "Open unpublish" });
  await user.click(opener);
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(opener).toHaveFocus();
  expect(unpublishEntry).not.toHaveBeenCalled();
});

test("a network retry reuses the idempotency key and a terminal response retires it", async () => {
  const user = userEvent.setup();
  const onUnpublished = vi.fn();
  const unpublishEntry = vi
    .fn<AdminClient["unpublishEntry"]>()
    .mockRejectedValueOnce(new AdminClientError({ message: "The Lace API could not be reached." }))
    .mockResolvedValueOnce(result)
    .mockResolvedValueOnce(result);
  renderInRouter(<Harness onUnpublished={onUnpublished} />, {
    client: stubClient({ unpublishEntry }),
  });
  await user.click(await screen.findByRole("button", { name: "Open unpublish" }));
  const dialog = screen.getByRole("dialog", { name: "Unpublish this entry?" });
  await user.click(within(dialog).getByRole("button", { name: "Unpublish" }));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("could not be reached");
  await user.click(within(dialog).getByRole("button", { name: "Retry previous unpublish" }));
  await waitFor(() => expect(onUnpublished).toHaveBeenCalledWith(result));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  await user.click(screen.getByRole("button", { name: "Open unpublish" }));
  await user.click(screen.getByRole("button", { name: "Unpublish" }));
  await waitFor(() => expect(unpublishEntry).toHaveBeenCalledTimes(3));
  const [first, second, third] = unpublishEntry.mock.calls.map(([, input]) => input);
  expect(first).toEqual({
    expectedPublishedSnapshotId: "published-1",
    idempotencyKey: expect.any(String),
    linkImpact: { receipt: "receipt", acknowledgePublishedLinks: true },
  });
  expect(second).toEqual(first);
  expect(third?.idempotencyKey).not.toBe(first?.idempotencyKey);
});

test("a changed review needs new consent while an uncertain unpublish retries its original input", async () => {
  const user = userEvent.setup();
  let receipt = "first";
  const unpublishEntry = vi
    .fn<AdminClient["unpublishEntry"]>()
    .mockRejectedValueOnce(new AdminClientError({ message: "The Lace API could not be reached." }))
    .mockImplementationOnce(async () => {
      receipt = "fourth";
      throw new AdminClientError({
        code: "CONTENT_LINK_IMPACT_CHANGED",
        message: "The incoming impact has changed.",
        status: 409,
      });
    })
    .mockResolvedValueOnce(result);
  const { queryClient } = renderInRouter(<Harness />, {
    client: stubClient({
      unpublishEntry,
      linkImpact: async () => ({
        mode: "sources",
        sources: [
          {
            entryId: "source",
            snapshotId: "published",
            modelKey: "posts",
            title: `Link source ${receipt}`,
            phase: "published",
            locations: [{ sourceKey: "$fields", area: "fields", pointer: "/url", delivered: true }],
          },
        ],
        hasPublishedUsages: true,
        receipt,
      }),
    }),
  });
  const refresh = () =>
    act(async () => queryClient.refetchQueries({ queryKey: ["admin", "link-impact"] }));
  await user.click(await screen.findByRole("button", { name: "Open unpublish" }));
  const dialog = within(screen.getByRole("dialog"));
  const confirm = () => dialog.getByRole("button", { name: "Unpublish" });
  const checkbox = () => dialog.getByRole("checkbox", { name: /published links/ });
  await user.click(await dialog.findByRole("checkbox", { name: /published links/ }));
  expect(confirm()).toBeEnabled();

  receipt = "second";
  await refresh();
  expect(await dialog.findByRole("link", { name: "Link source second" })).toBeVisible();
  expect(checkbox()).not.toBeChecked();
  expect(confirm()).toBeDisabled();
  expect(unpublishEntry).not.toHaveBeenCalled();

  await user.click(checkbox());
  await user.click(confirm());
  expect(await dialog.findByRole("alert")).toHaveTextContent("could not be reached");
  const original = unpublishEntry.mock.calls[0]!;
  expect(original).toEqual([
    "entry-1",
    {
      expectedPublishedSnapshotId: "published-1",
      idempotencyKey: expect.any(String),
      linkImpact: { receipt: "second", acknowledgePublishedLinks: true },
    },
  ]);

  receipt = "third";
  await refresh();
  expect(await dialog.findByRole("link", { name: "Link source third" })).toBeVisible();
  expect(checkbox()).not.toBeChecked();
  expect(dialog.queryByRole("button", { name: "Unpublish" })).not.toBeInTheDocument();
  await user.click(dialog.getByRole("button", { name: "Retry previous unpublish" }));
  expect(unpublishEntry).toHaveBeenNthCalledWith(2, ...original);

  expect(await dialog.findByRole("link", { name: "Link source fourth" })).toBeVisible();
  expect(checkbox()).not.toBeChecked();
  expect(confirm()).toBeDisabled();
  await user.click(checkbox());
  await user.click(confirm());
  expect(unpublishEntry).toHaveBeenNthCalledWith(3, "entry-1", {
    expectedPublishedSnapshotId: "published-1",
    idempotencyKey: expect.any(String),
    linkImpact: { receipt: "fourth", acknowledgePublishedLinks: true },
  });
  expect(unpublishEntry.mock.calls[2]?.[1].idempotencyKey).not.toBe(original[1].idempotencyKey);
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});

test("a stale publication keeps the dialog open with the error and offers a reload", async () => {
  const user = userEvent.setup();
  const onReload = vi.fn();
  const unpublishEntry = vi.fn(async () => {
    throw new AdminClientError({
      code: "CONTENT_REVISION_CONFLICT",
      message: "The entry changed.",
      status: 409,
    });
  });
  renderInRouter(<Harness onReload={onReload} />, { client: stubClient({ unpublishEntry }) });
  await user.click(await screen.findByRole("button", { name: "Open unpublish" }));
  const dialog = screen.getByRole("dialog", { name: "Unpublish this entry?" });
  await user.click(within(dialog).getByRole("button", { name: "Unpublish" }));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("The entry changed.");
  expect(within(dialog).getByRole("button", { name: "Unpublish" })).toBeDisabled();
  await user.click(within(dialog).getByRole("button", { name: "Reload entry" }));
  expect(onReload).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});

test("states that a route-less entry leaves the pages that list it", async () => {
  const user = userEvent.setup();
  renderInRouter(<Harness routeLess />, { client: stubClient() });
  await user.click(await screen.findByRole("button", { name: "Open unpublish" }));
  expect(screen.getByRole("dialog", { name: "Unpublish this entry?" })).toHaveAccessibleDescription(
    "The entry disappears from the pages that list it after the next site build. The draft and any unsaved changes are kept; publishing again makes the current draft public.",
  );
});
