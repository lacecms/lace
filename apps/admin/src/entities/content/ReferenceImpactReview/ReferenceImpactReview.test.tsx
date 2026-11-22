import { renderInRouter, stubClient } from "../../../app/testing/index.js";
import { screen, waitFor } from "@testing-library/react";
import { expect, test } from "vitest";
import { ReferenceImpactReview, useReferenceImpactReview } from "./index.js";

function Harness() {
  const review = useReferenceImpactReview("target", "delete", true);
  return (
    <>
      <ReferenceImpactReview review={review} onNavigate={() => {}} />
      <button disabled={!review.ready}>Delete</button>
    </>
  );
}

test("a hidden published occurrence is listed without requiring deletion acknowledgment", async () => {
  renderInRouter(<Harness />, {
    client: stubClient({
      referenceImpact: async () => ({
        mode: "sources",
        hasDraftUsages: false,
        hasPublishedBlockers: false,
        sources: [
          {
            entryId: "source",
            modelKey: "posts",
            phase: "published",
            snapshotId: "published",
            title: "Source",
            locations: [
              { area: "data", sourceKey: "section", pointer: "/author", delivered: false },
            ],
          },
        ],
      }),
    }),
  });
  expect(await screen.findByText(/Hidden in publication/)).toBeVisible();
  expect(screen.getByRole("link", { name: "Block field /author" })).toBeVisible();
  expect(screen.queryByRole("checkbox")).toBeNull();
  await waitFor(() => expect(screen.getByRole("button", { name: "Delete" })).toBeEnabled());
});
