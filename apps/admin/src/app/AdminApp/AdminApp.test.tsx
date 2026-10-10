import { render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import {
  logOut,
  renderRoute,
  stubClient as client,
  staticSessionSource,
  sessionFor,
} from "../testing/index.js";
import { AdminApp } from "./index.js";
import { type AdminSession, type AdminSessionSource } from "../../entities/session/index.js";
import { AdminClientError } from "../../shared/api/index.js";
import { safeReturnPath } from "../../shared/lib/index.js";

afterEach(() => {
  vi.restoreAllMocks();
});

test("anonymous protected visits show only neutral loading before login redirect", async () => {
  let resolve: (value: null) => void = () => undefined;
  const pending = new Promise<null>((done) => {
    resolve = done;
  });
  const source: AdminSessionSource = {
    get: () => pending,
    invalidate: () => undefined,
  };
  renderRoute("/content/posts/entry-123", source);

  expect(await screen.findByRole("status", { name: "Checking access" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Entry" })).not.toBeInTheDocument();
  resolve(null);
  await waitFor(() => expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument());
  expect(screen.queryByRole("heading", { name: "Entry" })).not.toBeInTheDocument();
});

test("admin root redirects through the session guard and user-menu logout clears the session", async () => {
  const user = userEvent.setup();
  let current: AdminSession | null = sessionFor({ id: "admin-1", role: "admin" });
  const source: AdminSessionSource = { get: async () => current, invalidate: () => undefined };
  const signOut = vi.fn(async () => {
    current = null;
  });
  renderRoute("/", source, client({ signOut }));
  expect(await screen.findByRole("heading", { name: "Content" })).toBeInTheDocument();
  await logOut(user);
  expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  expect(signOut).toHaveBeenCalledOnce();
  document.body.replaceChildren();
  renderRoute("/", staticSessionSource(null));
  expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Content" })).not.toBeInTheDocument();
});

test("typed route foundations render valid paths and reject malformed model keys", async () => {
  renderRoute("/content/posts/entry-123", staticSessionSource({ id: "admin-1", role: "admin" }));
  expect(await screen.findByRole("heading", { name: "Edit posts" })).toBeInTheDocument();

  document.body.replaceChildren();
  renderRoute("/content/INVALID", staticSessionSource({ id: "admin-1", role: "admin" }));
  expect(await screen.findByRole("heading", { name: "Page not found" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Go to Content" })).toHaveAttribute(
    "href",
    "/admin/content",
  );
});

test("unknown paths render not-found inside the shell for signed-in users", async () => {
  const listModels = vi.fn(client().listModels);
  const listUsers = vi.fn(client().listUsers);
  renderRoute(
    "/does-not-exist",
    staticSessionSource({ id: "editor-1", role: "editor" }),
    client({ listModels, listUsers }),
  );
  const heading = await screen.findByRole("heading", { name: "Page not found" });
  const main = screen.getByRole("main");
  expect(main).toContainElement(heading);
  expect(screen.getByRole("complementary", { name: "Admin navigation" })).toBeInTheDocument();
  expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toHaveTextContent(
    "Page not found",
  );
  expect(within(main).getByRole("link", { name: "Go to Content" })).toHaveAttribute(
    "href",
    "/admin/content",
  );
  expect(listUsers).not.toHaveBeenCalled();
});

test("anonymous visitors to unknown paths sign in and return there", async () => {
  const router = renderRoute("/does-not-exist", staticSessionSource(null));
  expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  expect(router.state.location.search).toEqual({ redirect: "/does-not-exist" });
  expect(screen.queryByRole("heading", { name: "Page not found" })).not.toBeInTheDocument();
});

test("safe navigation helpers retain only local return paths", () => {
  expect(safeReturnPath("/content/posts?view=list")).toBe("/content/posts?view=list");
  expect(safeReturnPath("//attacker.test")).toBe("/content");
});

test("an expired-session response removes protected content during recovery", async () => {
  let session: AdminSession | null = sessionFor({ id: "editor-1", role: "editor" });
  const source: AdminSessionSource = {
    get: async () => session,
    invalidate: () => {
      session = null;
    },
  };
  renderRoute(
    "/content",
    source,
    client({
      listModels: async () => {
        throw new AdminClientError({ message: "Session expired", status: 403 });
      },
    }),
  );

  expect(await screen.findByRole("status", { name: "Checking access" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Content" })).not.toBeInTheDocument();
});

test("the application component mounts providers and guards the admin entry", async () => {
  window.history.replaceState(null, "", "/admin/content");
  render(<AdminApp client={client()} sessionSource={staticSessionSource(null)} />);
  expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  expect(window.location.pathname).toBe("/admin/login");
  window.history.replaceState(null, "", "/");
});
