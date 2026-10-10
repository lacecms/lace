import { screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import {
  renderRoute,
  stubClient as client,
  staticSessionSource,
} from "../../../app/testing/index.js";
import { AdminClientError } from "../../../shared/api/index.js";

afterEach(() => {
  vi.restoreAllMocks();
});

test("role-aware navigation and direct admin-only route behavior follow the role matrix", async () => {
  renderRoute("/users", staticSessionSource({ id: "viewer-1", role: "viewer" }));
  expect(await screen.findByRole("heading", { name: "Access denied" })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Users" })).not.toBeInTheDocument();

  document.body.replaceChildren();
  renderRoute("/content", staticSessionSource({ id: "editor-1", role: "editor" }));
  await screen.findByRole("heading", { name: "Content", level: 1 });
  const aside = screen.getByRole("complementary", { name: "Admin navigation" });
  expect(within(aside).queryByRole("link", { name: "Users" })).not.toBeInTheDocument();
  expect(within(aside).getByRole("link", { name: "Media" })).toBeInTheDocument();

  document.body.replaceChildren();
  renderRoute("/settings", staticSessionSource({ id: "admin-1", role: "admin" }));
  const adminAside = await screen.findByRole("complementary", { name: "Admin navigation" });
  expect(within(adminAside).getByRole("link", { name: "Settings" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("navigation and route guards follow session permissions, not the role name", async () => {
  const operator = staticSessionSource({
    id: "ops-1",
    permissions: ["content:read", "settings:manage"],
    role: "viewer",
  });
  renderRoute("/users", operator);
  expect(await screen.findByRole("heading", { name: "Access denied" })).toBeInTheDocument();
  const aside = screen.getByRole("complementary", { name: "Admin navigation" });
  expect(within(aside).getByRole("link", { name: "Settings" })).toBeInTheDocument();
  expect(within(aside).queryByRole("link", { name: "Users" })).not.toBeInTheDocument();

  document.body.replaceChildren();
  renderRoute("/settings", operator);
  expect(await screen.findByRole("heading", { name: "Settings", level: 1 })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Access denied" })).not.toBeInTheDocument();
});

test("the skip link comes first and moves focus to the main content", async () => {
  const user = userEvent.setup();
  renderRoute("/content", staticSessionSource({ id: "editor-1", role: "editor" }));
  await screen.findByRole("heading", { name: "Content", level: 1 });
  await user.tab();
  const skip = screen.getByRole("link", { name: "Skip to content" });
  expect(skip).toHaveFocus();
  expect(skip).toHaveAttribute("href", "#main-content");
  expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
});

test("a failed logout reports the error and keeps the route rendered", async () => {
  const user = userEvent.setup();
  renderRoute(
    "/content",
    staticSessionSource({ displayName: "Ada Editor", id: "editor-1", role: "editor" }),
    client({ signOut: async () => Promise.reject(new AdminClientError({ message: "Auth down" })) }),
  );
  await screen.findByRole("heading", { name: "Content", level: 1 });
  const account = screen.getAllByRole("button", { name: /Ada Editor, Editor/ })[0];
  account?.focus();
  await user.keyboard("{Enter}");
  await user.click(await screen.findByRole("menuitem", { name: "Log out" }));
  expect(await screen.findByText(/Auth down/)).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Content", level: 1 })).toBeInTheDocument();
});

test.each(["admin", "editor", "viewer"] as const)(
  "%s can skip the invitation and replay from the account menu",
  async (role) => {
    const user = userEvent.setup();
    renderRoute("/content", staticSessionSource({ id: `tour-${role}`, role }));
    await screen.findByRole("heading", { name: "Content", level: 1 });
    await user.click(screen.getByRole("button", { name: "Skip" }));
    const aside = screen.getByRole("complementary", { name: "Admin navigation" });
    within(aside)
      .getByRole("button", { name: /account menu/ })
      .focus();
    await user.keyboard("{Enter}");
    await user.click(await screen.findByRole("menuitem", { name: "Introduction" }));
    expect(await screen.findByRole("dialog", { name: /Content, Step 1/ })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  },
);

test("tour preserves an unsaved draft and search state without mutation calls", async () => {
  const user = userEvent.setup();
  const saveDraft = vi.fn();
  const publishEntry = vi.fn();
  const router = renderRoute(
    "/content/posts/entry-1?from=tour",
    staticSessionSource({ id: "draft-tour", role: "editor" }),
    client({ saveDraft, publishEntry }),
  );
  const title = await screen.findByRole("textbox", { name: "Title" });
  await user.clear(title);
  await user.type(title, "Unsaved tour draft");
  const before = router.state.location.href;
  const aside = screen.getByRole("complementary", { name: "Admin navigation" });
  within(aside)
    .getByRole("button", { name: /account menu/ })
    .focus();
  await user.keyboard("{Enter}");
  await user.click(await screen.findByRole("menuitem", { name: "Introduction" }));
  await screen.findByRole("dialog", { name: /Content/ });
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Back" }));
  await user.keyboard("{Escape}");
  expect(title).toHaveValue("Unsaved tour draft");
  expect(router.state.location.href).toBe(before);
  expect(saveDraft).not.toHaveBeenCalled();
  expect(publishEntry).not.toHaveBeenCalled();
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
});

test("model loading, failure and empty navigation do not block the common tour", async () => {
  const user = userEvent.setup();
  let rejectModels: (reason: Error) => void = () => undefined;
  const pending = new Promise<never>((_resolve, reject) => {
    rejectModels = reject;
  });
  renderRoute(
    "/content",
    staticSessionSource({ id: "pending-tour", role: "viewer" }),
    client({ listModels: () => pending }),
  );
  await screen.findByRole("heading", { name: "Content", level: 1 });
  await user.click(screen.getByRole("button", { name: "Start tour" }));
  expect(screen.getByRole("dialog", { name: /Content, Step 1 of 3/ })).toBeInTheDocument();
  rejectModels(new AdminClientError({ message: "Unavailable" }));
  await screen.findByRole("dialog", { name: /Content, Step 1 of 3/ });
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByRole("dialog", { name: /Media/ })).toBeInTheDocument();
});
