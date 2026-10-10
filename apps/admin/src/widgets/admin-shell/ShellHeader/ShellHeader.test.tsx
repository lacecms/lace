import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import {
  draftEntry,
  renderRoute,
  stubClient as client,
  staticSessionSource,
} from "../../../app/testing/index.js";

afterEach(() => {
  vi.restoreAllMocks();
});

const editor = () => staticSessionSource({ id: "editor-1", role: "editor" });

test("breadcrumbs link the overview and model and mark the entry title current", async () => {
  renderRoute("/content/posts/entry-1", editor());
  const breadcrumb = await screen.findByRole("navigation", { name: "Breadcrumb" });
  expect(await within(breadcrumb).findByText("First post")).toHaveAttribute("aria-current", "page");
  expect(within(breadcrumb).getByRole("link", { name: "Content" })).toHaveAttribute(
    "href",
    "/admin/content",
  );
  expect(within(breadcrumb).getByRole("link", { name: "posts" })).toHaveAttribute(
    "href",
    "/admin/content/posts",
  );
  expect(breadcrumb).not.toHaveTextContent("entry-1");
});

test("breadcrumbs use neutral labels while loading and omit page singleton titles", async () => {
  renderRoute(
    "/content/posts/entry-1",
    editor(),
    client({ loadEntry: () => new Promise(() => undefined) }),
  );
  const breadcrumb = await screen.findByRole("navigation", { name: "Breadcrumb" });
  expect(await within(breadcrumb).findByText("Entry")).toHaveAttribute("aria-current", "page");
  expect(breadcrumb).not.toHaveTextContent("entry-1");

  document.body.replaceChildren();
  renderRoute(
    "/content/home/home-1",
    editor(),
    client({
      loadEntry: async () => ({
        ...draftEntry,
        draft: { ...draftEntry.draft, entryId: "home-1", title: "Welcome" },
        id: "home-1",
        model: { key: "home", kind: "page", path: "/" },
      }),
    }),
  );
  const pageCrumbs = await screen.findByRole("navigation", { name: "Breadcrumb" });
  await waitFor(() =>
    expect(within(pageCrumbs).getByText("home")).toHaveAttribute("aria-current", "page"),
  );
  expect(pageCrumbs).not.toHaveTextContent("Welcome");
  expect(pageCrumbs).not.toHaveTextContent("home-1");
});

test("the navigation sheet returns focus on Escape and closes when an item is chosen", async () => {
  const user = userEvent.setup();
  renderRoute("/content", editor());
  const trigger = await screen.findByRole("button", { name: "Open navigation" });
  await user.click(trigger);
  const sheet = await screen.findByRole("dialog", { name: "Navigation" });
  expect(sheet).toContainElement(document.activeElement as HTMLElement);
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(trigger).toHaveFocus();

  await user.click(trigger);
  const reopened = await screen.findByRole("dialog", { name: "Navigation" });
  await user.click(within(reopened).getByRole("link", { name: "Media" }));
  expect(await screen.findByRole("heading", { name: "Media" })).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(trigger).toHaveFocus();
});
