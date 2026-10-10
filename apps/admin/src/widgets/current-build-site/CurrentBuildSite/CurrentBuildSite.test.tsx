import { screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import {
  renderRoute,
  stubClient,
  staticSessionSource,
  sessionFor,
} from "../../../app/testing/index.js";
import { type AdminSessionSource, type AdminSession } from "../../../entities/session/index.js";
import { AdminClientError } from "../../../shared/api/index.js";

test.each(["admin", "editor", "viewer"] as const)(
  "%s sees current configuration with empty history",
  async (role) => {
    renderRoute(
      "/builds",
      staticSessionSource({ id: "user", role }),
      stubClient({
        loadBuildSite: async () => ({ site: { id: "real-site", label: "Real site" } }),
      }),
    );
    const section = await screen.findByRole("region", { name: "Current build site" });
    expect(await within(section).findByText("Real site")).toBeInTheDocument();
    expect(section).toHaveTextContent("real-site");
    expect(await screen.findByRole("region", { name: "No builds yet" })).toBeInTheDocument();
    if (role !== "admin")
      expect(screen.queryByRole("button", { name: "Request build" })).not.toBeInTheDocument();
  },
);
test("identity failure retries independently of build history", async () => {
  let fails = true;
  const loadBuildSite = vi.fn(async () => {
    if (fails) throw new AdminClientError({ message: "Identity unavailable", status: 503 });
    return { site: null };
  });
  renderRoute(
    "/builds",
    staticSessionSource({ id: "user", role: "viewer" }),
    stubClient({ loadBuildSite }),
  );
  const section = await screen.findByRole("region", { name: "Current build site" });
  expect(await within(section).findByRole("alert")).toHaveTextContent("Identity unavailable");
  expect(await screen.findByRole("region", { name: "No builds yet" })).toBeInTheDocument();
  fails = false;
  await userEvent.setup().click(within(section).getByRole("button", { name: "Try again" }));
  expect(
    await within(section).findByText("No build site identity configured."),
  ).toBeInTheDocument();
});
test("Settings identity read stays inside the administrator guard", async () => {
  const loadBuildSite = vi.fn(async () => ({ site: { id: "main", label: "Main" } }));
  renderRoute(
    "/settings",
    staticSessionSource({ id: "user", role: "viewer" }),
    stubClient({ loadBuildSite }),
  );
  expect(await screen.findByRole("heading", { name: "Access denied" })).toBeInTheDocument();
  expect(loadBuildSite).not.toHaveBeenCalled();
});

test("expired identity request clears the protected screen", async () => {
  let current: AdminSession | null = sessionFor({ id: "user", role: "viewer" });
  const source: AdminSessionSource = { get: async () => current, invalidate: () => undefined };
  renderRoute(
    "/builds",
    source,
    stubClient({
      loadBuildSite: async () => {
        current = null;
        throw new AdminClientError({ message: "Session expired", status: 401 });
      },
    }),
  );
  expect(
    await screen.findByRole("heading", { name: "Sign in" }, { timeout: 5000 }),
  ).toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Current build site" })).not.toBeInTheDocument();
});

test("administrator Settings shows the same safe current identity", async () => {
  renderRoute(
    "/settings",
    staticSessionSource({ id: "user", role: "admin" }),
    stubClient({
      loadBuildSite: async () => ({ site: { id: "public-site", label: "Public site" } }),
    }),
  );
  expect(await screen.findByText("Public site")).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Current build site" })).toHaveTextContent(
    "public-site",
  );
});
