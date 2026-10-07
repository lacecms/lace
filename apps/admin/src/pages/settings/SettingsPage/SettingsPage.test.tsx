import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { renderRoute, stubClient as client } from "../../../app/testing/index.js";
import { createStaticSessionSource } from "../../../entities/session/index.js";
import { AdminClientError } from "../../../shared/api/index.js";

afterEach(() => {
  vi.restoreAllMocks();
});

const token = {
  capabilities: ["content:build:read"] as ["content:build:read"],
  createdAt: "2026-09-20T00:00:00.000Z",
  id: "token-1",
  name: "Local",
  tokenPrefix: "lace_123",
};

test("settings shows status cards, issues a once-shown token, and keeps metadata on revoke failure", async () => {
  const user = userEvent.setup();
  let items: (typeof token & { revokedAt?: string })[] = [];
  const createToken = vi.fn(async () => {
    items = [token];
    return { ...token, token: "only-once-secret" };
  });
  const revokeToken = vi.fn(async () => {
    throw new AdminClientError({ message: "Revocation failed", status: 500 });
  });
  const router = renderRoute(
    "/settings",
    createStaticSessionSource({ id: "admin-1", role: "admin" }),
    client({
      createToken,
      listTokens: async () => ({ items }),
      loadSettingsStatus: async () => ({
        configuredModels: 2,
        engineVersion: "0.1.0-alpha.4",
        ready: true,
      }),
      revokeToken,
    }),
  );
  const api = await screen.findByRole("group", { name: "API" });
  await waitFor(() => expect(api).toHaveTextContent("Ready"));
  expect(screen.getByRole("group", { name: "Content models" })).toHaveTextContent("2");
  expect(await screen.findByRole("region", { name: "No build tokens" })).toBeInTheDocument();
  expect(screen.getByRole("group", { name: "Active build tokens" })).toHaveTextContent("0");

  await user.click(screen.getByRole("button", { name: "Create build token" }));
  await user.type(screen.getByLabelText("Token name"), "Local");
  await user.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "Create build token" }),
  );
  const shown = await screen.findByRole("dialog", { name: "Copy your build token" });
  expect(within(shown).getByText("only-once-secret")).toBeInTheDocument();
  // The refreshed list replaces the empty state without closing the dialog.
  // The modal hides the page from the accessibility tree while it is open.
  expect(
    await screen.findByRole("table", { hidden: true, name: "Build tokens" }),
  ).toBeInTheDocument();
  expect(screen.getByText("only-once-secret")).toBeInTheDocument();
  await user.click(within(shown).getByRole("button", { name: "Done" }));
  await waitFor(() => expect(screen.queryByText("only-once-secret")).not.toBeInTheDocument());
  expect(screen.getByRole("group", { name: "Active build tokens" })).toHaveTextContent("1");

  const table = screen.getByRole("table", { name: "Build tokens" });
  expect(table).toHaveTextContent("lace_123…");
  expect(table).toHaveTextContent("Never");
  expect(table).not.toHaveTextContent("2026-09-20T");
  expect(table.querySelector("time")).toHaveAttribute("title");
  await user.click(screen.getByRole("button", { name: "Revoke Local" }));
  const dialog = await screen.findByRole("dialog", { name: "Revoke build token?" });
  await user.click(within(dialog).getByRole("button", { name: "Revoke token" }));
  expect(await within(dialog).findByText("Revocation failed")).toBeInTheDocument();
  await user.keyboard("{Escape}");
  expect(within(table).getByText("Active")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Create build token" }));
  await user.type(screen.getByLabelText("Token name"), "Another");
  await user.keyboard("{Enter}");
  expect(await screen.findByText("only-once-secret")).toBeInTheDocument();
  await router.navigate({ to: "/content" });
  await screen.findByRole("heading", { name: "Content" });
  await router.navigate({ to: "/settings" });
  await screen.findByRole("heading", { name: "Settings" });
  expect(screen.queryByText("only-once-secret")).not.toBeInTheDocument();
});

test("failed status and token reads offer Try again", async () => {
  const user = userEvent.setup();
  let fail = true;
  const loadSettingsStatus = vi.fn(async () => {
    if (fail) throw new AdminClientError({ message: "Status unavailable.", status: 503 });
    return { configuredModels: 1, engineVersion: "0.1.0-alpha.4", ready: false };
  });
  renderRoute(
    "/settings",
    createStaticSessionSource({ id: "admin-1", role: "admin" }),
    client({ loadSettingsStatus }),
  );
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("Status unavailable.");
  fail = false;
  await user.click(within(alert).getByRole("button", { name: "Try again" }));
  await waitFor(() =>
    expect(screen.getByRole("group", { name: "API" })).toHaveTextContent("Not ready"),
  );
  expect(loadSettingsStatus).toHaveBeenCalledTimes(2);
});

test("viewers see access denied without settings or token requests", async () => {
  const loadSettingsStatus = vi.fn(async () => ({
    configuredModels: 0,
    engineVersion: "0.1.0-alpha.4",
    ready: true,
  }));
  const listTokens = vi.fn(async () => ({ items: [] }));
  renderRoute(
    "/settings",
    createStaticSessionSource({ id: "viewer-1", role: "viewer" }),
    client({ listTokens, loadSettingsStatus }),
  );
  expect(await screen.findByRole("region", { name: "Access denied" })).toHaveTextContent(
    "Your role does not have permission",
  );
  expect(screen.getByRole("link", { name: "Go to Content" })).toBeInTheDocument();
  expect(loadSettingsStatus).not.toHaveBeenCalled();
  expect(listTokens).not.toHaveBeenCalled();
});

test("refresh replaces the server-confirmed release", async () => {
  let engineVersion = "0.1.0-alpha.4";
  renderRoute(
    "/settings",
    createStaticSessionSource({ id: "admin-1", role: "admin" }),
    client({
      loadSettingsStatus: async () => ({ configuredModels: 0, engineVersion, ready: true }),
    }),
  );
  const card = await screen.findByRole("group", { name: "CMS version" });
  await waitFor(() => expect(card).toHaveTextContent(engineVersion));
  engineVersion = "0.1.0-alpha.5";
  await userEvent.setup().click(screen.getByRole("button", { name: "Refresh status" }));
  await waitFor(() => expect(card).toHaveTextContent(engineVersion));
});

test("expired status session removes the protected version and returns to sign-in", async () => {
  let expired = false;
  const source = {
    get: async () => (expired ? null : { id: "admin-1", role: "admin" as const }),
    invalidate() {},
  };
  renderRoute(
    "/settings",
    source,
    client({
      loadSettingsStatus: async () => {
        if (expired)
          throw new AdminClientError({
            code: "AUTHORIZATION_DENIED",
            status: 403,
            message: "Session expired",
          });
        return { configuredModels: 0, engineVersion: "0.1.0-alpha.4", ready: true };
      },
    }),
  );
  await screen.findByText("0.1.0-alpha.4");
  expired = true;
  await userEvent.setup().click(screen.getByRole("button", { name: "Refresh status" }));
  await screen.findByRole("button", { name: /^Sign in$/u });
  expect(screen.queryByText("0.1.0-alpha.4")).not.toBeInTheDocument();
});
