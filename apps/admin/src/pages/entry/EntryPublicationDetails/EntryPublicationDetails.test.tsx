import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import type { SiteBuildRecordDto } from "@lacecms/contracts";
import { draftEntry, models, renderInRouter, stubClient } from "../../../app/testing/index.js";
import { AdminClientError } from "../../../shared/api/index.js";
import { EntryPublicationDetails } from "./index.js";

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

test("publication details read in plain language without IDs or ISO timestamps", async () => {
  const updatedAt = minutesAgo(5);
  const publishedAt = minutesAgo(120);
  renderInRouter(
    <EntryPublicationDetails
      entry={{
        ...draftEntry,
        draft: { ...draftEntry.draft, revision: 4, slug: "draft-post", updatedAt },
        published: {
          ...draftEntry.draft,
          id: "published-1",
          revision: 3,
          slug: "published-post",
          state: "published",
          updatedAt: publishedAt,
        },
        updatedBy: { displayName: "Ada Lovelace", id: "editor-1" },
      }}
      latestBuild={undefined}
      model={models.items[1]!}
    />,
  );
  const region = await screen.findByRole("region", { name: "Publication status" });
  expect(region).toHaveTextContent(/^PublicationChanged/u);
  expect(region).toHaveTextContent("LiveRevision 3 · published 2 hours ago");
  expect(region).toHaveTextContent("DraftRevision 4");
  expect(region).toHaveTextContent("Last editedAda Lovelace · 5 minutes ago");
  expect(region).toHaveTextContent("/posts/published-post");
  expect(region).toHaveTextContent("No build requested from this editor.");
  expect(within(region).getByRole("link", { name: "View builds" })).toHaveAttribute(
    "href",
    "/builds",
  );
  expect(region).not.toHaveTextContent("editor-1");
  expect(region).not.toHaveTextContent(updatedAt);
  expect(region.querySelector(`time[datetime="${updatedAt}"]`)).toHaveAttribute("title");
});

function build(overrides: Partial<SiteBuildRecordDto>): SiteBuildRecordDto {
  return {
    id: "build-1",
    reason: "publication",
    requestedAt: new Date().toISOString(),
    requestedBy: "admin-1",
    status: "pending",
    targetVersion: 4,
    ...overrides,
  };
}

function renderQueued(client = stubClient(), targetVersion = 4) {
  return renderInRouter(
    <EntryPublicationDetails
      entry={{ ...draftEntry, model: { key: "home", kind: "page", path: "/" } }}
      latestBuild={{ status: "queued", targetVersion }}
      model={models.items[0]!}
    />,
    { client },
  );
}

test("an unpublished entry and a requested build are described without claiming success", async () => {
  renderQueued(stubClient({ listBuilds: async () => ({ items: [] }) }));
  const region = await screen.findByRole("region", { name: "Publication status" });
  expect(region).toHaveTextContent(/^PublicationDraft/u);
  expect(region).toHaveTextContent("LiveNot published");
  expect(await within(region).findByRole("status")).toHaveTextContent(
    "Published. Build for version 4 is queued and not yet recorded.",
  );
  expect(within(region).getByRole("link", { name: "View builds" })).toHaveAttribute(
    "href",
    "/builds",
  );
});

test("a covering build is followed from pending to succeeded with the current site label", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    const listBuilds = vi
      .fn()
      .mockResolvedValueOnce({ items: [build({ targetVersion: 3, status: "succeeded" })] })
      .mockResolvedValueOnce({ items: [build({ targetVersion: 5 })] })
      .mockResolvedValue({ items: [build({ targetVersion: 5, status: "succeeded" })] });
    renderQueued(
      stubClient({
        listBuilds,
        loadBuildSite: async () => ({ site: { id: "main-site", label: "Main site" } }),
      }),
    );
    const status = await screen.findByText(/Build for version 4 of Main site/u);
    expect(status).toHaveTextContent(
      "Published. Build for version 4 of Main site is queued and not yet recorded.",
    );
    await vi.advanceTimersByTimeAsync(5_000);
    expect(
      await screen.findByText(
        "Published. Build for version 4 of Main site is pending (queued or waiting for a retry).",
      ),
    ).toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(
      await screen.findByText("Published. Build for version 4 of Main site succeeded."),
    ).toBeInTheDocument();
    const calls = listBuilds.mock.calls.length;
    await vi.advanceTimersByTimeAsync(15_000);
    expect(listBuilds).toHaveBeenCalledTimes(calls);
  } finally {
    vi.useRealTimers();
  }
});

test("a failed covering build keeps the previous release and links to Builds", async () => {
  renderQueued(stubClient({ listBuilds: async () => ({ items: [build({ status: "failed" })] }) }));
  expect(
    await screen.findByText(
      "Published. Build for version 4 failed; the previous release stays served.",
    ),
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "View builds" })).toHaveAttribute("href", "/builds");
});

test("an accepted covering build is terminal and explains that acceptance is not publication", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    const listBuilds = vi.fn(async () => ({
      items: [build({ providerBuildId: "dep-1", status: "accepted" })],
    }));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderQueued(stubClient({ listBuilds }));
    expect(
      await screen.findByText(
        "Published. Build for version 4 was accepted by the provider; Lace has not confirmed the site changed.",
      ),
    ).toBeInTheDocument();
    const calls = listBuilds.mock.calls.length;
    await vi.advanceTimersByTimeAsync(15_000);
    expect(listBuilds).toHaveBeenCalledTimes(calls);
    await user.click(screen.getByRole("button", { name: "About the Accepted status" }));
    const popover = await screen.findByRole("dialog", { name: "Accepted" });
    expect(popover).toHaveTextContent("Lace has not confirmed that the public site changed.");
  } finally {
    vi.useRealTimers();
  }
});

test("unavailable build history keeps the dispatch result", async () => {
  const listBuilds = vi.fn(async () => {
    throw new AdminClientError({ message: "The Lace API could not be reached." });
  });
  renderQueued(stubClient({ listBuilds }));
  await waitFor(() => expect(listBuilds).toHaveBeenCalled());
  expect(await screen.findByRole("status")).toHaveTextContent("Published. Build pending.");
  expect(screen.getByRole("link", { name: "View builds" })).toBeInTheDocument();
});

test("a publication that requested no build says so", async () => {
  renderInRouter(
    <EntryPublicationDetails
      entry={draftEntry}
      latestBuild={{ status: "not-dispatched" }}
      model={models.items[1]!}
    />,
  );
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Publication was already accepted; no new build was requested.",
  );
});
