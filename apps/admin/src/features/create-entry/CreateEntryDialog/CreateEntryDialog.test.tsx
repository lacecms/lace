import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import {
  entry,
  entryList,
  renderInRouter,
  renderRoute,
  stubClient as client,
  staticSessionSource,
} from "../../../app/testing/index.js";
import { AdminClientError, type EntryListQuery } from "../../../shared/api/index.js";
import { CreateEntryDialog } from "./index.js";

afterEach(() => {
  vi.restoreAllMocks();
});

test("entry creation and confirmed deletion refresh the active collection list", async () => {
  const user = userEvent.setup();
  const createEntry = vi.fn(async () => ({}) as never);
  const deleteEntry = vi.fn(async () => undefined);
  const listEntries = vi.fn(async (_modelKey: string, _cursor?: string, _query?: EntryListQuery) =>
    entryList([entry]),
  );
  // The collection list pages without a limit; the shell overview asks for one entry.
  const listCalls = () =>
    listEntries.mock.calls.filter(
      ([key, , query]) => key === "posts" && query?.limit === undefined,
    );
  const overviewCalls = () =>
    listEntries.mock.calls.filter(([key, , query]) => key === "posts" && query?.limit === 1);
  renderRoute(
    "/content/posts",
    staticSessionSource({ id: "editor-1", role: "editor" }),
    client({ createEntry, deleteEntry, listEntries }),
  );
  await screen.findByRole("table", { name: "posts entries" });
  await waitFor(() => expect(overviewCalls()).toHaveLength(1));

  await user.click(screen.getByRole("button", { name: "Create entry" }));
  const createDialog = screen.getByRole("dialog", { name: "Create entry" });
  await user.type(within(createDialog).getByLabelText("Title"), "New post");
  await user.click(within(createDialog).getByRole("button", { name: "Create entry" }));
  await waitFor(() => expect(createEntry).toHaveBeenCalledWith("posts", "New post"));
  await waitFor(() => expect(listCalls()).toHaveLength(2));
  await waitFor(() => expect(overviewCalls()).toHaveLength(2));

  await user.click(screen.getByRole("button", { name: "Delete First post" }));
  const deleteDialog = screen.getByRole("dialog", { name: "Delete entry?" });
  await user.click(within(deleteDialog).getByRole("button", { name: "Delete entry" }));
  await waitFor(() => expect(deleteEntry).toHaveBeenCalledWith("entry-1", 2));
});

test("requires a non-blank title, keeps failures in the dialog, and resets on cancel", async () => {
  const user = userEvent.setup();
  const createEntry = vi
    .fn()
    .mockRejectedValueOnce(new AdminClientError({ message: "Model not synchronized." }));
  renderInRouter(<CreateEntryDialog collectionLabel="Posts" modelKey="posts" />, {
    client: client({ createEntry }),
  });

  await user.click(await screen.findByRole("button", { name: "Create entry" }));
  const dialog = screen.getByRole("dialog", { name: "Create entry" });
  expect(dialog).toHaveAccessibleDescription(
    "Add a draft to Posts. You can set its slug and fields in the editor.",
  );
  const title = within(dialog).getByLabelText("Title");
  expect(title).toHaveFocus();
  const submit = within(dialog).getByRole("button", { name: "Create entry" });
  expect(submit).toBeDisabled();
  await user.type(title, "   ");
  expect(submit).toBeDisabled();

  await user.clear(title);
  await user.type(title, "  Launch  ");
  await user.click(submit);
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("Model not synchronized.");
  expect(createEntry).toHaveBeenCalledWith("posts", "Launch");

  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  await user.click(screen.getByRole("button", { name: "Create entry" }));
  const reopened = screen.getByRole("dialog", { name: "Create entry" });
  expect(within(reopened).getByLabelText("Title")).toHaveValue("");
  expect(within(reopened).queryByRole("alert")).not.toBeInTheDocument();
  expect(createEntry).toHaveBeenCalledTimes(1);
});
