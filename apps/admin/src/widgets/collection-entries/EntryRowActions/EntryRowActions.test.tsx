import type { ContentEntrySummaryDto } from "@lacecms/contracts";
import { screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, test } from "vitest";
import { entry, renderInRouter } from "../../../app/testing/index.js";
import { EntryRowActions } from "./index.js";

const publishedRow: ContentEntrySummaryDto = {
  ...entry,
  publishedAt: "2026-09-20T00:00:00.000Z",
  publishedSnapshotId: "published-1",
  status: "published",
};

async function items(row: ContentEntrySummaryDto, canPublish: boolean) {
  const user = userEvent.setup();
  renderInRouter(<EntryRowActions canPublish={canPublish} entry={row} modelKey="posts" />);
  // Radix opens menus on pointer down; the keyboard path is deterministic in jsdom.
  (await screen.findByRole("button", { name: `Actions for ${row.title}` })).focus();
  await user.keyboard("{Enter}");
  return within(await screen.findByRole("menu"))
    .getAllByRole("menuitem")
    .map((item) => item.textContent);
}

test.each([
  ["a draft row without publish permission", entry, false, ["Open", "Duplicate", "Delete"]],
  ["a published row without publish permission", publishedRow, false, ["Open", "Duplicate"]],
  ["a published row with publish permission", publishedRow, true, ["Open", "Duplicate", "Delete"]],
] as const)("%s", async (_name, row, canPublish, expected) => {
  expect(await items(row, canPublish)).toEqual(expected);
});

test("Open links to the entry editor", async () => {
  await items(entry, false);
  expect(screen.getByRole("menuitem", { name: "Open" })).toHaveAttribute(
    "href",
    "/content/posts/entry-1",
  );
});
