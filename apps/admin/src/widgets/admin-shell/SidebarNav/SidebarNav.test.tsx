import { screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import {
  entryList,
  renderInRouter,
  renderRoute,
  stubClient as client,
  staticSessionSource,
} from "../../../app/testing/index.js";
import { AdminClientError } from "../../../shared/api/index.js";
import { SidebarNav } from "./index.js";

afterEach(() => {
  vi.restoreAllMocks();
});

const nav = () => <SidebarNav onSignOut={() => undefined} signingOut={false} />;

test("groups configured pages, collections with counts, library, and admin items by role", async () => {
  renderInRouter(nav(), { session: { displayName: "Ada Admin", id: "admin-1", role: "admin" } });
  const pages = await screen.findByRole("list", { name: "Pages" });
  expect(await within(pages).findByRole("link", { name: "home" })).toHaveAttribute(
    "href",
    "/content/home/home-1",
  );
  const collections = screen.getByRole("list", { name: "Collections" });
  expect(await within(collections).findByRole("link", { name: "posts, 1 entry" })).toHaveAttribute(
    "href",
    "/content/posts",
  );
  const library = screen.getByRole("list", { name: "Library" });
  expect(
    within(library)
      .getAllByRole("link")
      .map((link) => link.textContent),
  ).toEqual(["Media", "Builds"]);
  const admin = screen.getByRole("list", { name: "Admin" });
  expect(
    within(admin)
      .getAllByRole("link")
      .map((link) => link.textContent),
  ).toEqual(["Users", "Settings"]);
  expect(screen.getByRole("button", { name: /Ada Admin, Admin/ })).toBeInTheDocument();
  expect(document.body).not.toHaveTextContent("admin-1");

  document.body.replaceChildren();
  renderInRouter(nav(), { session: { id: "editor-1", role: "editor" } });
  await screen.findByRole("list", { name: "Pages" });
  expect(screen.queryByRole("list", { name: "Admin" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Users" })).not.toBeInTheDocument();
});

test("marks the current collection on its entry routes", async () => {
  renderRoute("/content/posts/entry-1", staticSessionSource({ id: "editor-1", role: "editor" }));
  const aside = await screen.findByRole("complementary", { name: "Admin navigation" });
  expect(await within(aside).findByRole("link", { name: /^posts/ })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(within(aside).getByRole("link", { name: "Content" })).not.toHaveAttribute("aria-current");
});

test("a failed count or missing page draft keeps the item available and the route rendered", async () => {
  renderRoute(
    "/content/posts/entry-1",
    staticSessionSource({ id: "editor-1", role: "editor" }),
    client({
      listEntries: async (modelKey) =>
        modelKey === "posts"
          ? Promise.reject(new AdminClientError({ message: "API unavailable" }))
          : entryList(),
    }),
  );
  expect(await screen.findByRole("heading", { name: "Edit posts" })).toBeInTheDocument();
  const aside = screen.getByRole("complementary", { name: "Admin navigation" });
  expect(await within(aside).findByRole("link", { name: "posts" })).toHaveAttribute(
    "href",
    "/admin/content/posts",
  );
  expect(within(aside).getByRole("link", { name: "home" })).toHaveAttribute(
    "href",
    "/admin/content#pages",
  );
});
