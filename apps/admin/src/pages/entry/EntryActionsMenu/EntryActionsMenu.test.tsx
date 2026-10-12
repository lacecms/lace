import type { AdminContentEntryDto, ContentModelDto } from "@lacecms/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { draftEntry, renderInRouter, stubClient } from "../../../app/testing/index.js";
import type { AdminClient } from "../../../shared/api/index.js";
import { EntryActionsMenu } from "./index.js";

const posts: ContentModelDto = {
  blocks: [],
  fields: {},
  key: "posts",
  kind: "collection",
  route: "/posts/:slug",
  version: 1,
};
const about: ContentModelDto = {
  blocks: [],
  fields: {},
  key: "about",
  kind: "page",
  path: "/about",
  version: 1,
};

const settings: ContentModelDto = {
  blocks: [],
  fields: {},
  key: "settings",
  kind: "global",
  label: "Site settings",
  version: 1,
};

function published(revision: number, draftRevision = revision): AdminContentEntryDto {
  return {
    ...draftEntry,
    draft: { ...draftEntry.draft, revision: draftRevision, slug: "first-post" },
    published: {
      ...draftEntry.draft,
      id: "published-1",
      revision,
      slug: "first-post",
      state: "published",
    },
  };
}

function mount({
  canPublish,
  canWrite,
  client = stubClient(),
  entry = draftEntry,
  model = posts,
  unsavedChanges = false,
}: {
  readonly canPublish: boolean;
  readonly canWrite: boolean;
  readonly client?: AdminClient;
  readonly entry?: AdminContentEntryDto;
  readonly model?: ContentModelDto;
  readonly unsavedChanges?: boolean;
}) {
  const handlers = {
    onDeleted: vi.fn(),
    onDiscardUnsaved: vi.fn(),
    onDuplicate: vi.fn(),
    onReload: vi.fn(),
    onReverted: vi.fn(),
    onUnpublished: vi.fn(),
  };
  renderInRouter(
    <EntryActionsMenu
      busy={false}
      canPublish={canPublish}
      canWrite={canWrite}
      entry={entry}
      model={model}
      unsavedChanges={unsavedChanges}
      {...handlers}
    />,
    { client },
  );
  return handlers;
}

async function menuItems(user: ReturnType<typeof userEvent.setup>) {
  // Radix opens menus on pointer down; the keyboard path is deterministic in jsdom.
  (await screen.findByRole("button", { name: "Entry actions" })).focus();
  await user.keyboard("{Enter}");
  return within(screen.getByRole("menu"))
    .getAllByRole("menuitem")
    .map((item) => item.textContent);
}

test.each([
  [
    "admin, published collection entry with saved changes",
    true,
    true,
    published(2, 3),
    posts,
    false,
    ["Duplicate", "Revert to published", "Unpublish", "Delete"],
  ],
  ["editor, published collection entry", false, true, published(2), posts, false, ["Duplicate"]],
  [
    "editor, draft-only collection entry",
    false,
    true,
    draftEntry,
    posts,
    false,
    ["Duplicate", "Delete"],
  ],
  [
    "admin, published page",
    true,
    true,
    { ...published(2), model: { key: "about", kind: "page", path: "/about" } },
    about,
    false,
    ["Unpublish"],
  ],
  [
    "editor, published entry with unsaved changes",
    false,
    true,
    published(2),
    posts,
    true,
    ["Duplicate", "Revert to published"],
  ],
  [
    "admin, published global with saved changes",
    true,
    true,
    { ...published(2, 3), model: { key: "settings", kind: "global" } },
    settings,
    false,
    ["Revert to published", "Unpublish"],
  ],
  [
    "editor, published global",
    false,
    true,
    { ...published(2), model: { key: "settings", kind: "global" } },
    settings,
    false,
    ["No actions available for this entry"],
  ],
  [
    "admin, unpublished page",
    true,
    true,
    { ...draftEntry, model: { key: "about", kind: "page", path: "/about" } },
    about,
    false,
    ["No actions available for this entry"],
  ],
] as const)("%s", async (_name, canPublish, canWrite, entry, model, unsavedChanges, expected) => {
  const user = userEvent.setup();
  mount({ canPublish, canWrite, entry, model, unsavedChanges });
  expect(await menuItems(user)).toEqual(expected);
});

test("viewers get no menu", async () => {
  mount({ canPublish: false, canWrite: false });
  await screen.findByText((_, node) => node === document.body);
  expect(screen.queryByRole("button", { name: "Entry actions" })).not.toBeInTheDocument();
});

test("a cancelled confirmation returns focus to the menu button", async () => {
  const user = userEvent.setup();
  const unpublishEntry = vi.fn();
  mount({
    canPublish: true,
    canWrite: true,
    client: stubClient({ unpublishEntry }),
    entry: published(2),
  });
  await menuItems(user);
  await user.click(screen.getByRole("menuitem", { name: "Unpublish" }));
  const dialog = await screen.findByRole("dialog", { name: "Unpublish this entry?" });
  expect(dialog).toHaveAccessibleDescription(/Its public path \/posts\/first-post stops working/u);
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.getByRole("button", { name: "Entry actions" })).toHaveFocus();
  expect(unpublishEntry).not.toHaveBeenCalled();
});

test("duplicate runs directly and delete names the published consequence", async () => {
  const user = userEvent.setup();
  const handlers = mount({ canPublish: true, canWrite: true, entry: published(2) });
  await menuItems(user);
  await user.click(screen.getByRole("menuitem", { name: "Duplicate" }));
  expect(handlers.onDuplicate).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await menuItems(user);
  await user.click(screen.getByRole("menuitem", { name: "Delete" }));
  const dialog = await screen.findByRole("dialog", { name: "Delete entry?" });
  expect(
    within(dialog).getByRole("textbox", { name: "Type “First post” to confirm" }),
  ).toBeInTheDocument();
});
