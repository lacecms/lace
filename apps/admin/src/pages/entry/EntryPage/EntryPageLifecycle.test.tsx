import type { AdminContentEntryDto } from "@lacecms/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import { userEvent, type UserEvent } from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import {
  draftEntry,
  entryList,
  renderRoute,
  stubClient as client,
  staticSessionSource,
} from "../../../app/testing/index.js";
import { AdminClientError, type AdminClient } from "../../../shared/api/index.js";

afterEach(() => {
  vi.restoreAllMocks();
});

const admin = staticSessionSource({ id: "admin-1", role: "admin" });
const editor = staticSessionSource({ id: "editor-1", role: "editor" });

const publishedEntry: AdminContentEntryDto = {
  ...draftEntry,
  draft: { ...draftEntry.draft, revision: 4, slug: "draft-path", title: "Draft title" },
  published: {
    ...draftEntry.draft,
    id: "published-1",
    revision: 3,
    slug: "published-path",
    state: "published",
    title: "Published title",
  },
};

async function openEntryAction(user: UserEvent, name: string) {
  // Radix opens menus on pointer down; the keyboard path is deterministic in jsdom.
  screen.getByRole("button", { name: "Entry actions" }).focus();
  await user.keyboard("{Enter}");
  await user.click(await screen.findByRole("menuitem", { name }));
}

async function typeTitle(user: UserEvent, title: string) {
  const input = screen.getByRole("textbox", { name: "Title" });
  await user.clear(input);
  if (title.length > 0) await user.type(input, title);
}

test("save and publish saves first and then publishes the saved revision", async () => {
  const user = userEvent.setup();
  const saveDraft = vi.fn<AdminClient["saveDraft"]>(async (_id, input) => ({
    ...draftEntry,
    draft: { ...draftEntry.draft, revision: 3, title: input.title },
  }));
  const publishEntry = vi.fn<AdminClient["publishEntry"]>(async () => ({
    build: { status: "queued", targetVersion: 1 },
    entry: {
      ...draftEntry,
      draft: { ...draftEntry.draft, revision: 3, title: "Saved and live" },
      published: {
        ...draftEntry.draft,
        id: "pub-3",
        revision: 3,
        state: "published",
        title: "Saved and live",
      },
    },
    publication: "published",
  }));
  renderRoute("/content/posts/entry-1", admin, client({ publishEntry, saveDraft }));
  await screen.findByRole("heading", { name: "Edit posts" });
  expect(screen.getByRole("button", { name: "Publish" })).toBeEnabled();
  await typeTitle(user, "Saved and live");
  await user.click(screen.getByRole("button", { name: "Save and publish" }));
  const dialog = screen.getByRole("dialog", { name: "Save and publish this entry?" });
  await user.click(within(dialog).getByRole("button", { name: "Save and publish" }));
  await waitFor(() => expect(publishEntry).toHaveBeenCalledTimes(1));
  expect(saveDraft).toHaveBeenCalledTimes(1);
  expect(saveDraft.mock.invocationCallOrder[0]!).toBeLessThan(
    publishEntry.mock.invocationCallOrder[0]!,
  );
  expect(publishEntry).toHaveBeenCalledWith(
    "entry-1",
    expect.objectContaining({ expectedRevision: 3, idempotencyKey: expect.any(String) }),
  );
  await waitFor(() =>
    expect(screen.getAllByRole("status")[0]).toHaveTextContent("Saved revision 3"),
  );
  expect(screen.getByRole("button", { name: "Publish" })).toBeInTheDocument();
}, 15_000);

test("local validation stops save and publish before any request", async () => {
  const user = userEvent.setup();
  const saveDraft = vi.fn();
  const publishEntry = vi.fn();
  renderRoute("/content/posts/entry-1", admin, client({ publishEntry, saveDraft }));
  await screen.findByRole("heading", { name: "Edit posts" });
  await typeTitle(user, "");
  await user.click(screen.getByRole("button", { name: "Save and publish" }));
  await user.click(
    within(screen.getByRole("dialog", { name: "Save and publish this entry?" })).getByRole(
      "button",
      { name: "Save and publish" },
    ),
  );
  const summary = await screen.findByRole("heading", { name: "There is 1 problem to fix" });
  await waitFor(() => expect(summary.closest("section")).toHaveFocus());
  expect(saveDraft).not.toHaveBeenCalled();
  expect(publishEntry).not.toHaveBeenCalled();
});

test("a rejected save publishes nothing and keeps the unsaved values", async () => {
  const user = userEvent.setup();
  const publishEntry = vi.fn();
  const saveDraft = vi.fn(async () => {
    throw new AdminClientError({
      code: "VALIDATION_FAILED",
      issues: [{ code: "invalid_value", message: "Too long", path: "/title" }],
      message: "Invalid request",
      status: 422,
    });
  });
  renderRoute("/content/posts/entry-1", admin, client({ publishEntry, saveDraft }));
  await screen.findByRole("heading", { name: "Edit posts" });
  await typeTitle(user, "Rejected title");
  await user.click(screen.getByRole("button", { name: "Save and publish" }));
  await user.click(
    within(screen.getByRole("dialog", { name: "Save and publish this entry?" })).getByRole(
      "button",
      { name: "Save and publish" },
    ),
  );
  await waitFor(() => expect(saveDraft).toHaveBeenCalledTimes(1));
  await waitFor(() =>
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveAttribute("aria-invalid", "true"),
  );
  expect(publishEntry).not.toHaveBeenCalled();
  expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("Rejected title");
});

test("unpublishing keeps unsaved values and follows the build", async () => {
  const user = userEvent.setup();
  const unpublishEntry = vi.fn<AdminClient["unpublishEntry"]>(async () => ({
    build: { status: "queued", targetVersion: 6 },
    entry: { ...publishedEntry, published: undefined } as unknown as AdminContentEntryDto,
    unpublication: "unpublished",
  }));
  renderRoute(
    "/content/posts/entry-1",
    admin,
    client({
      listBuilds: async () => ({ items: [] }),
      loadEntry: async () => publishedEntry,
      unpublishEntry,
    }),
  );
  await screen.findByRole("heading", { name: "Edit posts" });
  await typeTitle(user, "Unsaved title");
  await openEntryAction(user, "Unpublish");
  await user.click(
    within(await screen.findByRole("dialog", { name: "Unpublish this entry?" })).getByRole(
      "button",
      { name: "Unpublish" },
    ),
  );
  await waitFor(() =>
    expect(unpublishEntry).toHaveBeenCalledWith("entry-1", {
      expectedPublishedSnapshotId: "published-1",
      idempotencyKey: expect.any(String),
    }),
  );
  const region = screen.getByRole("region", { name: "Publication status" });
  await waitFor(() => expect(region).toHaveTextContent("LiveNot published"));
  expect(
    await within(region).findByText(/^Unpublished\. Build for version 6/u),
  ).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("Unsaved title");
  expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole("button", { name: "Entry actions" })).toHaveFocus());
});

test("reverting saved changes adopts the published version without publishing", async () => {
  const user = userEvent.setup();
  const publishEntry = vi.fn();
  const revertEntry = vi.fn<AdminClient["revertEntry"]>(async () => ({
    ...publishedEntry,
    draft: {
      ...publishedEntry.draft,
      revision: 5,
      slug: "published-path",
      title: "Published title",
    },
    published: { ...publishedEntry.published!, revision: 5 },
  }));
  renderRoute(
    "/content/posts/entry-1",
    editor,
    client({ loadEntry: async () => publishedEntry, publishEntry, revertEntry }),
  );
  await screen.findByRole("heading", { name: "Edit posts" });
  await waitFor(() =>
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("Draft title"),
  );
  await openEntryAction(user, "Revert to published");
  await user.click(
    within(await screen.findByRole("dialog", { name: "Revert to published?" })).getByRole(
      "button",
      { name: "Revert to published" },
    ),
  );
  await waitFor(() => expect(revertEntry).toHaveBeenCalledWith("entry-1", 4));
  await waitFor(() =>
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("Published title"),
  );
  expect(screen.getByRole("textbox", { name: "Slug" })).toHaveValue("published-path");
  expect(screen.getByRole("region", { name: "Publication status" })).toHaveTextContent(
    /^PublicationPublished/u,
  );
  expect(publishEntry).not.toHaveBeenCalled();
});

test("reverting only unsaved changes discards them locally", async () => {
  const user = userEvent.setup();
  const revertEntry = vi.fn();
  const inSync = {
    ...publishedEntry,
    draft: { ...publishedEntry.draft, revision: 3 },
  };
  renderRoute(
    "/content/posts/entry-1",
    editor,
    client({ loadEntry: async () => inSync, revertEntry }),
  );
  await screen.findByRole("heading", { name: "Edit posts" });
  await typeTitle(user, "Throwaway");
  await openEntryAction(user, "Revert to published");
  await user.click(
    within(await screen.findByRole("dialog", { name: "Revert to published?" })).getByRole(
      "button",
      { name: "Revert to published" },
    ),
  );
  await waitFor(() =>
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("Draft title"),
  );
  expect(revertEntry).not.toHaveBeenCalled();
  expect(screen.getByText(/^Saved revision 3/u)).toBeInTheDocument();
});

test("deleting a dirty draft returns to the list without the discard prompt", async () => {
  const user = userEvent.setup();
  const deleteEntry = vi.fn(async () => undefined);
  const router = renderRoute(
    "/content/posts/entry-1",
    editor,
    client({ deleteEntry, listEntries: async () => entryList([]) }),
  );
  await screen.findByRole("heading", { name: "Edit posts" });
  await typeTitle(user, "Unsaved title");
  await openEntryAction(user, "Delete");
  const dialog = await screen.findByRole("dialog", { name: "Delete entry?" });
  expect(within(dialog).queryByRole("textbox")).not.toBeInTheDocument();
  await user.click(within(dialog).getByRole("button", { name: "Delete entry" }));
  await waitFor(() => expect(router.state.location.pathname).toBe("/content/posts"));
  expect(deleteEntry).toHaveBeenCalledWith("entry-1", 2);
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByRole("heading", { level: 1, name: "posts" })).toHaveFocus(),
  );
  expect(await screen.findByText("Deleted “First post”.")).toBeInTheDocument();
});

test("duplicating opens the copy in the editor", async () => {
  const user = userEvent.setup();
  const copy = {
    ...draftEntry,
    draft: {
      ...draftEntry.draft,
      entryId: "entry-copy",
      id: "snapshot-copy",
      slug: undefined,
      title: "First post (copy)",
    },
    id: "entry-copy",
  } as AdminContentEntryDto;
  const duplicateEntry = vi.fn(async () => copy);
  const router = renderRoute(
    "/content/posts/entry-1",
    editor,
    client({
      duplicateEntry,
      loadEntry: async (id) => (id === "entry-copy" ? copy : draftEntry),
    }),
  );
  await screen.findByRole("heading", { name: "Edit posts" });
  await openEntryAction(user, "Duplicate");
  await waitFor(() => expect(router.state.location.pathname).toBe("/content/posts/entry-copy"));
  expect(duplicateEntry).toHaveBeenCalledWith("entry-1", 2);
  await waitFor(() =>
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("First post (copy)"),
  );
});

test("viewers see no entry actions menu", async () => {
  renderRoute(
    "/content/posts/entry-1",
    staticSessionSource({ id: "viewer-1", role: "viewer" }),
    client(),
  );
  await screen.findByRole("heading", { name: "Edit posts" });
  expect(screen.queryByRole("button", { name: "Entry actions" })).not.toBeInTheDocument();
});

test("saving a slugless collection entry sends no slug and ends clean", async () => {
  const user = userEvent.setup();
  const saveDraft = vi.fn<AdminClient["saveDraft"]>(async (_id, input) => ({
    ...draftEntry,
    draft: { ...draftEntry.draft, revision: 3, title: input.title },
  }));
  renderRoute("/content/posts/entry-1", editor, client({ saveDraft }));
  await screen.findByRole("heading", { name: "Edit posts" });
  await user.type(screen.getByRole("textbox", { name: "Title" }), " again");
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(saveDraft).toHaveBeenCalledTimes(1));
  expect(saveDraft.mock.calls[0]![1]).not.toHaveProperty("slug");
  await waitFor(() =>
    expect(screen.getAllByRole("status")[0]).toHaveTextContent("Saved revision 3"),
  );
});
