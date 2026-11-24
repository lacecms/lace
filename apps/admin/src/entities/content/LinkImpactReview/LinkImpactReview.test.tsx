import { act, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { useState } from "react";
import { expect, test, vi } from "vitest";
import { renderInRouter, stubClient } from "../../../app/testing/index.js";
import { AdminClientError, type AdminClient } from "../../../shared/api/index.js";
import { LinkImpactReview, useLinkImpactReview } from "./index.js";

function Harness() {
  const [open, setOpen] = useState(true);
  const review = useLinkImpactReview("target", "delete", open);
  return (
    <>
      <button onClick={() => setOpen(!open)}>{open ? "Close review" : "Open review"}</button>
      {open && (
        <>
          <LinkImpactReview review={review} />
          <button disabled={!review.ready}>Remove</button>
        </>
      )}
    </>
  );
}
const source = {
  entryId: "source",
  snapshotId: "published",
  modelKey: "posts",
  title: "Source",
  phase: "published" as const,
  locations: [{ sourceKey: "$fields", area: "fields" as const, pointer: "/url", delivered: true }],
};

test("background refresh binds consent to the current receipt and open review", async () => {
  const user = userEvent.setup();
  let receipt = "first";
  let hasPublishedUsages = true;
  const linkImpact = vi.fn<AdminClient["linkImpact"]>(async () => ({
    mode: "sources",
    sources: hasPublishedUsages ? [{ ...source, title: `Source ${receipt}` }] : [],
    hasPublishedUsages,
    receipt,
  }));
  const { queryClient } = renderInRouter(<Harness />, { client: stubClient({ linkImpact }) });
  const refresh = () =>
    act(async () => queryClient.refetchQueries({ queryKey: ["admin", "link-impact"] }));
  const checkbox = () => screen.getByRole("checkbox");
  const remove = () => screen.getByRole("button", { name: "Remove" });

  await user.click(await screen.findByRole("checkbox"));
  await refresh();
  expect(checkbox()).toBeChecked();
  expect(remove()).toBeEnabled();

  receipt = "second";
  await refresh();
  expect(await screen.findByRole("link", { name: "Source second" })).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent("Incoming links changed");
  expect(checkbox()).not.toBeChecked();
  expect(remove()).toBeDisabled();

  receipt = "first";
  await refresh();
  expect(await screen.findByRole("link", { name: "Source first" })).toBeVisible();
  expect(checkbox()).not.toBeChecked();
  await user.click(checkbox());
  await user.click(screen.getByRole("button", { name: "Close review" }));
  await user.click(screen.getByRole("button", { name: "Open review" }));
  expect(await screen.findByRole("checkbox")).not.toBeChecked();
  await waitFor(() => expect(checkbox()).toBeEnabled());
  await user.click(checkbox());

  receipt = "no-published-links";
  hasPublishedUsages = false;
  await refresh();
  expect(await screen.findByText("No incoming links.")).toBeVisible();
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  expect(remove()).toBeEnabled();
});

test("impact failures never appear as zero usages and published links require an unchecked acknowledgment", async () => {
  const user = userEvent.setup();
  const linkImpact = vi
    .fn()
    .mockRejectedValueOnce(new AdminClientError({ message: "Unavailable" }))
    .mockResolvedValue({
      mode: "sources",
      sources: [source],
      hasPublishedUsages: true,
      receipt: "receipt",
    });
  renderInRouter(<Harness />, { client: stubClient({ linkImpact }) });
  expect(await screen.findByRole("alert")).toHaveTextContent("Unavailable");
  expect(screen.getByRole("button", { name: "Remove" })).toBeDisabled();
  expect(screen.queryByText("No incoming links.")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Retry impact" }));
  const acknowledgment = await screen.findByRole("checkbox");
  expect(acknowledgment).not.toBeChecked();
  await user.click(acknowledgment);
  expect(screen.getByRole("button", { name: "Remove" })).toBeEnabled();
});

test("source and location continuations expose the full view and refresh stale dependency cursors", async () => {
  const user = userEvent.setup();
  let refreshed = false;
  const linkImpact = vi.fn(async (_id, query) => {
    if (query.locationsAfter)
      return {
        mode: "locations" as const,
        locations: [{ ...source.locations[0]!, pointer: "/next" }],
        sourceEntryId: "source",
        snapshotId: "published",
        hasPublishedUsages: true,
        receipt: "receipt",
      };
    if (query.after) {
      refreshed = true;
      throw new AdminClientError({
        code: "CONTENT_LINK_IMPACT_CHANGED",
        message: "Changed",
        status: 409,
      });
    }
    return {
      mode: "sources" as const,
      sources: [{ ...source, nextLocationsCursor: "locations" }],
      hasPublishedUsages: true,
      receipt: refreshed ? "fresh" : "receipt",
      ...(refreshed ? {} : { nextCursor: "sources" }),
    };
  });
  renderInRouter(<Harness />, { client: stubClient({ linkImpact }) });
  await user.click(await screen.findByRole("checkbox"));
  await user.click(screen.getByRole("button", { name: "More locations in Source" }));
  await screen.findByText(/fields\/next/);
  await waitFor(() => expect(screen.getByRole("button", { name: "Remove" })).toBeEnabled());
  await user.click(screen.getByRole("button", { name: "More linked sources" }));
  await screen.findByText("Incoming links changed. Review the current impact again.");
  await waitFor(() => expect(screen.getByRole("checkbox")).not.toBeChecked());
  expect(screen.getByRole("button", { name: "Remove" })).toBeDisabled();
});

test.each(["source", "location"] as const)(
  "a %s continuation with a different receipt restarts the review",
  async (continuation) => {
    const user = userEvent.setup();
    let restart = false;
    const linkImpact = vi.fn<AdminClient["linkImpact"]>(async (_entryId, query) => {
      if (query.locationsAfter) {
        restart = true;
        return {
          mode: "locations",
          sourceEntryId: source.entryId,
          snapshotId: source.snapshotId,
          locations: [{ ...source.locations[0]!, pointer: "/mixed-location" }],
          hasPublishedUsages: true,
          receipt: "other",
        };
      }
      if (query.after) {
        restart = true;
        return {
          mode: "sources",
          sources: [{ ...source, snapshotId: "other", title: "Mixed source" }],
          hasPublishedUsages: true,
          receipt: "other",
        };
      }
      return {
        mode: "sources",
        sources: restart
          ? [{ ...source, title: "Restarted source" }]
          : [{ ...source, nextLocationsCursor: "more-locations" }],
        hasPublishedUsages: true,
        receipt: "first",
        ...(restart ? {} : { nextCursor: "more-sources" }),
      };
    });
    renderInRouter(<Harness />, { client: stubClient({ linkImpact }) });
    await user.click(await screen.findByRole("checkbox"));
    await user.click(
      screen.getByRole("button", {
        name: continuation === "source" ? "More linked sources" : "More locations in Source",
      }),
    );
    expect(await screen.findByRole("link", { name: "Restarted source" })).toBeVisible();
    expect(screen.queryByText(/Mixed source|mixed-location/)).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Incoming links changed");
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Remove" })).toBeDisabled();
  },
);

test("a late location response cannot join a refreshed source review", async () => {
  const user = userEvent.setup();
  let receipt = "first";
  const pending = Promise.withResolvers<Awaited<ReturnType<AdminClient["linkImpact"]>>>();
  const linkImpact = vi.fn<AdminClient["linkImpact"]>(async (_entryId, query) => {
    if (query.locationsAfter) return pending.promise;
    return {
      mode: "sources",
      sources: [{ ...source, title: `Source ${receipt}`, nextLocationsCursor: "more-locations" }],
      hasPublishedUsages: true,
      receipt,
    };
  });
  const { queryClient } = renderInRouter(<Harness />, { client: stubClient({ linkImpact }) });
  await user.click(await screen.findByRole("checkbox"));
  const remove = screen.getByRole("button", { name: "Remove" });
  await user.click(screen.getByRole("button", { name: "More locations in Source first" }));
  expect(await screen.findByText("Loading locations…")).toBeVisible();
  expect(remove).toBeDisabled();

  receipt = "second";
  await act(async () => queryClient.refetchQueries({ queryKey: ["admin", "link-impact"] }));
  expect(await screen.findByRole("link", { name: "Source second" })).toBeVisible();
  await user.click(screen.getByRole("checkbox"));
  await act(async () => {
    pending.resolve({
      mode: "locations",
      sourceEntryId: source.entryId,
      snapshotId: source.snapshotId,
      locations: [{ ...source.locations[0]!, pointer: "/late-location" }],
      hasPublishedUsages: true,
      receipt: "first",
    });
    await pending.promise;
  });
  expect(screen.queryByText(/late-location/)).not.toBeInTheDocument();
  expect(remove).toBeEnabled();
  expect(linkImpact).toHaveBeenCalledTimes(3);
});

test("a location read failure blocks removal until the same review recovers", async () => {
  const user = userEvent.setup();
  let failed = false;
  const linkImpact = vi.fn<AdminClient["linkImpact"]>(async (_entryId, query) => {
    if (!query.locationsAfter)
      return {
        mode: "sources",
        sources: [{ ...source, nextLocationsCursor: "more-locations" }],
        hasPublishedUsages: true,
        receipt: "first",
      };
    if (!failed) {
      failed = true;
      throw new AdminClientError({ message: "Locations unavailable." });
    }
    return {
      mode: "locations",
      sourceEntryId: source.entryId,
      snapshotId: source.snapshotId,
      locations: [{ ...source.locations[0]!, pointer: "/recovered" }],
      hasPublishedUsages: true,
      receipt: "first",
    };
  });
  renderInRouter(<Harness />, { client: stubClient({ linkImpact }) });
  await user.click(await screen.findByRole("checkbox"));
  const remove = screen.getByRole("button", { name: "Remove" });
  await user.click(screen.getByRole("button", { name: "More locations in Source" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Locations unavailable.");
  expect(remove).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Retry locations" }));
  expect(await screen.findByText(/fields\/recovered/)).toBeVisible();
  expect(screen.getByRole("checkbox")).toBeChecked();
  expect(remove).toBeEnabled();
});
