import { screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import {
  draftEntry,
  entry,
  entryList,
  renderRoute,
  stubClient as client,
  staticSessionSource,
} from "../../../app/testing/index.js";
import { AdminClientError } from "../../../shared/api/index.js";

afterEach(() => {
  vi.restoreAllMocks();
});

// The shell's main landmark; the pending state renders a separate one first.
const main = () => within(document.getElementById("main-content") as HTMLElement);

test("content landing explains no configured models without hiding API errors", async () => {
  renderRoute(
    "/content",
    staticSessionSource({ id: "admin-1", role: "admin" }),
    client({ listModels: async () => ({ items: [] }) }),
  );
  expect(
    await screen.findByRole("heading", { name: "No content models configured" }),
  ).toBeInTheDocument();
  expect(screen.getByText(/pnpm content:sync/)).toBeInTheDocument();

  document.body.replaceChildren();
  renderRoute(
    "/content",
    staticSessionSource({ id: "admin-1", role: "admin" }),
    client({
      listModels: async () => Promise.reject(new AdminClientError({ message: "API unavailable" })),
    }),
  );
  expect(await screen.findByRole("heading", { name: "Something went wrong" })).toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: "No content models configured" }),
  ).not.toBeInTheDocument();
});

test("content landing guides missing page sync and opens the synced page editor and collection", async () => {
  const source = staticSessionSource({ id: "editor-1", role: "editor" });
  renderRoute("/content", source, client({ listEntries: async () => entryList() }));
  expect(await screen.findByRole("heading", { name: "Page draft missing" })).toBeInTheDocument();
  expect(screen.getByText(/pnpm content:sync/)).toBeInTheDocument();
  expect(main().getByRole("link", { name: "posts" })).toBeInTheDocument();

  document.body.replaceChildren();
  const synced = renderRoute(
    "/content",
    source,
    client({
      listEntries: async (key) =>
        key === "home" ? entryList([{ ...entry, id: "home-1", modelKey: "home" }]) : entryList(),
      loadEntry: async () => ({
        ...draftEntry,
        id: "home-1",
        model: { key: "home", kind: "page", path: "/" },
        draft: { ...draftEntry.draft, entryId: "home-1" },
      }),
    }),
  );
  await screen.findByRole("heading", { name: "Content", level: 1 });
  expect(await main().findByRole("link", { name: "home" })).toBeInTheDocument();
  await synced.navigate({ params: { modelKey: "posts" }, to: "/content/$modelKey" });
  expect(await screen.findByRole("heading", { name: "posts" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Create entry/ })).toBeInTheDocument();
  expect(screen.getByText(/run pnpm content:sync first/)).toBeInTheDocument();
  await synced.navigate({
    params: { entryId: "home-1", modelKey: "home" },
    to: "/content/$modelKey/$entryId",
  });
  expect(await screen.findByRole("heading", { name: "Edit home" })).toBeInTheDocument();
});

test("page cards show status, edit time, and editor; collection cards show totals", async () => {
  const updatedAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  renderRoute(
    "/content",
    staticSessionSource({ id: "editor-1", role: "editor" }),
    client({
      listEntries: async (key) =>
        key === "home"
          ? entryList([
              {
                ...entry,
                id: "home-1",
                modelKey: "home",
                publishedAt: "2026-09-19T00:00:00.000Z",
                publishedSnapshotId: "published-1",
                status: "changed",
                title: "Home",
                updatedAt,
                updatedBy: { displayName: "Ada Editor", id: "editor-7" },
              } as never,
            ])
          : {
              items: [entry],
              nextCursor: "next",
              totals: { all: 5, changed: 1, draft: 1, published: 3 },
            },
    }),
  );
  await screen.findByRole("heading", { name: "Content", level: 1 });
  const home = await main().findByRole("link", { name: "home" });
  expect(home).toHaveAttribute("href", "/admin/content/home/home-1");
  const pageCard = home.closest("article") as HTMLElement;
  expect(within(pageCard).getByText("Changed")).toBeInTheDocument();
  expect(within(pageCard).getByText("2 hours ago")).toHaveAttribute("dateTime", updatedAt);
  expect(pageCard).toHaveTextContent("by Ada Editor");
  expect(pageCard).not.toHaveTextContent("editor-7");
  expect(pageCard).not.toHaveTextContent("home-1");

  const posts = main().getByRole("link", { name: "posts" });
  expect(posts).toHaveAttribute("href", "/admin/content/posts");
  const collectionCard = posts.closest("article") as HTMLElement;
  expect(collectionCard).toHaveTextContent("5 entries");
  expect(collectionCard).toHaveTextContent("Published3");
  expect(collectionCard).toHaveTextContent("Changed1");
  expect(collectionCard).toHaveTextContent("Draft1");
});

test("one failing model summary stays local and viewers see the same summaries", async () => {
  renderRoute(
    "/content",
    staticSessionSource({ id: "viewer-1", role: "viewer" }),
    client({
      listEntries: async (key) =>
        key === "posts"
          ? Promise.reject(new AdminClientError({ message: "API unavailable" }))
          : entryList([{ ...entry, id: "home-1", modelKey: "home", title: "Home" }]),
    }),
  );
  await screen.findByRole("heading", { name: "Content", level: 1 });
  expect(await main().findByRole("heading", { name: "posts is unavailable" })).toBeInTheDocument();
  expect(await main().findByRole("link", { name: "home" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Create entry/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Delete/ })).not.toBeInTheDocument();
});
