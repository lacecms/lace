import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import {
  renderRoute,
  stubClient as client,
  staticSessionSource,
  sessionFor,
} from "../../../app/testing/index.js";
import { type AdminSession, type AdminSessionSource } from "../../../entities/session/index.js";
import { AdminClientError } from "../../../shared/api/index.js";

afterEach(() => {
  vi.restoreAllMocks();
});

test("admin user screen lists accounts, creates users, and keeps confirmed state on rejection", async () => {
  const user = userEvent.setup();
  const soleAdmin = {
    disabled: false,
    email: "admin@lace.test",
    id: "admin-1",
    role: "admin" as const,
  };
  const disabledViewer = {
    disabled: true,
    email: "viewer@lace.test",
    id: "viewer-1",
    role: "viewer" as const,
  };
  const created = {
    disabled: false,
    email: "new@lace.test",
    id: "new-1",
    role: "viewer" as const,
  };
  let items = [soleAdmin, disabledViewer];
  const listUsers = vi.fn(async () => ({ items }));
  const createUser = vi.fn(async () => {
    items = [...items, created];
    return created;
  });
  const updateUser = vi.fn(async () => {
    throw new AdminClientError({
      code: "LAST_ADMIN_PROTECTED",
      message: "Last administrator cannot be changed.",
      status: 409,
    });
  });
  renderRoute(
    "/users",
    staticSessionSource({ id: "admin-1", role: "admin" }),
    client({ createUser, listUsers, updateUser }),
  );
  const table = await screen.findByRole("table", { name: "Users" });
  expect(screen.getByText("2 accounts · 1 disabled")).toBeInTheDocument();
  const adminRow = within(table).getByRole("row", { name: /admin@lace\.test/u });
  expect(adminRow).toHaveTextContent("You");
  expect(adminRow).toHaveTextContent("Admin");
  expect(adminRow).toHaveTextContent("Active");
  expect(within(adminRow).queryByRole("button", { name: /^Disable/u })).not.toBeInTheDocument();
  const viewerRow = within(table).getByRole("row", { name: /viewer@lace\.test/u });
  expect(viewerRow).toHaveTextContent("Disabled");
  expect(within(viewerRow).getByRole("button", { name: "Enable viewer@lace.test" })).toBeVisible();
  expect(within(viewerRow).queryByRole("button", { name: /Change role/u })).not.toBeInTheDocument();
  expect(table).not.toHaveTextContent("admin-1");

  await user.click(screen.getByRole("button", { name: "Create user" }));
  const dialog = await screen.findByRole("dialog", { name: "Create user" });
  await user.type(within(dialog).getByLabelText("Email"), "new@lace.test");
  await user.type(within(dialog).getByLabelText("Password"), "long-password-123");
  await user.click(within(dialog).getByRole("button", { name: "Create user" }));
  await waitFor(() =>
    expect(createUser).toHaveBeenCalledWith({
      email: "new@lace.test",
      password: "long-password-123",
      role: "viewer",
    }),
  );
  expect(await screen.findByText("Created new@lace.test.")).toBeInTheDocument();
  expect(await within(table).findByText("new@lace.test")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Change role for admin@lace.test" }));
  const roleDialog = await screen.findByRole("dialog", { name: "Change role" });
  await user.click(within(roleDialog).getByRole("combobox", { name: "Role" }));
  await user.click(await screen.findByRole("option", { name: "Editor" }));
  await user.click(within(roleDialog).getByRole("button", { name: "Save role" }));
  expect(await within(roleDialog).findByRole("alert")).toHaveTextContent(
    "The final active administrator cannot be disabled or demoted.",
  );
  await user.keyboard("{Escape}");
  expect(within(table).getByRole("row", { name: /admin@lace\.test/u })).toHaveTextContent("Admin");
  expect(listUsers).toHaveBeenCalledTimes(2);
});

test("a failed user list offers Try again", async () => {
  const user = userEvent.setup();
  let fail = true;
  const listUsers = vi.fn(async () => {
    if (fail) throw new AdminClientError({ message: "Users unavailable.", status: 503 });
    return { items: [] };
  });
  renderRoute(
    "/users",
    staticSessionSource({ id: "admin-1", role: "admin" }),
    client({ listUsers }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("Users unavailable.");
  fail = false;
  await user.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByRole("region", { name: "No users found" })).toBeInTheDocument();
});

test("expired user request returns to login without stale management content", async () => {
  let current: AdminSession | null = sessionFor({ id: "admin-1", role: "admin" });
  const source: AdminSessionSource = { get: async () => current, invalidate: () => undefined };
  renderRoute(
    "/users",
    source,
    client({
      listUsers: async () => {
        current = null;
        throw new AdminClientError({ message: "Session expired", status: 401 });
      },
    }),
  );
  expect(
    await screen.findByRole("heading", { name: "Sign in" }, { timeout: 5000 }),
  ).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Users" })).not.toBeInTheDocument();
});

test("non-admin management routes issue no protected requests", async () => {
  const listUsers = vi.fn(async () => ({ items: [] }));
  const listTokens = vi.fn(async () => ({ items: [] }));
  renderRoute(
    "/users",
    staticSessionSource({ id: "editor-1", role: "editor" }),
    client({ listUsers }),
  );
  await screen.findByRole("heading", { name: "Access denied" });
  expect(listUsers).not.toHaveBeenCalled();
  document.body.replaceChildren();
  renderRoute(
    "/settings",
    staticSessionSource({ id: "viewer-1", role: "viewer" }),
    client({ listTokens }),
  );
  await screen.findByRole("heading", { name: "Access denied" });
  expect(listTokens).not.toHaveBeenCalled();
});
