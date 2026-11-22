import { renderInRouter, stubClient } from "../../../app/testing/index.js";
import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { WhereUsedButton } from "./index.js";

test("read-only impact review omits acknowledgment and returns focus to its trigger", async () => {
  const user = userEvent.setup();
  const referenceImpact = vi.fn(async () => ({
    mode: "sources" as const,
    hasDraftUsages: true,
    hasPublishedBlockers: false,
    sources: [],
    receipt: "receipt",
  }));
  renderInRouter(<WhereUsedButton entryId="entry" title="A review" disabled={false} />, {
    client: stubClient({ referenceImpact }),
    session: { id: "viewer", role: "viewer" },
  });
  const trigger = await screen.findByRole("button", { name: "Where used" });
  await user.click(trigger);
  const dialog = within(screen.getByRole("dialog", { name: "Where used" }));
  await waitFor(() =>
    expect(referenceImpact).toHaveBeenCalledExactlyOnceWith(
      "entry",
      { action: "delete" },
      expect.any(AbortSignal),
    ),
  );
  expect(dialog.queryByRole("checkbox")).toBeNull();
  await user.click(dialog.getByRole("button", { name: /^Close$/u }));
  await waitFor(() => expect(trigger).toHaveFocus());
});
