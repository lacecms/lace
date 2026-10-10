import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import {
  entry,
  entryList,
  models,
  renderRoute,
  stubClient as client,
  staticSessionSource,
} from "../../../app/testing/index.js";
import { AdminClientError, type EntryListQuery } from "../../../shared/api/index.js";

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
const listModels = async () => ({ items: [models.items[0]!, postsModel] });

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
  expect(within(launch!).getByRole("button", { name: "Delete Launch" })).toBeInTheDocument();

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
  expect(screen.queryByRole("button", { name: /^Delete/u })).not.toBeInTheDocument();
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
  const listEntries = vi.fn(async (_modelKey: string, _cursor?: string, _query?: EntryListQuery) =>
    entryList([changedEntry]),
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

  await user.click(screen.getByRole("button", { name: "Delete Launch" }));
  await user.click(
    within(screen.getByRole("dialog", { name: "Delete entry?" })).getByRole("button", {
      name: "Delete entry",
    }),
  );
  await waitFor(() => expect(deleteEntry).toHaveBeenCalledWith("entry-launch", 2));
  await waitFor(() =>
    expect(screen.getByRole("heading", { level: 1, name: "Posts" })).toHaveFocus(),
  );
});
