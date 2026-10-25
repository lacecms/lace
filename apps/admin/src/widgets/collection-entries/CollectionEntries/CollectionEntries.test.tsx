import { screen, waitFor, within } from "@testing-library/react";
import { userEvent, type UserEvent } from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import {
  draftEntry,
  entry,
  entryList,
  models,
  renderRoute,
  stubClient as client,
  staticSessionSource,
} from "../../../app/testing/index.js";
import {
  AdminClientError,
  type AdminClient,
  type EntryListQuery,
} from "../../../shared/api/index.js";
import { requestFocus } from "../../../shared/lib/index.js";
import { collectionFocusTarget } from "./CollectionEntries.js";

afterEach(() => {
  vi.restoreAllMocks();
});

const editor = staticSessionSource({ id: "editor-1", role: "editor" });
const viewer = staticSessionSource({ id: "viewer-1", role: "viewer" });

const postsModel = {
  blocks: [],
  fields: {
    category: { label: "Category", options: ["news"], required: false, type: "select" as const },
    featured: { required: false, type: "boolean" as const },
  },
  key: "posts",
  kind: "collection" as const,
  label: "Posts",
  listFields: ["category", "featured"],
  route: "/posts/:slug",
  version: 1,
};
const listModels = async () => ({
  listQueryLimits: { maxSearchLength: 200, maxLikePatternBytes: null },
  items: [models.items[0]!, postsModel],
});

const changedEntry = {
  ...entry,
  id: "entry-launch",
  listValues: { category: "news", featured: true },
  publishedAt: "2026-09-20T12:00:00.000Z",
  publishedSnapshotId: "snapshot-launch",
  slug: "launch",
  status: "changed" as const,
  title: "Launch",
  updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  updatedBy: { displayName: "Ada Editor", id: "user-ada" },
};

const admin = staticSessionSource({ id: "admin-1", role: "admin" });

async function openRowMenu(user: UserEvent, title: string) {
  // Radix opens menus on pointer down; the keyboard path is deterministic in jsdom.
  (await screen.findByRole("button", { name: `Actions for ${title}` })).focus();
  await user.keyboard("{Enter}");
  return within(await screen.findByRole("menu"))
    .getAllByRole("menuitem")
    .map((item) => item.textContent);
}

async function openRowAction(user: UserEvent, title: string, action: string) {
  await openRowMenu(user, title);
  await user.click(screen.getByRole("menuitem", { name: action }));
}

type ListCall = [string, string | undefined, EntryListQuery | undefined];

/** Entry-list calls made by the collection table, excluding the shell's one-item overview. */
function listCalls(listEntries: { mock: { calls: unknown[][] } }) {
  return (listEntries.mock.calls as ListCall[]).filter(
    ([key, , query]) => key === "posts" && query?.limit === undefined,
  );
}

test("rows show entry state and list fields without internal identifiers", async () => {
  renderRoute(
    "/content/posts",
    editor,
    client({ listEntries: async () => entryList([changedEntry, entry]), listModels }),
  );

  const table = await screen.findByRole("table", { name: "Posts entries" });
  const headers = within(table)
    .getAllByRole("columnheader")
    .map((header) => header.textContent);
  expect(headers).toEqual([
    "Title",
    "Status",
    "Category",
    "featured",
    "Published",
    "Updated",
    "Actions",
  ]);
  const [, launch, draft] = within(table).getAllByRole("row");
  expect(within(launch!).getByRole("link", { name: "Launch" })).toHaveAttribute(
    "href",
    "/admin/content/posts/entry-launch",
  );
  expect(launch).toHaveTextContent("launch");
  expect(within(launch!).getByText("Changed")).toBeInTheDocument();
  expect(within(launch!).getByText("news")).toBeInTheDocument();
  expect(within(launch!).getByText("Yes")).toBeInTheDocument();
  expect(within(launch!).getByText("Sep 20, 2026")).toBeInTheDocument();
  expect(within(launch!).getByText("2 hours ago")).toHaveAttribute(
    "datetime",
    changedEntry.updatedAt,
  );
  expect(within(launch!).getByText("by Ada Editor")).toBeInTheDocument();
  expect(within(launch!).getByRole("button", { name: "Actions for Launch" })).toBeInTheDocument();

  expect(within(draft!).getByText("No slug")).toBeInTheDocument();
  expect(within(draft!).getByText("Draft")).toBeInTheDocument();
  expect(within(draft!).getByText("Not published")).toBeInTheDocument();
  expect(within(draft!).getAllByText("—")).toHaveLength(3);

  const text = document.body.textContent ?? "";
  for (const id of ["entry-launch", "entry-1", "user-ada", "editor-1"])
    expect(text).not.toContain(id);
  expect(screen.getByText("Showing 2 of 2")).toBeInTheDocument();
});

test("viewers see the same rows and filters without mutation controls", async () => {
  renderRoute(
    "/content/posts",
    viewer,
    client({ listEntries: async () => entryList([changedEntry]), listModels }),
  );
  const table = await screen.findByRole("table", { name: "Posts entries" });
  expect(within(table).getByRole("link", { name: "Launch" })).toBeInTheDocument();
  expect(within(table).queryByRole("columnheader", { name: "Actions" })).not.toBeInTheDocument();
  expect(screen.getByRole("searchbox", { name: "Search entries" })).toBeInTheDocument();
  expect(screen.getByRole("group", { name: "Filter by status" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Create entry" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^Actions for/u })).not.toBeInTheDocument();
});

test("cursor pages stay opaque, report progress, and keep rows when the next page fails", async () => {
  const user = userEvent.setup();
  const listEntries = vi
    .fn(async (_modelKey: string, cursor?: string, _query?: EntryListQuery) =>
      cursor === undefined
        ? {
            ...entryList([entry], "opaque+/="),
            totals: { all: 3, changed: 0, draft: 3, published: 0 },
          }
        : entryList([{ ...entry, id: "entry-2", title: "Second post" }], "next+/="),
    )
    .mockName("listEntries");
  renderRoute("/content/posts", editor, client({ listEntries }));

  await screen.findByRole("table", { name: "posts entries" });
  expect(screen.getByText("Showing 1 of 3")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Load more entries" }));
  expect(await screen.findByText("Second post")).toBeInTheDocument();
  expect(listCalls(listEntries).at(-1)?.[1]).toBe("opaque+/=");
  expect(screen.getByText("Showing 2 of 3")).toBeInTheDocument();

  listEntries.mockRejectedValueOnce(new AdminClientError({ message: "Page unavailable" }));
  await user.click(screen.getByRole("button", { name: "Load more entries" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Page unavailable");
  expect(screen.getByText("First post")).toBeInTheDocument();
  expect(screen.getByText("Second post")).toBeInTheDocument();
});

test("an empty collection offers creation only to permitted roles", async () => {
  renderRoute("/content/posts", editor, client({ listEntries: async () => entryList([]) }));
  const empty = await screen.findByRole("region", { name: "No entries yet" });
  expect(within(empty).getByRole("button", { name: "Create entry" })).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: "Create entry" })).toHaveLength(1);
  expect(screen.queryByRole("table")).not.toBeInTheDocument();

  document.body.replaceChildren();
  renderRoute("/content/posts", viewer, client({ listEntries: async () => entryList([]) }));
  const viewerEmpty = await screen.findByRole("region", { name: "No entries yet" });
  expect(viewerEmpty).toHaveTextContent("There are no entries in this collection yet.");
  expect(screen.queryByRole("button", { name: "Create entry" })).not.toBeInTheDocument();
});

test("a filter without matches offers to clear the search and status", async () => {
  const user = userEvent.setup();
  const listEntries = vi.fn(async (_modelKey: string, _cursor?: string, query?: EntryListQuery) =>
    query?.q === undefined ? entryList([entry]) : entryList([]),
  );
  const router = renderRoute(
    "/content/posts?q=missing&status=draft",
    editor,
    client({ listEntries }),
  );

  const noMatches = await screen.findByRole("region", { name: "No matching entries" });
  await user.click(within(noMatches).getByRole("button", { name: "Clear filters" }));
  expect(await screen.findByRole("table", { name: "posts entries" })).toBeInTheDocument();
  expect(router.state.location.search).toEqual({});
  expect(screen.getByRole("searchbox", { name: "Search entries" })).toHaveValue("");
});

test("a failed list shows the error and retries on request", async () => {
  const user = userEvent.setup();
  let failed = false;
  const listEntries = vi.fn(async (_modelKey: string, _cursor?: string, query?: EntryListQuery) => {
    if (query?.limit === undefined && !failed) {
      failed = true;
      throw new AdminClientError({ message: "API unavailable", requestId: "req-1", status: 503 });
    }
    return entryList([entry]);
  });
  renderRoute("/content/posts", editor, client({ listEntries }));

  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("API unavailable");
  expect(alert).toHaveTextContent("req-1");
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByRole("table", { name: "posts entries" })).toBeInTheDocument();
});

test("status buttons show totals for the search and restart pagination when changed", async () => {
  const user = userEvent.setup();
  const listEntries = vi.fn(
    async (_modelKey: string, _cursor?: string, _query?: EntryListQuery) => ({
      ...entryList([changedEntry], "opaque"),
      totals: { all: 4, changed: 1, draft: 1, published: 2 },
    }),
  );
  const router = renderRoute(
    "/content/posts?q=launch",
    editor,
    client({ listEntries, listModels }),
  );

  const group = await screen.findByRole("group", { name: "Filter by status" });
  await waitFor(() =>
    expect(within(group).getByRole("button", { name: "All 4" })).toHaveAttribute(
      "aria-pressed",
      "true",
    ),
  );
  expect(within(group).getByRole("button", { name: "Draft 1" })).toBeInTheDocument();
  expect(within(group).getByRole("button", { name: "Published 2" })).toBeInTheDocument();
  await user.click(await screen.findByRole("button", { name: "Load more entries" }));
  await waitFor(() => expect(listCalls(listEntries).at(-1)?.[1]).toBe("opaque"));

  await user.click(within(group).getByRole("button", { name: "Changed 1" }));
  await waitFor(() =>
    expect(listCalls(listEntries).at(-1)).toEqual([
      "posts",
      undefined,
      { q: "launch", status: "changed" },
    ]),
  );
  expect(router.state.location.search).toEqual({ q: "launch", status: "changed" });
  expect(within(group).getByRole("button", { name: "Changed 1" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("column headers sort on the server and expose the direction", async () => {
  const user = userEvent.setup();
  const listEntries = vi.fn(async (_modelKey: string, _cursor?: string, _query?: EntryListQuery) =>
    entryList([changedEntry]),
  );
  const router = renderRoute("/content/posts", editor, client({ listEntries, listModels }));

  const table = await screen.findByRole("table", { name: "Posts entries" });
  const titleHeader = within(table).getByRole("columnheader", { name: "Title" });
  expect(within(table).getByRole("columnheader", { name: "Updated" })).toHaveAttribute(
    "aria-sort",
    "descending",
  );
  expect(titleHeader).toHaveAttribute("aria-sort", "none");
  expect(within(table).getByRole("columnheader", { name: "Status" })).not.toHaveAttribute(
    "aria-sort",
  );

  await user.click(within(titleHeader).getByRole("button", { name: "Title" }));
  await waitFor(() => expect(listCalls(listEntries).at(-1)?.[2]).toEqual({ sort: "title" }));
  await waitFor(() => expect(titleHeader).toHaveAttribute("aria-sort", "ascending"));
  expect(router.state.location.search).toEqual({ sort: "title" });

  await user.click(within(titleHeader).getByRole("button", { name: "Title" }));
  await waitFor(() => expect(listCalls(listEntries).at(-1)?.[2]).toEqual({ sort: "-title" }));

  const published = within(table).getByRole("columnheader", { name: "Published" });
  await user.click(within(published).getByRole("button", { name: "Published" }));
  await waitFor(() => expect(listCalls(listEntries).at(-1)?.[2]).toEqual({ sort: "-publishedAt" }));
});

test("search updates the URL after a pause and deletion returns focus to the heading", async () => {
  const user = userEvent.setup();
  const deleteEntry = vi.fn(async () => undefined);
  const draftLaunch = {
    ...changedEntry,
    publishedAt: undefined,
    publishedSnapshotId: undefined,
    status: "draft" as const,
  };
  const listEntries = vi.fn(async (_modelKey: string, _cursor?: string, _query?: EntryListQuery) =>
    entryList([draftLaunch]),
  );
  const router = renderRoute(
    "/content/posts",
    editor,
    client({ deleteEntry, listEntries, listModels }),
  );

  await screen.findByRole("table", { name: "Posts entries" });
  await user.type(screen.getByRole("searchbox", { name: "Search entries" }), "launch");
  await waitFor(() => expect(router.state.location.search).toEqual({ q: "launch" }));
  expect(listCalls(listEntries).some(([, , query]) => query?.q === "lau")).toBe(false);
  await waitFor(() => expect(listCalls(listEntries).at(-1)?.[2]).toEqual({ q: "launch" }));

  await openRowAction(user, "Launch", "Delete");
  await user.click(
    within(await screen.findByRole("dialog", { name: "Delete entry?" })).getByRole("button", {
      name: "Delete entry",
    }),
  );
  await waitFor(() =>
    expect(deleteEntry).toHaveBeenCalledWith("entry-launch", 2, {
      receipt: "receipt",
      acknowledgePublishedLinks: true,
    }),
  );
  await waitFor(() =>
    expect(screen.getByRole("heading", { level: 1, name: "Posts" })).toHaveFocus(),
  );
});

test("a pending focus request moves focus to the heading once the list mounts", async () => {
  requestFocus(collectionFocusTarget("posts"));
  renderRoute(
    "/content/posts",
    editor,
    client({ listEntries: async () => entryList([]), listModels }),
  );
  await waitFor(() =>
    expect(screen.getByRole("heading", { level: 1, name: "Posts" })).toHaveFocus(),
  );
});

test("row menus offer only permitted actions", async () => {
  const user = userEvent.setup();
  renderRoute(
    "/content/posts",
    editor,
    client({ listEntries: async () => entryList([changedEntry, entry]), listModels }),
  );
  expect(await openRowMenu(user, "Launch")).toEqual(["Open", "Duplicate"]);
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  expect(await openRowMenu(user, "First post")).toEqual(["Open", "Duplicate", "Delete"]);
});

test("an admin deletes a published row only after typing its title and cancel returns focus", async () => {
  const user = userEvent.setup();
  const deleteEntry = vi.fn(async () => undefined);
  renderRoute(
    "/content/posts",
    admin,
    client({ deleteEntry, listEntries: async () => entryList([changedEntry]), listModels }),
  );
  expect(await openRowMenu(user, "Launch")).toEqual(["Open", "Duplicate", "Delete"]);
  await user.click(screen.getByRole("menuitem", { name: "Delete" }));
  let dialog = await screen.findByRole("dialog", { name: "Delete entry?" });
  expect(dialog).toHaveAccessibleDescription(/disappears from the site after the next build/u);
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.getByRole("button", { name: "Actions for Launch" })).toHaveFocus();

  await openRowAction(user, "Launch", "Delete");
  dialog = await screen.findByRole("dialog", { name: "Delete entry?" });
  const confirm = within(dialog).getByRole("button", { name: "Delete entry" });
  expect(confirm).toBeDisabled();
  await user.type(
    within(dialog).getByRole("textbox", { name: "Type “Launch” to confirm" }),
    "Launch",
  );
  await user.click(confirm);
  await waitFor(() =>
    expect(deleteEntry).toHaveBeenCalledWith("entry-launch", 2, {
      receipt: "receipt",
      acknowledgePublishedLinks: true,
    }),
  );
});

test("duplicating a row opens the copy", async () => {
  const user = userEvent.setup();
  const copy = {
    ...draftEntry,
    draft: {
      ...draftEntry.draft,
      entryId: "entry-copy",
      id: "snapshot-copy",
      title: "Launch (copy)",
    },
    id: "entry-copy",
  };
  const duplicateEntry = vi.fn(async () => copy);
  const router = renderRoute(
    "/content/posts",
    editor,
    client({
      duplicateEntry,
      listEntries: async () => entryList([changedEntry]),
      listModels,
      loadEntry: async () => copy,
    }),
  );
  await openRowAction(user, "Launch", "Duplicate");
  await waitFor(() => expect(router.state.location.pathname).toBe("/content/posts/entry-copy"));
  expect(duplicateEntry).toHaveBeenCalledWith("entry-launch", 2);
});

test("Open in the row menu opens the editor", async () => {
  const user = userEvent.setup();
  const router = renderRoute(
    "/content/posts",
    editor,
    client({ listEntries: async () => entryList([entry]), listModels }),
  );
  await openRowAction(user, "First post", "Open");
  await waitFor(() => expect(router.state.location.pathname).toBe("/content/posts/entry-1"));
});

test("metadata precedes URL recovery and hidden sorts/valid peers survive", async () => {
  let deliver: (value: import("@lacecms/contracts").ContentModelListDto) => void = () => {};
  const metadata = new Promise<import("@lacecms/contracts").ContentModelListDto>((resolve) => {
    deliver = resolve;
  });
  const model = {
    ...postsModel,
    listOptions: { sortableFields: ["category"], filterableFields: ["featured"] },
  };
  const listEntries = vi.fn(async () => entryList([entry]));
  const filters = JSON.stringify([{ field: "featured", op: "eq", value: false }]);
  const router = renderRoute(
    `/content/posts?sort=field%3Acategory&q=${encodeURIComponent("я".repeat(25))}&filters=${encodeURIComponent(filters)}`,
    viewer,
    client({ listEntries, listModels: () => metadata }),
  );
  expect(listCalls(listEntries)).toHaveLength(0);
  deliver({ items: [model], listQueryLimits: { maxSearchLength: 48, maxLikePatternBytes: 50 } });
  await screen.findByRole("table", { name: "Posts entries" });
  await waitFor(() => expect(router.state.location.search.q).toBeUndefined());
  expect(
    listCalls(listEntries).every(
      ([, , query]) => query?.q === undefined && query?.sort === "field:category",
    ),
  ).toBe(true);
  expect(listCalls(listEntries).at(-1)?.[2]?.filters).toEqual([
    { field: "featured", op: "eq", value: false },
  ]);
  expect(screen.getByRole("combobox", { name: "Sort entries" })).toHaveValue("field:category");
});

test("expired continuation retains rows and restarts with all query intent, replacing pages", async () => {
  const user = userEvent.setup();
  const model = {
    ...postsModel,
    listOptions: { sortableFields: ["category"], filterableFields: ["featured"] },
  };
  let restarted = false;
  const listEntries = vi.fn(async (_key: string, cursor?: string, query?: EntryListQuery) => {
    if (query?.limit !== undefined) return entryList([entry]);
    if (cursor)
      throw new AdminClientError({
        status: 422,
        code: "VALIDATION_FAILED",
        message: "Invalid cursor",
        issues: [{ path: "/after", code: "invalid_value", message: "Invalid" }],
      });
    return {
      ...entryList([restarted ? { ...changedEntry, title: "Refreshed" } : entry]),
      nextCursor: restarted ? undefined : "expired",
    };
  });
  const filters = JSON.stringify([{ field: "featured", op: "eq", value: false }]);
  const router = renderRoute(
    `/content/posts?q=launch&status=draft&sort=field%3Acategory&filters=${encodeURIComponent(filters)}`,
    viewer,
    client({
      listEntries: listEntries as AdminClient["listEntries"],
      listModels: async () => ({
        items: [model],
        listQueryLimits: { maxSearchLength: 200, maxLikePatternBytes: null },
      }),
    }),
  );
  await screen.findByRole("table", { name: "Posts entries" });
  await user.click(screen.getByRole("button", { name: "Load more entries" }));
  const restart = await screen.findByRole("button", { name: "Restart list" });
  expect(screen.getByRole("link", { name: "First post" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Load more entries" })).not.toBeInTheDocument();
  restarted = true;
  restart.focus();
  await user.keyboard("{Enter}");
  await screen.findByRole("link", { name: "Refreshed" });
  expect(screen.queryByRole("link", { name: "First post" })).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("List restarted");
  expect(listCalls(listEntries).filter(([, cursor]) => cursor === "expired")).toHaveLength(1);
  expect(listCalls(listEntries).at(-1)?.[2]).toMatchObject({
    q: "launch",
    status: "draft",
    sort: "field:category",
    filters: [{ field: "featured", op: "eq", value: false }],
  });
  expect(router.state.location.search).not.toHaveProperty("after");
});
