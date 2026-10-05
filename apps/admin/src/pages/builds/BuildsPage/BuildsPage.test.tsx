import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { renderRoute, stubClient } from "../../../app/testing/index.js";
import { createStaticSessionSource } from "../../../entities/session/index.js";
import { AdminClientError } from "../../../shared/api/index.js";

const failed = {
  id: "build-1",
  reason: "publication",
  status: "failed" as const,
  targetVersion: 4,
  requestedBy: "admin-1",
  requestedAt: "2026-09-27T00:00:00.000Z",
  startedAt: "2026-09-27T00:00:05.000Z",
  completedAt: "2026-09-27T00:00:06.000Z",
  providerBuildId: "provider-1",
  error: "provider_failed" as const,
};

test("admin inspects and retries a failed build", async () => {
  const user = userEvent.setup();
  const retryBuild = vi.fn(async () => ({
    coalesced: false,
    eventId: "event-2",
    targetVersion: 4,
  }));
  renderRoute(
    "/builds",
    createStaticSessionSource({ id: "admin-1", role: "admin" }),
    stubClient({
      listBuilds: async () => ({ items: [failed] }),
      getBuild: async () => failed,
      retryBuild,
    }),
  );
  const table = await screen.findByRole("table", { name: "Build history" });
  expect(table).toHaveTextContent("v4");
  await user.click(within(table).getByRole("button", { name: "View build for version 4" }));
  const detail = await screen.findByRole("region", { name: "Build details" });
  expect(detail).toHaveTextContent("provider-1");
  expect(detail).toHaveTextContent("The build provider failed.");
  expect(detail).toHaveTextContent("admin-1");
  await user.click(within(detail).getByRole("button", { name: "Retry build" }));
  await waitFor(() => expect(retryBuild).toHaveBeenCalledWith("build-1"));
  expect(await screen.findByRole("status")).toHaveTextContent("version 4 queued");
});

test("viewer can inspect history without build controls", async () => {
  const user = userEvent.setup();
  renderRoute(
    "/builds",
    createStaticSessionSource({ id: "viewer-1", role: "viewer" }),
    stubClient({
      listBuilds: async () => ({ items: [failed] }),
      getBuild: async () => failed,
    }),
  );
  await user.click(await screen.findByRole("button", { name: "View build for version 4" }));
  expect(await screen.findByText("provider-1")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Retry build" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Request build" })).not.toBeInTheDocument();
});

test("a successful build shows completion without a retry action", async () => {
  const user = userEvent.setup();
  const succeeded = { ...failed, status: "succeeded" as const, error: undefined };
  renderRoute(
    "/builds",
    createStaticSessionSource({ id: "admin-1", role: "admin" }),
    stubClient({
      listBuilds: async () => ({ items: [succeeded] }),
      getBuild: async () => succeeded,
    }),
  );
  await user.click(await screen.findByRole("button", { name: "View build for version 4" }));
  const detail = await screen.findByRole("region", { name: "Build details" });
  expect(within(detail).getByText("Succeeded")).toBeInTheDocument();
  expect(within(detail).getByText("provider-1")).toBeInTheDocument();
  expect(within(detail).queryByRole("button", { name: "Retry build" })).not.toBeInTheDocument();
});

test("empty history can queue a build and a failed read can recover", async () => {
  const user = userEvent.setup();
  let fails = true;
  const listBuilds = vi.fn(async () => {
    if (fails) throw new AdminClientError({ message: "Builds unavailable", status: 503 });
    return { items: [] };
  });
  renderRoute(
    "/builds",
    createStaticSessionSource({ id: "admin-1", role: "admin" }),
    stubClient({ listBuilds }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("Builds unavailable");
  fails = false;
  await user.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByRole("region", { name: "No builds yet" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Request build" }));
  expect(await screen.findByRole("status")).toHaveTextContent("version 0 queued");
});

test("every role sees verified publication visibility guidance without deployment claims", async () => {
  for (const role of ["admin", "editor", "viewer"] as const) {
    renderRoute(
      "/builds",
      createStaticSessionSource({ id: `${role}-1`, role }),
      stubClient({ listBuilds: async () => ({ items: [] }) }),
    );
    const section = await screen.findByRole("region", {
      name: "When published content becomes visible",
    });
    expect(section).toHaveTextContent("Saving a draft never changes the site");
    expect(section).toHaveTextContent("Reload to see published changes to existing pages.");
    expect(section).toHaveTextContent("Restart dev for new or renamed URLs.");
    expect(section).toHaveTextContent("deploy its output yourself");
    expect(section).toHaveTextContent("A failed build keeps the previous release.");
    expect(section).toHaveTextContent("does not confirm Astro dev or a manual deployment");
    expect(within(section).queryByRole("button")).not.toBeInTheDocument();
    document.body.replaceChildren();
  }
});

test.each(["admin", "editor", "viewer"] as const)(
  "%s sees pending source correction and correlation without retry",
  async (role) => {
    const user = userEvent.setup();
    const pending = {
      ...failed,
      status: "pending" as const,
      error: "source_symlink" as const,
      errorPath: "src/linked.astro",
    };
    renderRoute(
      "/builds",
      createStaticSessionSource({ id: `${role}-1`, role }),
      stubClient({ listBuilds: async () => ({ items: [pending] }), getBuild: async () => pending }),
    );
    await user.click(await screen.findByRole("button", { name: "View build for version 4" }));
    const detail = await screen.findByRole("region", { name: "Build details" });
    expect(detail).toHaveTextContent("build-1");
    expect(detail).toHaveTextContent("src/linked.astro");
    expect(detail).toHaveTextContent("Replace the included link");
    expect(detail).toHaveTextContent("An automatic retry is scheduled.");
    expect(within(detail).queryByRole("link")).not.toBeInTheDocument();
    expect(within(detail).queryByRole("button", { name: "Retry build" })).not.toBeInTheDocument();
  },
);

test("every closed reason has an explanation and correction", async () => {
  const { buildFailureGuidance } = await import("./build-failure.js");
  const { buildFailureReasonSchema } = await import("@lacecms/contracts");
  expect(Object.keys(buildFailureGuidance)).toEqual(
    expect.arrayContaining([...buildFailureReasonSchema.options]),
  );
  for (const value of Object.values(buildFailureGuidance)) {
    expect(value.explanation.length).toBeGreaterThan(10);
    expect(value.correction.length).toBeGreaterThan(20);
  }
});

test.each([
  ["source_invalid", "Check the source, project and output selection"],
  ["source_symlink", "Replace the included link"],
  ["source_unreadable", "Restore read access"],
  ["source_missing", "Restore the required entry"],
  ["source_special_file", "replace it with a regular file"],
  ["install_failed", "root frozen lockfile"],
  ["build_failed", "Run the selected Astro build locally"],
  ["version_changed", "latest published version"],
  ["trigger_unavailable", "deployment credentials"],
  ["build_timeout", "build duration"],
  ["invalid_build_event", "matched engine versions"],
  ["provider_failed", "using the build ID"],
] as const)(
  "%s shows an actionable correction without inventing a path",
  async (error, correction) => {
    const user = userEvent.setup();
    const build = { ...failed, error };
    renderRoute(
      "/builds",
      createStaticSessionSource({ id: "admin-1", role: "admin" }),
      stubClient({ listBuilds: async () => ({ items: [build] }), getBuild: async () => build }),
    );
    await user.click(await screen.findByRole("button", { name: "View build for version 4" }));
    const detail = await screen.findByRole("region", { name: "Build details" });
    expect(detail).toHaveTextContent(correction);
    expect(detail).not.toHaveTextContent("Source entry:");
  },
);
