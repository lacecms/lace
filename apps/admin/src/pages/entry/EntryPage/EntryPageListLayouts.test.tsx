import {
  builtInBlocks,
  defineBlock,
  field,
  listLayoutSettings,
  listLayoutSettingsVisibility,
  toBlockMetadata,
} from "@lacecms/content";
import type { AdminContentEntryDto, ContentModelDto } from "@lacecms/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import {
  draftEntry,
  renderRoute,
  stubClient,
  staticSessionSource,
} from "../../../app/testing/index.js";
import { AdminClientError, type AdminClient } from "../../../shared/api/index.js";

const settings = { layoutMode: "grid", layoutWrap: true, layoutPreset: "auto", lightbox: false };
const custom = defineBlock({
  type: "cards",
  version: 1,
  fields: {},
  settings: listLayoutSettings(),
  settingsVisibility: listLayoutSettingsVisibility(),
});
const model: ContentModelDto = {
  key: "posts",
  kind: "collection",
  route: "/posts/:slug",
  version: 1,
  blocks: ["gallery", "cards"],
  blockDefinitions: [toBlockMetadata(builtInBlocks.gallery), toBlockMetadata(custom)],
  fields: {
    nested: field.list({
      item: field.group({ fields: { pick: listLayoutSettings().layoutMode } }),
    }),
  },
};
const initial = {
  ...draftEntry,
  draft: {
    ...draftEntry.draft,
    slug: "stable",
    fields: { nested: [{ pick: "grid" }] },
    blocks: [
      {
        key: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
        type: "gallery",
        schemaVersion: 4,
        position: 1000,
        hidden: false,
        data: { images: [] },
        settings,
      },
    ],
  },
};
function open(
  saveDraft?: AdminClient["saveDraft"],
  role: "editor" | "viewer" | "admin" = "editor",
  extra: Partial<AdminClient> = {},
) {
  return renderRoute(
    "/content/posts/entry-1",
    staticSessionSource({ id: "user-1", role }),
    stubClient({
      listModels: async () => ({ items: [model] }),
      loadEntry: async () => structuredClone(initial),
      ...(saveDraft ? { saveDraft } : {}),
      ...extra,
    }),
  );
}
async function openSettings(user: ReturnType<typeof userEvent.setup>) {
  const block = await screen.findByRole("article");
  await user.click(within(block).getByRole("tab", { name: "Settings" }));
  return block;
}
test("Gallery settings retain inactive scalars, save ordinary payloads and keep independent nested cards", async () => {
  const user = userEvent.setup();
  const save = vi.fn<AdminClient["saveDraft"]>(
    async (_id, input) =>
      ({ ...initial, draft: { ...initial.draft, ...input, revision: 3 } }) as never,
  );
  open(save);
  const block = await openSettings(user);
  await user.click(within(block).getByRole("radio", { name: "Three columns" }));
  await user.click(within(block).getByRole("radio", { name: "Horizontal" }));
  await user.click(within(block).getByRole("switch", { name: "Wrap items" }));
  expect(within(block).queryByRole("radio", { name: "Three columns" })).not.toBeInTheDocument();
  await user.click(within(block).getByRole("radio", { name: "Grid" }));
  expect(within(block).queryByRole("switch", { name: "Wrap items" })).not.toBeInTheDocument();
  expect(within(block).getByRole("radio", { name: "Three columns" })).toBeChecked();
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  await screen.findByText("Saved revision 3");
  expect(save.mock.calls[0]![1].blocks[0]!.settings).toEqual({
    ...settings,
    layoutWrap: false,
    layoutPreset: "columns-3",
  });
  expect(save.mock.calls[0]![1].fields).toEqual(initial.draft.fields);
  expect(JSON.stringify(save.mock.calls[0]![1])).not.toMatch(/presentation|diagram|choices/);
  expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
});
test("a conflict retains selected cards and reload restores stored settings", async () => {
  const user = userEvent.setup();
  const save = vi.fn<AdminClient["saveDraft"]>(async () => {
    throw new AdminClientError({
      code: "CONTENT_REVISION_CONFLICT",
      status: 409,
      message: "Conflict",
    });
  });
  open(save);
  const block = await openSettings(user);
  await user.click(within(block).getByRole("radio", { name: "Vertical" }));
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  expect(within(block).getByRole("radio", { name: "Vertical" })).toBeChecked();
  await user.click(await screen.findByRole("button", { name: "Reload server draft" }));
  await waitFor(() =>
    expect(within(screen.getByRole("article")).getByRole("radio", { name: "Grid" })).toBeChecked(),
  );
}, 15000);
test("viewer reads layout text without radio controls", async () => {
  open(undefined, "viewer");
  const block = await screen.findByRole("article");
  expect(within(block).getByText("Items use the selected grid preset.")).toBeVisible();
  expect(within(block).queryByRole("radio")).not.toBeInTheDocument();
});

test("summary focus reveals nested list cards and the selected radio", async () => {
  const { focusProblemTarget } = await import("../EntryValidationSummary/index.js");
  const user = userEvent.setup();
  open();
  await screen.findByRole("article");
  const expand = screen.getByRole("button", { name: /Expand.*item 1/i });
  await user.click(expand);
  const fields = screen.getByRole("region", { name: "Fields" });
  const group = within(fields).getByRole("radiogroup", { name: "Arrangement" });
  await user.click(within(group).getByRole("radio", { name: "Horizontal" }));
  await user.click(screen.getByRole("button", { name: /Collapse.*item 1/i }));
  focusProblemTarget({ kind: "control", id: "field-fields-nested-0-pick" });
  expect(within(fields).getByRole("radio", { name: "Horizontal" })).toHaveFocus();
  expect(within(fields).getByRole("radio", { name: "Horizontal" })).toBeVisible();
});

test("hidden layout values survive block duplication and movement", async () => {
  const user = userEvent.setup();
  const save = vi.fn<AdminClient["saveDraft"]>(
    async (_id, input) =>
      ({ ...initial, draft: { ...initial.draft, ...input, revision: 3 } }) as never,
  );
  open(save);
  const block = await openSettings(user);
  await user.click(within(block).getByRole("radio", { name: "Three columns" }));
  await user.click(within(block).getByRole("radio", { name: "Horizontal" }));
  await user.click(within(block).getByRole("switch", { name: "Wrap items" }));
  const actions = within(block).getByRole("button", { name: "Actions for Gallery block" });
  actions.focus();
  await user.keyboard("{Enter}");
  await user.click(screen.getByRole("menuitem", { name: "Duplicate" }));
  await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(2));
  const first = screen.getAllByRole("article")[0]!;
  within(first).getByRole("button", { name: "Actions for Gallery block" }).focus();
  await user.keyboard("{Enter}");
  await user.click(screen.getByRole("menuitem", { name: "Move down" }));
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  expect(save.mock.calls[0]![1].blocks.map((block) => block.settings)).toEqual(
    [0, 1].map(() => ({
      ...settings,
      layoutMode: "flex-row",
      layoutWrap: false,
      layoutPreset: "columns-3",
    })),
  );
}, 15000);

test("server error reveals an inactive setting and summary opens/focuses its control", async () => {
  const user = userEvent.setup();
  open(async () => {
    throw new AdminClientError({
      code: "VALIDATION_FAILED",
      status: 422,
      message: "Rejected",
      issues: [
        {
          code: "invalid_value",
          message: "Invalid stored wrap",
          path: "/blocks/0/settings/layoutWrap",
        },
      ],
    });
  });
  const block = await openSettings(user);
  await user.type(screen.getByRole("textbox", { name: "Title" }), " local");
  expect(within(block).queryByRole("switch", { name: "Wrap items" })).not.toBeInTheDocument();
  await user.click(within(block).getByRole("tab", { name: "Content" }));
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  await user.click(await screen.findByRole("link", { name: "Wrap items in Gallery block 1" }));
  const wrap = within(block).getByRole("switch", { name: "Wrap items" });
  expect(wrap).toHaveFocus();
  expect(wrap).toHaveAccessibleDescription(/Shown to resolve.*Invalid stored wrap/);
  expect(within(block).getByRole("radio", { name: "Grid" })).toBeChecked();
  await user.click(wrap);
  await waitFor(() =>
    expect(within(block).queryByRole("switch", { name: "Wrap items" })).not.toBeInTheDocument(),
  );
}, 15000);

test("revert restores inactive settings from the published snapshot", async () => {
  const user = userEvent.setup();
  const published = {
    ...initial.draft,
    id: "published",
    state: "published" as const,
    revision: 1,
    blocks: [
      {
        ...initial.draft.blocks[0]!,
        settings: {
          ...settings,
          layoutMode: "flex-column",
          layoutWrap: false,
          layoutPreset: "featured-first",
        },
      },
    ],
  };
  const reverted = {
    ...initial,
    published,
    draft: { ...initial.draft, blocks: published.blocks, revision: 3 },
  };
  const revertEntry = vi.fn<AdminClient["revertEntry"]>(async () => reverted);
  open(undefined, "admin", {
    loadEntry: async () => structuredClone({ ...initial, published }),
    revertEntry,
  });
  const menu = await screen.findByRole("button", { name: "Entry actions" });
  menu.focus();
  await user.keyboard("{Enter}");
  await user.click(await screen.findByRole("menuitem", { name: "Revert to published" }));
  await user.click(
    within(await screen.findByRole("dialog", { name: "Revert to published?" })).getByRole(
      "button",
      { name: "Revert to published" },
    ),
  );
  await waitFor(() => expect(revertEntry).toHaveBeenCalledOnce());
  const block = await openSettings(user);
  expect(within(block).getByRole("radio", { name: "Vertical" })).toBeChecked();
  expect(within(block).getByRole("switch", { name: "Wrap items" })).not.toBeChecked();
  expect(within(block).queryByRole("radio", { name: "Featured first" })).not.toBeInTheDocument();
  await user.click(within(block).getByRole("radio", { name: "Grid" }));
  expect(within(block).getByRole("radio", { name: "Featured first" })).toBeChecked();
}, 15000);

test("save and publish carries the inactive preset through the ordinary lifecycle", async () => {
  const user = userEvent.setup();
  let saved: AdminContentEntryDto = initial;
  const saveDraft = vi.fn<AdminClient["saveDraft"]>(async (_id, input) => {
    saved = {
      ...initial,
      draft: {
        ...initial.draft,
        title: input.title,
        slug: input.slug ?? initial.draft.slug,
        blocks: [...input.blocks],
        revision: 3,
      },
    };
    return saved;
  });
  const publishEntry = vi.fn<AdminClient["publishEntry"]>(
    async () =>
      ({
        build: { status: "queued", targetVersion: 1 },
        entry: { ...saved, published: { ...saved.draft, id: "published", state: "published" } },
        publication: "published",
      }) as never,
  );
  open(saveDraft, "admin", { publishEntry });
  const block = await openSettings(user);
  await user.click(within(block).getByRole("radio", { name: "Three columns" }));
  await user.click(within(block).getByRole("radio", { name: "Vertical" }));
  await user.click(screen.getByRole("button", { name: "Save and publish" }));
  await user.click(
    within(await screen.findByRole("dialog", { name: "Save and publish this entry?" })).getByRole(
      "button",
      { name: "Save and publish" },
    ),
  );
  await waitFor(() => expect(publishEntry).toHaveBeenCalledOnce());
  expect(saved.draft.blocks[0]!.settings).toEqual({
    ...settings,
    layoutMode: "flex-column",
    layoutPreset: "columns-3",
  });
  expect(publishEntry).toHaveBeenCalledWith(
    "entry-1",
    expect.objectContaining({ expectedRevision: 3 }),
  );
  expect(within(block).queryByRole("radio", { name: "Three columns" })).not.toBeInTheDocument();
}, 15000);

test("discarding navigation retains inactive choices on Stay and leaves without saving", async () => {
  const user = userEvent.setup();
  const saveDraft = vi.fn<AdminClient["saveDraft"]>();
  const router = open(saveDraft);
  const block = await openSettings(user);
  await user.click(within(block).getByRole("radio", { name: "Three columns" }));
  await user.click(within(block).getByRole("radio", { name: "Horizontal" }));
  const content = within(screen.getByRole("complementary", { name: "Admin navigation" })).getByRole(
    "link",
    { name: "Content" },
  );
  await user.click(content);
  await user.click(await screen.findByRole("button", { name: "Stay" }));
  await user.click(within(block).getByRole("radio", { name: "Grid" }));
  expect(within(block).getByRole("radio", { name: "Three columns" })).toBeChecked();
  await user.click(content);
  await user.click(await screen.findByRole("button", { name: "Leave without saving" }));
  await waitFor(() => expect(router.state.location.pathname).toBe("/content"));
  expect(saveDraft).not.toHaveBeenCalled();
}, 15000);
