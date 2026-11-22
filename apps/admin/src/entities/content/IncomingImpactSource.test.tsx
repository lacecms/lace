import { renderInRouter, stubClient } from "../../app/testing/index.js";
import { screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { AdminClientError } from "../../shared/api/index.js";
import { IncomingImpactSource } from "./IncomingImpactSource.js";

test("a stale location continuation asks the reference review to refresh", async () => {
  const user = userEvent.setup();
  const onChanged = vi.fn();
  const referenceImpact = vi.fn(async () => {
    throw new AdminClientError({
      code: "CONTENT_REFERENCE_IMPACT_CHANGED",
      message: "Changed",
      status: 409,
    });
  });
  renderInRouter(
    <ul>
      <IncomingImpactSource
        action="delete"
        entryId="target"
        onChanged={onChanged}
        purpose="reference"
        reportLocations={() => {}}
        source={{
          entryId: "source",
          modelKey: "posts",
          phase: "published",
          snapshotId: "published",
          title: "Source",
          locations: [],
          nextLocationsCursor: "next",
        }}
      />
    </ul>,
    { client: stubClient({ referenceImpact }) },
  );
  await user.click(await screen.findByRole("button", { name: "More locations in Source" }));
  await waitFor(() => expect(onChanged).toHaveBeenCalled());
  expect(referenceImpact).toHaveBeenCalledExactlyOnceWith(
    "target",
    {
      action: "delete",
      sourceEntryId: "source",
      snapshotId: "published",
      locationsAfter: "next",
      limit: 50,
    },
    expect.any(AbortSignal),
  );
});
