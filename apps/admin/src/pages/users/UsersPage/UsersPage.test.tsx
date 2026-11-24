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

test("admin user screen lists accounts, invites users, and keeps confirmed state on rejection", async () => {
  const user = userEvent.setup();
  const soleAdmin = {
    disabled: false,
    email: "admin@lace.test",
    id: "admin-1",
    role: "admin" as const,
  };
  const activeEditor = {
    disabled: false,
    email: "eddie@lace.test",
    id: "editor-1",
    role: "editor" as const,
  };
  const disabledViewer = {
    disabled: true,
    email: "viewer@lace.test",
    id: "viewer-1",
    role: "viewer" as const,
  };
  const invitation = {
    createdAt: "2026-10-01T00:00:00.000Z",
    email: "new@lace.test",
    expiresAt: "2026-10-04T00:00:00.000Z",
    id: "invitation-1",
    invitedBy: "Ada Admin",
    role: "viewer" as const,
    state: "pending" as const,
  };
  let invitations: (typeof invitation)[] = [];
  const listUsers = vi.fn(async () => ({
    items: [soleAdmin, activeEditor, disabledViewer],
    total: 3,
    disabledCount: 1,
  }));
  const listInvitations = vi.fn(async () => ({ items: invitations }));
  const createInvitation = vi.fn(async () => {
    invitations = [invitation];
    return { delivery: { status: "sent" as const }, invitation };
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
    client({ createInvitation, listInvitations, listUsers, updateUser }),
  );
  const table = await screen.findByRole("table", { name: "Users" });
  expect(screen.getByText("3 accounts · 1 disabled")).toBeInTheDocument();
  const adminRow = within(table).getByRole("row", { name: /admin@lace\.test/u });
  expect(adminRow).toHaveTextContent("You");
  expect(adminRow).toHaveTextContent("Admin");
  expect(adminRow).toHaveTextContent("Active");
  expect(
    within(adminRow)
      .getAllByRole("button")
      .map((button) => button.textContent),
  ).toEqual(["Change role"]);
  const editorRow = within(table).getByRole("row", { name: /eddie@lace\.test/u });
  expect(
    within(editorRow)
      .getAllByRole("button")
      .map((button) => button.textContent),
  ).toEqual(["Change role", "Send password reset", "Sign out everywhere", "Disable"]);
  const viewerRow = within(table).getByRole("row", { name: /viewer@lace\.test/u });
  expect(viewerRow).toHaveTextContent("Disabled");
  expect(
    within(viewerRow)
      .getAllByRole("button")
      .map((button) => button.textContent),
  ).toEqual(["Enable"]);
  expect(table).not.toHaveTextContent("admin-1");
  expect(await screen.findByText("No pending invitations.")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Invite user" }));
  const dialog = await screen.findByRole("dialog", { name: "Invite user" });
  expect(within(dialog).queryByLabelText(/password/iu)).not.toBeInTheDocument();
  await user.type(within(dialog).getByLabelText("Email"), "new@lace.test");
  await user.click(within(dialog).getByRole("button", { name: "Send invitation" }));
  await waitFor(() =>
    expect(createInvitation).toHaveBeenCalledWith({ email: "new@lace.test", role: "viewer" }),
  );
  expect(await screen.findByText("Invitation sent to new@lace.test.")).toBeInTheDocument();
  const pending = await screen.findByRole("table", { name: "Pending invitations" });
  expect(within(pending).getByRole("row", { name: /new@lace\.test/u })).toHaveTextContent(
    "Pending",
  );

  await user.click(screen.getByRole("button", { name: "Change role for admin@lace.test" }));
  const roleDialog = await screen.findByRole("dialog", { name: "Change role" });
  await user.click(within(roleDialog).getByRole("combobox", { name: "Role" }));
  await user.click(await screen.findByRole("option", { name: "Editor" }));
  await user.click(within(roleDialog).getByRole("button", { name: "Save role" }));
  expect(await within(roleDialog).findByRole("alert")).toHaveTextContent(
    "At least one active administrator with a password must remain.",
  );
  await user.keyboard("{Escape}");
  expect(within(table).getByRole("row", { name: /admin@lace\.test/u })).toHaveTextContent("Admin");
  expect(listUsers).toHaveBeenCalledTimes(1);
  expect(listInvitations).toHaveBeenCalledTimes(2);
});

test("a failed invitation list offers Try again beside the users", async () => {
  const user = userEvent.setup();
  let fail = true;
  const listInvitations = vi.fn(async () => {
    if (fail) throw new AdminClientError({ message: "Invitations unavailable.", status: 503 });
    return { items: [] };
  });
  renderRoute(
    "/users",
    staticSessionSource({ id: "admin-1", role: "admin" }),
    client({
      listInvitations,
      listUsers: async () => ({
        items: [{ disabled: false, email: "admin@lace.test", id: "admin-1", role: "admin" }],
        total: 1,
        disabledCount: 0,
      }),
    }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("Invitations unavailable.");
  expect(screen.getByRole("table", { name: "Users" })).toBeInTheDocument();
  fail = false;
  await user.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("No pending invitations.")).toBeInTheDocument();
});

test("a failed user list offers Try again", async () => {
  const user = userEvent.setup();
  let fail = true;
  const listUsers = vi.fn(async () => {
    if (fail) throw new AdminClientError({ message: "Users unavailable.", status: 503 });
    return { items: [], total: 0, disabledCount: 0 };
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

test("new active accounts refresh the list and totals while the handoff stays open", async () => {
  const user = userEvent.setup();
  const created = { disabled: false, email: "new@lace.test", id: "new", role: "viewer" } as const;
  const link = `https://lace.test/admin/reset-password#token=${"B".repeat(43)}`;
  let hasAccount = false;
  renderRoute(
    "/users",
    staticSessionSource({ id: "admin-1", role: "admin" }),
    client({
      createUser: async () => {
        hasAccount = true;
        return { delivery: { status: "failed", reason: "not_configured" }, link, user: created };
      },
      listUsers: async () => ({
        items: hasAccount ? [created] : [],
        total: Number(hasAccount),
        disabledCount: 0,
      }),
    }),
  );
  expect(await screen.findByRole("button", { name: "Invite user" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Create user" }));
  const form = screen.getByRole("dialog", { name: "Create user" });
  await user.type(within(form).getByLabelText("Email"), created.email);
  await user.click(within(form).getByRole("button", { name: "Create user" }));
  const handoff = await screen.findByRole("dialog", { name: "Share the first-password link" });
  expect(await screen.findByText("1 account")).toBeInTheDocument();
  expect(screen.getByText(created.email, { exact: true })).toBeInTheDocument();
  expect(handoff).toHaveTextContent(link);
  await user.click(within(handoff).getByRole("button", { name: "Done" }));
  const row = screen.getByRole("row", { name: /new@lace\.test/u });
  expect(row).toHaveTextContent("Active");
  expect(within(row).getByRole("button", { name: /Send password reset/u })).toBeInTheDocument();
});

test("an expired session while submitting direct creation returns to sign-in", async () => {
  const user = userEvent.setup();
  let current: AdminSession | null = sessionFor({ id: "admin-1", role: "admin" });
  renderRoute(
    "/users",
    { get: async () => current, invalidate: () => undefined },
    client({
      createUser: async () => {
        current = null;
        throw new AdminClientError({ message: "Session expired", status: 401 });
      },
    }),
  );
  await user.click(await screen.findByRole("button", { name: "Create user" }));
  const form = screen.getByRole("dialog", { name: "Create user" });
  await user.type(within(form).getByLabelText("Email"), "new@lace.test");
  await user.click(within(form).getByRole("button", { name: "Create user" }));
  expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
});

test("non-admin management routes issue no protected requests", async () => {
  const listUsers = vi.fn(async () => ({ items: [], total: 0, disabledCount: 0 }));
  const listInvitations = vi.fn(async () => ({ items: [] }));
  const listTokens = vi.fn(async () => ({ items: [] }));
  renderRoute(
    "/users",
    staticSessionSource({ id: "editor-1", role: "editor" }),
    client({ listInvitations, listUsers }),
  );
  await screen.findByRole("heading", { name: "Access denied" });
  expect(screen.queryByRole("button", { name: "Create user" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Invite user" })).not.toBeInTheDocument();
  expect(listUsers).not.toHaveBeenCalled();
  expect(listInvitations).not.toHaveBeenCalled();
  document.body.replaceChildren();
  renderRoute(
    "/settings",
    staticSessionSource({ id: "viewer-1", role: "viewer" }),
    client({ listTokens }),
  );
  await screen.findByRole("heading", { name: "Access denied" });
  expect(listTokens).not.toHaveBeenCalled();
});

test("user and invitation pages advance independently and keep server totals and actions", async () => {
  const user = userEvent.setup();
  const admin = {
    disabled: false,
    email: "admin@lace.test",
    id: "admin-1",
    role: "admin" as const,
  };
  const viewer = {
    disabled: true,
    email: "viewer@lace.test",
    id: "viewer-1",
    role: "viewer" as const,
  };
  const invitation = {
    createdAt: "2026-10-01T00:00:00.000Z",
    expiresAt: "2026-10-04T00:00:00.000Z",
    id: "first",
    email: "first@lace.test",
    invitedBy: "Admin",
    role: "viewer" as const,
    state: "pending" as const,
  };
  const later = { ...invitation, id: "later", email: "later@lace.test" };
  let revoked = false;
  const listUsers = vi.fn(async (after?: string) =>
    after === undefined
      ? { items: [admin], total: 2, disabledCount: 1, nextCursor: "user-page" }
      : { items: [viewer], total: 2, disabledCount: 1 },
  );
  const listInvitations = vi.fn(async (after?: string) =>
    after === undefined
      ? { items: [invitation], ...(revoked ? {} : { nextCursor: "invitation-page" }) }
      : { items: [later] },
  );
  const revokeInvitation = vi.fn(async () => {
    revoked = true;
  });
  renderRoute(
    "/users",
    staticSessionSource({ id: admin.id, role: "admin" }),
    client({
      listUsers,
      listInvitations,
      revokeInvitation,
    }),
  );
  expect(await screen.findByText("2 accounts · 1 disabled")).toBeInTheDocument();
  expect(screen.queryByText(viewer.email)).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Load more users" }));
  expect(await screen.findByText(viewer.email)).toBeInTheDocument();
  expect(listUsers).toHaveBeenLastCalledWith("user-page");
  expect(listInvitations.mock.calls).toEqual([[undefined]]);
  await user.click(screen.getByRole("button", { name: "Load more invitations" }));
  await user.click(
    await screen.findByRole("button", { name: `Revoke invitation for ${later.email}` }),
  );
  const dialog = await screen.findByRole("dialog", { name: "Revoke invitation?" });
  await user.click(within(dialog).getByRole("button", { name: "Revoke invitation" }));
  await waitFor(() =>
    expect(screen.queryByText(later.email, { selector: "td" })).not.toBeInTheDocument(),
  );
  expect(revokeInvitation).toHaveBeenCalledWith(later.id);
  expect(listInvitations.mock.calls).toEqual([[undefined], ["invitation-page"], [undefined]]);
  expect(screen.getByText(viewer.email)).toBeInTheDocument();
});
