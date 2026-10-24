import { screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { renderInRouter, stubClient } from "../../../app/testing/index.js";
import { AdminClientError } from "../../../shared/api/index.js";
import { LinkImpactReview, useLinkImpactReview } from "./index.js";

function Harness() {
  const review = useLinkImpactReview("target", "delete", true);
  return (
    <>
      <LinkImpactReview review={review} />
      <button disabled={!review.ready}>Remove</button>
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
