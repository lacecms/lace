import { field } from "@lacecms/content";
import type { AdminContentEntryDto, ContentModelDto } from "@lacecms/contracts";
import { focusManager, QueryClient } from "@tanstack/react-query";
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import {
  draftEntry,
  models,
  renderRoute,
  staticSessionSource,
  stubClient,
} from "../../../app/testing/index.js";
import { AdminClientError, adminQueryKeys, type AdminClient } from "../../../shared/api/index.js";

const initial: AdminContentEntryDto = {
  ...draftEntry,
  draft: { ...draftEntry.draft, fields: { summary: "Original summary" }, revision: 4 },
};
const model: ContentModelDto = {
  ...models.items[1]!,
  fields: { summary: { required: false, type: "text" } },
};
const entryKey = adminQueryKeys.entry(initial.id);

const blockType = "scores";
const blockKey = "01ARZ3NDEKTSV4RRFFQ69G5FA1";
const nextBlockKey = "01ARZ3NDEKTSV4RRFFQ69G5FA2";
const blockModel: ContentModelDto = {
  ...model,
  blocks: [blockType],
  blockDefinitions: [
    {
      fields: { numbers: field.list({ label: "Numbers", item: field.number() }) },
      label: "Scores",
      type: blockType,
      version: 1,
    },
  ],
};
const blockEntry: AdminContentEntryDto = {
  ...initial,
  draft: {
    ...initial.draft,
    blocks: [
      {
        data: { numbers: [15, 20] },
        hidden: false,
        key: blockKey,
        position: 1000,
        schemaVersion: 1,
        settings: {},
        type: blockType,
      },
      {
        data: {},
        hidden: false,
        key: nextBlockKey,
        position: 2000,
        schemaVersion: 1,
        settings: {},
        type: blockType,
      },
    ],
  },
};

function revisionedEntry() {
  let entry = initial;
  const loadEntry = vi.fn<AdminClient["loadEntry"]>(async () => entry);
  const saveDraft = vi.fn<AdminClient["saveDraft"]>(async (_id, input) => {
    if (input.expectedRevision !== entry.draft.revision)
      throw new AdminClientError({
        code: "CONTENT_REVISION_CONFLICT",
        message: "Changed elsewhere.",
        status: 409,
      });
    const summary = input.fields.summary;
    if (typeof summary !== "string") throw new Error("The test draft requires a summary.");
    entry = {
      ...entry,
      draft: {
        ...entry.draft,
        blocks: [...input.blocks],
        fields: { summary },
        revision: entry.draft.revision + 1,
        title: input.title,
      },
    };
    return entry;
  });
  const client = (overrides: Partial<AdminClient> = {}) =>
    stubClient({
      listModels: async () => ({
        items: [model],
        listQueryLimits: { maxSearchLength: 200, maxLikePatternBytes: null },
      }),
      loadEntry,
      saveDraft,
      ...overrides,
    });
  return { client, loadEntry, saveDraft };
}

async function returnFocus() {
  await act(async () => focusManager.setFocused(false));
  await act(async () => focusManager.setFocused(true));
}

afterEach(() => {
  cleanup();
  focusManager.setFocused(undefined);
});

test("returning to a dirty editor preserves its draft after another editor saves", async () => {
  const user = userEvent.setup();
  const server = revisionedEntry();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  renderRoute(
    "/content/posts/entry-1",
    staticSessionSource({ id: "editor-1", role: "editor" }),
    server.client(),
    { queryClient },
  );
  const title = await screen.findByRole("textbox", { name: "Title" });
  await user.clear(title);
  await user.type(title, "My unsaved title");

  // Each tab needs its own document for form IDs and associated labels.
  const frame = document.body.appendChild(document.createElement("iframe"));
  const tab = frame.contentDocument!;
  const otherUser = userEvent.setup({ document: tab });
  try {
    renderRoute(
      "/content/posts/entry-1",
      staticSessionSource({ id: "editor-2", role: "editor" }),
      server.client(),
      { container: tab.body },
    );
    const other = within(tab.body);
    const otherTitle = await other.findByRole("textbox", { name: "Title" });
    await otherUser.clear(otherTitle);
    await otherUser.type(otherTitle, "Other editor's title");
    await otherUser.clear(other.getByRole("textbox", { name: "Summary" }));
    await otherUser.type(other.getByRole("textbox", { name: "Summary" }), "Other editor's summary");
    await otherUser.click(other.getByRole("button", { name: "Save draft" }));
    expect(await other.findByText("Saved revision 5")).toBeInTheDocument();

    await returnFocus();
    await waitFor(() =>
      expect(queryClient.getQueryData<AdminContentEntryDto>(entryKey)?.draft).toMatchObject({
        fields: { summary: "Other editor's summary" },
        revision: 5,
        title: "Other editor's title",
      }),
    );
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("My unsaved title");
    expect(screen.getByRole("textbox", { name: "Summary" })).toHaveValue("Original summary");
    expect(
      within(screen.getByRole("region", { name: "Publication status" })).getByText("Revision 4"),
    ).toBeInTheDocument();
    expect(within(screen.getByRole("banner")).getByText("Unsaved changes")).toBeInTheDocument();
  } finally {
    cleanup();
    frame.remove();
  }
});

test.each([
  ["viewer", false],
  ["editor", false],
  ["editor", true],
] as const)(
  "a clean %s adopts a newer draft on focus (saved before: %s)",
  async (role, savedBefore) => {
    const user = userEvent.setup();
    const server = revisionedEntry();
    renderRoute(
      "/content/posts/entry-1",
      staticSessionSource({ id: "editor-1", role }),
      server.client(),
    );
    const title = await screen.findByRole("textbox", { name: "Title" });
    const header = within(screen.getByRole("banner"));
    const publication = within(screen.getByRole("region", { name: "Publication status" }));
    const save = () => header.getByRole("button", { name: "Save draft" });

    if (savedBefore) {
      await user.type(title, " updated locally");
      await user.click(save());
      expect(await header.findByText("Saved revision 5")).toBeInTheDocument();
    }
    const externalRevision = savedBefore ? 6 : 5;
    await server.saveDraft(initial.id, {
      blocks: [],
      expectedRevision: externalRevision - 1,
      fields: { summary: "Refreshed summary" },
      title: "Refreshed title",
    });
    await returnFocus();
    expect(await publication.findByText(`Revision ${externalRevision}`)).toBeInTheDocument();
    expect(title).toHaveValue("Refreshed title");
    expect(screen.getByRole("textbox", { name: "Summary" })).toHaveValue("Refreshed summary");
    expect(
      screen.queryByRole("alert", { name: "Draft changed elsewhere" }),
    ).not.toBeInTheDocument();

    if (role === "viewer") {
      expect(title).toBeDisabled();
      expect(header.getByText("View only")).toBeInTheDocument();
      expect(header.queryByRole("button", { name: "Save draft" })).not.toBeInTheDocument();
    } else {
      expect(save()).toBeDisabled();
      expect(header.getByText(`Saved revision ${externalRevision}`)).toBeInTheDocument();
      await user.type(title, " edited");
      await user.click(save());
      await waitFor(() =>
        expect(server.saveDraft).toHaveBeenLastCalledWith(
          initial.id,
          expect.objectContaining({
            expectedRevision: externalRevision,
            title: "Refreshed title edited",
          }),
        ),
      );
    }
  },
);

test("unfinished numeric input in a block survives refresh and a failed read", async () => {
  const user = userEvent.setup();
  const writeText = vi.spyOn(navigator.clipboard, "writeText");
  const newer = {
    ...blockEntry,
    draft: { ...blockEntry.draft, revision: 5, title: "Updated elsewhere" },
  };
  const loadEntry = vi
    .fn<AdminClient["loadEntry"]>()
    .mockResolvedValueOnce(blockEntry)
    .mockResolvedValueOnce(newer)
    .mockRejectedValueOnce(new AdminClientError({ message: "Could not refresh the draft." }));
  const saveDraft = vi.fn<AdminClient["saveDraft"]>();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  renderRoute(
    "/content/posts/entry-1",
    staticSessionSource({ id: "editor-1", role: "editor" }),
    stubClient({
      listModels: async () => ({
        items: [blockModel],
        listQueryLimits: { maxSearchLength: 200, maxLikePatternBytes: null },
      }),
      loadEntry,
      saveDraft,
    }),
    { queryClient },
  );
  const input = await screen.findByRole("spinbutton", { name: "Numbers item 1" });
  await user.clear(input);
  expect(input).toHaveAccessibleDescription("Enter a value or remove this item.");
  expect(screen.getByText("Unsaved changes")).toBeInTheDocument();

  await returnFocus();
  await waitFor(() => expect(queryClient.getQueryData(entryKey)).toEqual(newer));
  expect(screen.getByRole("spinbutton", { name: "Numbers item 1" })).toBe(input);
  expect(input).toHaveValue(null);
  expect(input).toHaveAccessibleDescription("Enter a value or remove this item.");
  expect(screen.getByRole("spinbutton", { name: "Numbers item 2" })).toHaveValue(20);
  expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
  const alert = await screen.findByRole("alert", { name: "Draft changed elsewhere" });
  await user.click(within(alert).getByRole("button", { name: "Copy my JSON" }));
  expect(writeText).toHaveBeenCalledOnce();
  const copied = JSON.parse(writeText.mock.calls[0]![0]);
  expect(copied).toEqual({
    title: "First post",
    fields: { summary: "Original summary" },
    blocks: blockEntry.draft.blocks,
  });
  expect(alert).toBeInTheDocument();
  expect(input).toHaveValue(null);
  expect(input).toHaveAccessibleDescription("Enter a value or remove this item.");
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  expect(
    await screen.findByRole("heading", { name: "There is 1 problem to fix" }),
  ).toBeInTheDocument();
  expect(saveDraft).not.toHaveBeenCalled();

  await returnFocus();
  expect(await screen.findByText("Could not refresh the draft.")).toBeInTheDocument();
  expect(input).toHaveValue(null);
  expect(input).toHaveAccessibleDescription("Enter a value or remove this item.");
  await user.click(
    within(screen.getByRole("complementary", { name: "Admin navigation" })).getByRole("link", {
      name: "Content",
    }),
  );
  const discard = await screen.findByRole("alertdialog", { name: "Discard unsaved changes?" });
  await user.click(within(discard).getByRole("button", { name: "Stay" }));
  expect(input).toHaveValue(null);
  expect(saveDraft).not.toHaveBeenCalled();
});

test.each(["Save draft", "Save and publish"] as const)(
  "%s keeps the original precondition after the editor reads a newer revision",
  async (action) => {
    const user = userEvent.setup();
    const server = revisionedEntry();
    const publishEntry = vi.fn<AdminClient["publishEntry"]>();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderRoute(
      "/content/posts/entry-1",
      staticSessionSource({ id: "admin-1", role: "admin" }),
      server.client({ publishEntry }),
      { queryClient },
    );
    const title = await screen.findByRole("textbox", { name: "Title" });
    await user.type(title, " with local edits");
    const newer = await server.saveDraft(initial.id, {
      blocks: [],
      expectedRevision: 4,
      fields: { summary: "Other summary" },
      title: "Other title",
    });
    server.saveDraft.mockClear();
    await returnFocus();
    await waitFor(() => expect(queryClient.getQueryData(entryKey)).toEqual(newer));
    const alert = await screen.findByRole("alert", { name: "Draft changed elsewhere" });
    expect(server.saveDraft).not.toHaveBeenCalled();
    await returnFocus();
    expect(server.loadEntry).toHaveBeenCalledTimes(3);
    server.loadEntry.mockResolvedValueOnce(initial);
    await returnFocus();
    await waitFor(() => expect(queryClient.getQueryData(entryKey)).toEqual(initial));
    expect(screen.getAllByRole("alert", { name: "Draft changed elsewhere" })).toEqual([alert]);
    await user.click(screen.getByRole("button", { name: action }));
    if (action === "Save and publish") {
      const dialog = await screen.findByRole("dialog", { name: "Save and publish this entry?" });
      await user.click(within(dialog).getByRole("button", { name: action }));
    }
    expect(await screen.findByText("Not saved")).toBeInTheDocument();
    expect(server.saveDraft).toHaveBeenCalledExactlyOnceWith(
      initial.id,
      expect.objectContaining({
        expectedRevision: 4,
        fields: { summary: "Original summary" },
        title: "First post with local edits",
      }),
    );
    expect(publishEntry).not.toHaveBeenCalled();
    expect(title).toHaveValue("First post with local edits");
    expect(screen.getAllByRole("alert", { name: "Draft changed elsewhere" })).toEqual([alert]);
  },
);

test("a successful save adopts normalized values despite an older read already in flight", async () => {
  const user = userEvent.setup();
  const server = revisionedEntry();
  const delayedRead = Promise.withResolvers<AdminContentEntryDto>();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const saved = {
    ...initial,
    draft: {
      ...initial.draft,
      fields: { summary: "Normalized summary" },
      revision: 5,
      title: "Normalized title",
    },
  };
  server.loadEntry.mockResolvedValueOnce(initial).mockReturnValueOnce(delayedRead.promise);
  server.saveDraft.mockResolvedValueOnce(saved);
  renderRoute(
    "/content/posts/entry-1",
    staticSessionSource({ id: "editor-1", role: "editor" }),
    server.client(),
    { queryClient },
  );
  const title = await screen.findByRole("textbox", { name: "Title" });
  const save = screen.getByRole("button", { name: "Save draft" });
  await user.type(title, " changed");
  await returnFocus();
  await waitFor(() => expect(queryClient.getQueryState(entryKey)?.fetchStatus).toBe("fetching"));
  await user.click(save);
  expect(await screen.findByText("Saved revision 5")).toBeInTheDocument();
  await act(async () => {
    delayedRead.resolve(initial);
    await delayedRead.promise;
  });
  expect(queryClient.getQueryData(entryKey)).toEqual(saved);
  expect(title).toHaveValue("Normalized title");
  expect(screen.getByRole("textbox", { name: "Summary" })).toHaveValue("Normalized summary");
  expect(save).toBeDisabled();
});

test("an update to publication at the same revision keeps the dirty form", async () => {
  const user = userEvent.setup();
  const server = revisionedEntry();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const published: AdminContentEntryDto = {
    ...initial,
    published: { ...initial.draft, id: "published-4", state: "published" },
  };
  const older = { ...initial, draft: { ...initial.draft, revision: 3 } };
  server.loadEntry
    .mockResolvedValueOnce(initial)
    .mockResolvedValueOnce(published)
    .mockResolvedValueOnce(older);
  renderRoute(
    "/content/posts/entry-1",
    staticSessionSource({ id: "editor-1", role: "editor" }),
    server.client(),
    { queryClient },
  );
  const title = await screen.findByRole("textbox", { name: "Title" });
  const publication = screen.getByRole("region", { name: "Publication status" });
  expect(publication).toHaveTextContent("LiveNot published");
  await user.type(title, " locally");
  await returnFocus();
  expect(await within(publication).findByText("Published", { exact: true })).toBeInTheDocument();
  await returnFocus();
  await waitFor(() => expect(queryClient.getQueryData(entryKey)).toEqual(older));
  expect(within(publication).getByText("Published", { exact: true })).toBeInTheDocument();
  expect(publication).toHaveTextContent("DraftRevision 4");
  expect(title).toHaveValue("First post locally");
  expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
  expect(screen.queryByRole("alert", { name: "Draft changed elsewhere" })).not.toBeInTheDocument();
});

test("a save response arriving after confirmed navigation leaves the next editor intact", async () => {
  const user = userEvent.setup();
  const server = revisionedEntry();
  const delayedSave = Promise.withResolvers<AdminContentEntryDto>();
  const other = {
    ...initial,
    id: "entry-2",
    draft: { ...initial.draft, entryId: "entry-2", title: "Second post", revision: 7 },
  };
  server.saveDraft.mockReturnValueOnce(delayedSave.promise);
  server.loadEntry.mockImplementation(async (id) => (id === initial.id ? initial : other));
  const router = renderRoute(
    "/content/posts/entry-1",
    staticSessionSource({ id: "editor-1", role: "editor" }),
    server.client(),
  );
  const title = await screen.findByRole("textbox", { name: "Title" });
  await user.type(title, " locally");
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(server.saveDraft).toHaveBeenCalledOnce());
  await act(async () => {
    void router.navigate({
      params: { entryId: other.id, modelKey: model.key },
      to: "/content/$modelKey/$entryId",
    });
  });
  await user.click(await screen.findByRole("button", { name: "Leave without saving" }));
  expect(await screen.findByText("Saved revision 7")).toBeInTheDocument();
  const nextTitle = screen.getByRole("textbox", { name: "Title" });
  await act(async () => {
    delayedSave.resolve({
      ...initial,
      draft: { ...initial.draft, revision: 5, title: "First post locally" },
    });
    await delayedSave.promise;
  });
  expect(nextTitle).toHaveValue("Second post");
  expect(screen.getByText("Saved revision 7")).toBeInTheDocument();
  expect(screen.queryByRole("alert", { name: "Draft changed elsewhere" })).not.toBeInTheDocument();
});

test("reload replaces a conflicted form only after a successful retry", async () => {
  const user = userEvent.setup();
  const server = revisionedEntry();
  const observed = {
    ...blockEntry,
    draft: { ...blockEntry.draft, revision: 5, title: "Updated elsewhere" },
  };
  const latest = {
    ...observed,
    draft: {
      ...observed.draft,
      blocks: [
        { ...blockEntry.draft.blocks[0]!, data: { numbers: [42, 20] } },
        blockEntry.draft.blocks[1]!,
      ],
      revision: 6,
      title: "Latest server title",
    },
  };
  const retry = Promise.withResolvers<AdminContentEntryDto>();
  server.loadEntry
    .mockResolvedValueOnce(blockEntry)
    .mockResolvedValueOnce(observed)
    .mockRejectedValueOnce(new AdminClientError({ message: "Could not reload the server draft." }))
    .mockReturnValueOnce(retry.promise);
  const publishEntry = vi.fn<AdminClient["publishEntry"]>();
  renderRoute(
    "/content/posts/entry-1",
    staticSessionSource({ id: "admin-1", role: "admin" }),
    server.client({
      listModels: async () => ({
        items: [blockModel],
        listQueryLimits: { maxSearchLength: 200, maxLikePatternBytes: null },
      }),
      publishEntry,
    }),
  );
  const input = await screen.findByRole("spinbutton", { name: "Numbers item 1" });
  await user.clear(input);
  await returnFocus();
  const alert = within(await screen.findByRole("alert", { name: "Draft changed elsewhere" }));
  const reload = alert.getByRole("button", { name: "Reload server draft" });
  const publication = screen.getByRole("region", { name: "Publication status" });
  await user.click(reload);
  expect(await alert.findByText("Could not reload the server draft.")).toBeInTheDocument();
  expect(reload).toBeEnabled();
  expect(alert.getByRole("button", { name: "Copy my JSON" })).toBeEnabled();
  expect(publication).toHaveTextContent("DraftRevision 4");
  expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("First post");
  expect(input).toHaveValue(null);
  expect(input).toHaveAccessibleDescription("Enter a value or remove this item.");

  await user.click(reload);
  expect(await alert.findByRole("button", { name: "Reloading…" })).toBeDisabled();
  expect(input).toHaveValue(null);
  await act(async () => {
    retry.resolve(latest);
    await retry.promise;
  });
  expect(await screen.findByText("Saved revision 6")).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("Latest server title");
  expect(screen.getByRole("spinbutton", { name: "Numbers item 1" })).toHaveValue(42);
  expect(screen.queryByText("Enter a value or remove this item.")).not.toBeInTheDocument();
  expect(screen.queryByRole("alert", { name: "Draft changed elsewhere" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
  expect(server.loadEntry).toHaveBeenCalledTimes(4);
  expect(server.saveDraft).not.toHaveBeenCalled();
  expect(publishEntry).not.toHaveBeenCalled();
});
