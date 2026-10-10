import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import {
  entry,
  entryList,
  renderRoute,
  stubClient,
  staticSessionSource,
} from "../../../app/testing/index.js";
import { AdminClientError, type EntryListQuery } from "../../../shared/api/index.js";

const editor = staticSessionSource({ id: "editor-1", role: "editor" });

test("routes collections to their entry list and pages back to the landing route", async () => {
  renderRoute("/content/posts", editor);
  expect(await screen.findByRole("table", { name: "posts entries" })).toBeInTheDocument();

  document.body.replaceChildren();
  renderRoute("/content/home", editor);
  expect(await screen.findByRole("heading", { name: "home" })).toBeInTheDocument();
  expect(screen.getByText("Open this page from the content landing route.")).toBeInTheDocument();
});

test("reports unknown models and failed model loads without an entry list", async () => {
  renderRoute("/content/missing", editor);
  expect(await screen.findByRole("heading", { name: "Page not found" })).toBeInTheDocument();
  expect(screen.queryByRole("table")).not.toBeInTheDocument();

  document.body.replaceChildren();
  renderRoute(
    "/content/posts",
    editor,
    stubClient({
      listModels: async () => Promise.reject(new AdminClientError({ message: "API unavailable" })),
    }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("API unavailable");
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
});

function listSpy() {
  const listEntries = vi.fn(async (_modelKey: string, _cursor?: string, _query?: EntryListQuery) =>
    entryList([entry]),
  );
  const tableCalls = () =>
    listEntries.mock.calls.filter(
      ([key, , query]) => key === "posts" && query?.limit === undefined,
    );
  return { listEntries, tableCalls };
}

test("a collection URL restores its search, status filter, and sort", async () => {
  const { listEntries, tableCalls } = listSpy();
  renderRoute(
    "/content/posts?q=launch&status=changed&sort=title",
    editor,
    stubClient({ listEntries }),
  );

  const table = await screen.findByRole("table", { name: "posts entries" });
  expect(tableCalls()[0]).toEqual([
    "posts",
    undefined,
    { q: "launch", sort: "title", status: "changed" },
  ]);
  expect(screen.getByRole("searchbox", { name: "Search entries" })).toHaveValue("launch");
  expect(screen.getByRole("button", { name: /^Changed/u })).toHaveAttribute("aria-pressed", "true");
  expect(within(table).getByRole("columnheader", { name: "Title" })).toHaveAttribute(
    "aria-sort",
    "ascending",
  );
});

test("filter changes replace the URL and unsupported parameters are ignored", async () => {
  const user = userEvent.setup();
  const { listEntries, tableCalls } = listSpy();
  const router = renderRoute(
    "/content/posts?status=archived&sort=author",
    editor,
    stubClient({ listEntries }),
  );

  await screen.findByRole("table", { name: "posts entries" });
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(tableCalls()[0]).toEqual(["posts", undefined, {}]);
  expect(screen.getByRole("button", { name: /^All/u })).toHaveAttribute("aria-pressed", "true");

  const historyLength = router.history.length;
  await user.click(screen.getByRole("button", { name: /^Draft/u }));
  await waitFor(() => expect(router.state.location.search).toEqual({ status: "draft" }));
  expect(router.state.location.href).toBe("/content/posts?status=draft");
  expect(router.history.length).toBe(historyLength);
});
