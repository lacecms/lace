import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { renderRoute, sessionFor, stubClient as client } from "../../../app/testing/index.js";
import type { AdminSession, AdminSessionSource } from "../../../entities/session/index.js";

const thisDevice = {
  browser: "Firefox" as const,
  createdAt: "2026-10-09T12:00:00.000Z",
  current: true,
  id: "session-1",
  lastActiveAt: "2026-10-10T11:59:00.000Z",
  os: "Linux" as const,
};

async function openAccountFromMenu(user: ReturnType<typeof userEvent.setup>) {
  const aside = await screen.findByRole("complementary", { name: "Admin navigation" });
  within(aside)
    .getByRole("button", { name: /account menu/u })
    .focus();
  await user.keyboard("{Enter}");
  await user.click(await screen.findByRole("menuitem", { name: "Account" }));
}

test("a viewer opens Account from the user menu and renames themselves", async () => {
  const user = userEvent.setup();
  let current: AdminSession = sessionFor({ displayName: "Vera", id: "viewer-1", role: "viewer" });
  const source: AdminSessionSource = { get: async () => current, invalidate: () => undefined };
  const listSessions = vi.fn(async () => ({ items: [thisDevice] }));
  const updateProfile = vi.fn(async ({ displayName }: { displayName: string }) => {
    current = sessionFor({ displayName, id: "viewer-1", role: "viewer" });
    return {
      permissions: [...current.permissions],
      user: { displayName, email: current.email, id: "viewer-1", role: "viewer" as const },
    };
  });
  renderRoute("/content", source, client({ listSessions, updateProfile }));
  await openAccountFromMenu(user);

  expect(await screen.findByRole("heading", { name: "Account", level: 1 })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Profile" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Password" })).toBeInTheDocument();
  const sessions = screen.getByRole("region", { name: "Sessions" });
  expect(await within(sessions).findByText("This device")).toBeInTheDocument();
  expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toHaveTextContent("Account");

  const name = screen.getByLabelText("Display name");
  await user.clear(name);
  await user.type(name, "Vera Viewer");
  await user.click(screen.getByRole("button", { name: "Save name" }));
  expect(await screen.findByText("Display name updated.")).toBeInTheDocument();
  const aside = screen.getByRole("complementary", { name: "Admin navigation" });
  await waitFor(() =>
    expect(
      within(aside).getByRole("button", { name: "Vera Viewer, Viewer, account menu" }),
    ).toBeInTheDocument(),
  );
});

test("Account needs no permission beyond a session", async () => {
  const listSessions = vi.fn(async () => ({ items: [thisDevice] }));
  renderRoute(
    "/account",
    {
      get: async () => sessionFor({ id: "ops-1", permissions: [], role: "viewer" }),
      invalidate: () => undefined,
    },
    client({ listSessions }),
  );
  expect(await screen.findByRole("heading", { name: "Account", level: 1 })).toBeInTheDocument();
  expect(screen.queryByText("Access denied")).not.toBeInTheDocument();
  await waitFor(() => expect(listSessions).toHaveBeenCalled());
});

test("anonymous visitors sign in before Account", async () => {
  renderRoute("/account", { get: async () => null, invalidate: () => undefined });
  expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
});
