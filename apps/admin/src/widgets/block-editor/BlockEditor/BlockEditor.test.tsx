import { screen, waitFor, within } from "@testing-library/react";
import { userEvent, type UserEvent } from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { builtInBlocks, toBlockMetadata } from "@lacecms/content";
import type { ContentModelDto } from "@lacecms/contracts";
import {
  addBlock,
  draftEntry,
  models,
  renderRoute,
  stubClient as client,
  staticSessionSource,
} from "../../../app/testing/index.js";
import { AdminClientError, type AdminClient } from "../../../shared/api/index.js";

afterEach(() => {
  vi.restoreAllMocks();
});

// Radix menus open from the keyboard in jsdom; pointer opening needs real pointer events.
async function blockAction(user: UserEvent, trigger: HTMLElement, action: string) {
  trigger.focus();
  await user.keyboard("{Enter}");
  await user.click(screen.getByRole("menuitem", { name: action }));
}

test("entry editor authors ordered blocks, selects media, and adopts server positions", async () => {
  const user = userEvent.setup();
  const model: ContentModelDto = {
    blockDefinitions: [
      {
        defaultValue: { heading: "New hero" },
        fields: {
          heading: { required: true, type: "text" },
          image: { required: false, type: "media" },
        },
        label: "Hero",
        type: "hero",
        version: 1,
      },
      {
        fields: { quote: { required: true, type: "text" } },
        label: "Quote",
        type: "quote",
        version: 1,
      },
    ],
    blocks: ["hero", "quote"],
    fields: { richBody: { required: false, type: "richText" } },
    key: "posts",
    kind: "collection",
    route: "/posts/:slug",
    version: 1,
  };
  const saveDraftMock = vi.fn(
    async (_entryId: string, input: Parameters<AdminClient["saveDraft"]>[1]) => ({
      ...draftEntry,
      draft: {
        ...draftEntry.draft,
        ...input,
        blocks: input.blocks.map((block, index) => ({ ...block, position: (index + 1) * 100 })),
        revision: 3,
      },
    }),
  );
  const saveDraft = saveDraftMock as unknown as AdminClient["saveDraft"];
  renderRoute(
    "/content/posts/entry-1",
    staticSessionSource({ id: "editor-1", role: "editor" }),
    client({
      listMedia: async () => ({
        items: [
          {
            createdAt: "2026-09-20T00:00:00.000Z",
            createdBy: { displayName: "editor@lace.test", id: "editor-1" },
            filename: "cover.png",
            id: "media-1",
            mimeType: "image/png",
            size: 12,
            status: "active",
            updatedAt: "2026-09-20T00:00:00.000Z",
            url: "https://lace.test/api/v1/public/media/media-1",
            usageCount: 0,
          },
        ],
      }),
      listModels: async () => ({ items: [models.items[0]!, model] }) as never,
      saveDraft,
    }),
  );

  await screen.findByRole("heading", { name: "Edit posts" });
  expect(screen.getByRole("textbox", { name: "Rich Body" })).toBeInTheDocument();
  expect(screen.queryByRole("textbox", { name: /json/i })).not.toBeInTheDocument();
  await addBlock(user, "Hero");
  await user.click(screen.getByRole("button", { name: "Choose media for Image" }));
  await user.click(
    await within(screen.getByRole("dialog", { name: "Choose media for Image" })).findByRole(
      "button",
      { name: "cover.png" },
    ),
  );
  expect(
    await screen.findByRole("button", { name: "Replace media for Image" }),
  ).toBeInTheDocument();
  expect(screen.getByText("cover.png")).toBeInTheDocument();
  await blockAction(
    user,
    screen.getByRole("button", { name: "Actions for Hero block" }),
    "Duplicate",
  );
  expect(screen.getAllByRole("heading", { name: "Hero" })).toHaveLength(2);
  const cards = screen.getAllByRole("article", { name: "Hero" });
  expect(cards[1]).toHaveFocus();
  expect(cards[1]).toHaveAttribute("data-active", "true");
  expect(cards[0]).not.toHaveAttribute("data-active");
  await addBlock(user, "Quote");
  await blockAction(
    user,
    screen.getByRole("button", { name: "Actions for Quote block" }),
    "Move up",
  );
  await user.click(screen.getAllByRole("button", { name: "Collapse Hero block" })[0]!);
  expect(screen.getByRole("button", { name: "Expand Hero block" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  expect(screen.getAllByRole("article")[0]).toHaveTextContent("New hero");
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(saveDraftMock).toHaveBeenCalledTimes(1));
  const saved = saveDraftMock.mock.calls[0]![1];
  expect(saved.blocks).toHaveLength(3);
  expect(saved.blocks.map((block) => block.type)).toEqual(["hero", "quote", "hero"]);
  expect(saved.blocks.filter((block) => block.data.image === "media-1")).toHaveLength(2);
  expect(saved.blocks.every((block) => /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/u.test(block.key))).toBe(
    true,
  );
  expect(await screen.findByText("Saved revision 3")).toBeInTheDocument();
}, 15_000);

test("server block validation stays on the nested editable block field", async () => {
  const user = userEvent.setup();
  const model: ContentModelDto = {
    blockDefinitions: [
      { fields: { heading: { required: true, type: "text" } }, type: "hero", version: 1 },
    ],
    blocks: ["hero"],
    fields: {},
    key: "posts",
    kind: "collection",
    route: "/posts/:slug",
    version: 1,
  };
  const existingBlock = {
    data: { heading: "Original" },
    key: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
    position: 100,
    hidden: false,
    schemaVersion: 1,
    settings: {},
    type: "hero",
  };
  renderRoute(
    "/content/posts/entry-1",
    staticSessionSource({ id: "editor-1", role: "editor" }),
    client({
      listModels: async () => ({ items: [models.items[0]!, model] }) as never,
      loadEntry: async () => ({
        ...draftEntry,
        draft: { ...draftEntry.draft, blocks: [existingBlock] },
      }),
      saveDraft: async () => {
        throw new AdminClientError({
          issues: [
            {
              code: "invalid_value",
              message: "Heading is unavailable.",
              path: "/blocks/0/data/heading",
            },
          ],
          message: "The draft was rejected.",
          status: 422,
        });
      },
    }),
  );
  await screen.findByRole("heading", { name: "Edit posts" });
  await user.clear(screen.getByLabelText("Heading"));
  await user.type(screen.getByLabelText("Heading"), "Retain me");
  await user.click(screen.getByRole("button", { name: "Collapse Hero block" }));
  expect(screen.getByLabelText("Heading")).not.toBeVisible();
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  expect(
    await screen.findByText("Heading is unavailable.", {
      selector: "#field-blocks-0-data-heading-error",
    }),
  ).toHaveAttribute("role", "alert");
  expect(screen.getByRole("link", { name: "Heading in Hero block 1" })).toBeInTheDocument();
  expect(screen.getByLabelText("Heading")).toHaveValue("Retain me");
  expect(screen.getByLabelText("Heading")).toBeVisible();
  expect(screen.queryByRole("button", { name: /Collapse Hero block/u })).not.toBeInTheDocument();
});

const cardModel: ContentModelDto = {
  blockDefinitions: [
    {
      description: "Large heading with optional text, image, and action.",
      fields: { heading: { required: true, type: "text" } },
      label: "Hero",
      type: "hero",
      version: 1,
    },
    {
      defaultValue: { quote: "Less, but better." },
      description: "A quotation with optional attribution.",
      fields: { quote: { required: true, type: "text" } },
      label: "Quote",
      type: "quote",
      version: 1,
    },
  ],
  blocks: ["hero", "quote"],
  fields: {},
  key: "posts",
  kind: "collection",
  route: "/posts/:slug",
  version: 1,
};

const existingBlocks = [
  { data: { heading: "First" }, key: "01ARZ3NDEKTSV4RRFFQ69G5FA1", position: 100, type: "hero" },
  { data: { heading: "Second" }, key: "01ARZ3NDEKTSV4RRFFQ69G5FA2", position: 200, type: "hero" },
  { data: { heading: "Third" }, key: "01ARZ3NDEKTSV4RRFFQ69G5FA3", position: 300, type: "hero" },
].map((block) => ({ ...block, hidden: false, schemaVersion: 1, settings: {} }));

function mountCards() {
  const saveDraft = vi.fn(
    async (_entryId: string, input: Parameters<AdminClient["saveDraft"]>[1]) => ({
      ...draftEntry,
      draft: {
        ...draftEntry.draft,
        ...input,
        blocks: input.blocks.map((block, index) => ({ ...block, position: (index + 1) * 100 })),
        revision: 3,
      },
    }),
  );
  renderRoute(
    "/content/posts/entry-1",
    staticSessionSource({ id: "editor-1", role: "editor" }),
    client({
      listModels: async () => ({ items: [models.items[0]!, cardModel] }) as never,
      loadEntry: async () => ({
        ...draftEntry,
        draft: { ...draftEntry.draft, blocks: existingBlocks },
      }),
      saveDraft: saveDraft as unknown as AdminClient["saveDraft"],
    }),
  );
  return saveDraft;
}

const savedHeadings = (saveDraft: ReturnType<typeof mountCards>) =>
  saveDraft.mock.calls[0]![1].blocks.map((block) => block.data.heading ?? block.data.quote);

test("inserts a filtered block between two blocks at that position", async () => {
  const user = userEvent.setup();
  const saveDraft = mountCards();
  await screen.findByRole("heading", { name: "Edit posts" });
  expect(screen.getAllByRole("article")[1]).toHaveTextContent("Second");
  await user.click(screen.getByRole("button", { name: "Insert block at position 2" }));
  const dialog = screen.getByRole("dialog", { name: "Add block" });
  await user.type(within(dialog).getByRole("searchbox", { name: "Filter blocks" }), "gallery");
  expect(within(dialog).getByRole("status")).toHaveTextContent("No blocks match “gallery”.");
  await user.clear(within(dialog).getByRole("searchbox", { name: "Filter blocks" }));
  await user.type(within(dialog).getByRole("searchbox", { name: "Filter blocks" }), "quotation");
  await user.click(within(dialog).getByRole("button", { name: "Quote" }));
  const inserted = screen.getAllByRole("article")[1]!;
  expect(inserted).toHaveAccessibleName("Quote");
  expect(inserted).toHaveFocus();
  expect(inserted).toHaveTextContent("Less, but better.");
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(saveDraft).toHaveBeenCalledTimes(1));
  expect(savedHeadings(saveDraft)).toEqual(["First", "Less, but better.", "Second", "Third"]);
});

test("undo restores a removed block with its key and data at its position", async () => {
  const user = userEvent.setup();
  const saveDraft = mountCards();
  await screen.findByRole("heading", { name: "Edit posts" });
  const second = screen.getAllByRole("textbox", { name: "Heading" })[1]!;
  await user.clear(second);
  await user.type(second, "Second edited");
  await blockAction(
    user,
    screen.getAllByRole("button", { name: "Actions for Hero block" })[1]!,
    "Remove",
  );
  expect(screen.getAllByRole("article")).toHaveLength(2);
  expect(screen.getByText("Removed Hero block.").closest("[role=status]")).not.toBeNull();
  const undo = screen.getByRole("button", { name: "Undo" });
  expect(undo).toHaveFocus();
  await user.keyboard("{Enter}");
  expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
  const restored = screen.getAllByRole("article")[1]!;
  expect(restored).toHaveFocus();
  expect(within(restored).getByRole("textbox", { name: "Heading" })).toHaveValue("Second edited");
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(saveDraft).toHaveBeenCalledTimes(1));
  const saved = saveDraft.mock.calls[0]![1].blocks;
  expect(saved.map((block) => block.key)).toEqual(existingBlocks.map((block) => block.key));
  expect(saved[1]!.data.heading).toBe("Second edited");
});

test("a later block action makes a removal final and dismiss returns focus", async () => {
  const user = userEvent.setup();
  const saveDraft = mountCards();
  await screen.findByRole("heading", { name: "Edit posts" });
  await blockAction(
    user,
    screen.getAllByRole("button", { name: "Actions for Hero block" })[0]!,
    "Remove",
  );
  await addBlock(user, "Quote");
  expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
  await blockAction(
    user,
    screen.getAllByRole("button", { name: "Actions for Hero block" })[0]!,
    "Remove",
  );
  await user.click(screen.getByRole("button", { name: "Dismiss" }));
  expect(screen.getByRole("button", { name: "Add block" })).toHaveFocus();
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(saveDraft).toHaveBeenCalledTimes(1));
  expect(savedHeadings(saveDraft)).toEqual(["Third", "Less, but better."]);
});

test("the active highlight follows the block being edited", async () => {
  const user = userEvent.setup();
  mountCards();
  await screen.findByRole("heading", { name: "Edit posts" });
  const cards = screen.getAllByRole("article");
  await user.click(within(cards[2]!).getByRole("textbox", { name: "Heading" }));
  expect(cards[2]).toHaveAttribute("data-active", "true");
  await user.click(within(cards[0]!).getByRole("textbox", { name: "Heading" }));
  expect(cards[0]).toHaveAttribute("data-active", "true");
  expect(cards[2]).not.toHaveAttribute("data-active");
});

test("a block whose type the model no longer allows renders with its error and can be removed", async () => {
  const user = userEvent.setup();
  const saveDraft = vi.fn(
    async (_entryId: string, input: Parameters<AdminClient["saveDraft"]>[1]) => ({
      ...draftEntry,
      draft: { ...draftEntry.draft, ...input, revision: 3 },
    }),
  );
  renderRoute(
    "/content/posts/entry-1",
    staticSessionSource({ id: "editor-1", role: "editor" }),
    client({
      listModels: async () => ({ items: [models.items[0]!, cardModel] }) as never,
      loadEntry: async () => ({
        ...draftEntry,
        draft: {
          ...draftEntry.draft,
          blocks: [
            existingBlocks[0]!,
            {
              data: { text: "Old" },
              hidden: false,
              key: "01ARZ3NDEKTSV4RRFFQ69G5FA9",
              position: 900,
              schemaVersion: 1,
              settings: {},
              type: "legacyBanner",
            },
          ],
        },
      }),
      saveDraft: saveDraft as unknown as AdminClient["saveDraft"],
    }),
  );
  await screen.findByRole("heading", { name: "Edit posts" });
  const legacy = screen.getByRole("article", { name: "Legacy Banner" });
  expect(legacy).toHaveTextContent("Has problems");
  expect(within(legacy).getByRole("alert")).toHaveTextContent(
    "This block type is not allowed by the model.",
  );

  await user.type(screen.getByLabelText("Title"), " edited");
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  expect(saveDraft).not.toHaveBeenCalled();

  await blockAction(
    user,
    within(legacy).getByRole("button", { name: "Actions for Legacy Banner block" }),
    "Remove",
  );
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(saveDraft).toHaveBeenCalledTimes(1));
  expect(saveDraft.mock.calls[0]![1].blocks.map((block) => block.key)).toEqual([
    existingBlocks[0]!.key,
  ]);
});

test("saves keep loaded block envelopes, new blocks take setting defaults, copies drop anchors", async () => {
  const user = userEvent.setup();
  const panelModel: ContentModelDto = {
    blockDefinitions: [
      {
        fields: { heading: { required: true, type: "text" } },
        label: "Panel",
        settings: {
          align: {
            defaultValue: "left",
            options: ["left", "center"],
            required: false,
            type: "select",
          },
        },
        type: "panel",
        version: 1,
      },
    ],
    blocks: ["panel"],
    fields: {},
    key: "posts",
    kind: "collection",
    route: "/posts/:slug",
    version: 1,
  };
  const loaded = {
    anchor: "pricing",
    className: "wide",
    data: { heading: "Plans" },
    hidden: true,
    key: "01ARZ3NDEKTSV4RRFFQ69G5FB1",
    position: 100,
    schemaVersion: 1,
    settings: { align: "center" },
    type: "panel",
  };
  const saveDraft = vi.fn(
    async (_entryId: string, input: Parameters<AdminClient["saveDraft"]>[1]) => ({
      ...draftEntry,
      draft: { ...draftEntry.draft, ...input, revision: 3 },
    }),
  );
  renderRoute(
    "/content/posts/entry-1",
    staticSessionSource({ id: "editor-1", role: "editor" }),
    client({
      listModels: async () => ({ items: [models.items[0]!, panelModel] }) as never,
      loadEntry: async () => ({
        ...draftEntry,
        draft: { ...draftEntry.draft, blocks: [loaded] },
      }),
      saveDraft: saveDraft as unknown as AdminClient["saveDraft"],
    }),
  );
  await screen.findByRole("heading", { name: "Edit posts" });
  const heading = screen.getByRole("textbox", { name: "Heading" });
  await user.clear(heading);
  await user.type(heading, "Pricing plans");
  await blockAction(
    user,
    screen.getByRole("button", { name: "Actions for Panel block" }),
    "Duplicate",
  );
  await addBlock(user, "Panel");
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(saveDraft).toHaveBeenCalledTimes(1));
  const [kept, copy, added] = saveDraft.mock.calls[0]![1].blocks;
  expect(kept).toMatchObject({
    anchor: "pricing",
    className: "wide",
    data: { heading: "Pricing plans" },
    hidden: true,
    key: loaded.key,
    settings: { align: "center" },
  });
  expect(copy).toMatchObject({ className: "wide", hidden: true, settings: { align: "center" } });
  expect(copy).not.toHaveProperty("anchor");
  expect(copy!.key).not.toBe(loaded.key);
  expect(added).toMatchObject({ hidden: false, settings: { align: "left" }, type: "panel" });
  expect(added).not.toHaveProperty("anchor");
});

test("generic video embed authoring validates URLs, selects and clears a poster", async () => {
  const user = userEvent.setup();
  const model: ContentModelDto = {
    blockDefinitions: [toBlockMetadata(builtInBlocks.videoEmbed)],
    blocks: ["videoEmbed"],
    fields: {},
    key: "posts",
    kind: "collection",
    route: "/posts/:slug",
    version: 1,
  };
  const saveDraft = vi.fn(async (_id: string, input: Parameters<AdminClient["saveDraft"]>[1]) => ({
    ...draftEntry,
    draft: { ...draftEntry.draft, ...input, revision: 3 },
  }));
  renderRoute(
    "/content/posts/entry-1",
    staticSessionSource({ id: "editor-1", role: "editor" }),
    client({
      listModels: async () => ({ items: [model] }),
      saveDraft: saveDraft as unknown as AdminClient["saveDraft"],
      listMedia: async () => ({
        items: [
          {
            createdAt: "2026-09-20T00:00:00.000Z",
            createdBy: { id: "editor-1", displayName: "Editor" },
            id: "media-1",
            filename: "cover.png",
            mimeType: "image/png",
            size: 12,
            status: "active",
            updatedAt: "2026-09-20T00:00:00.000Z",
            url: "https://lace.test/cover.png",
            usageCount: 0,
          },
        ],
      }),
    }),
  );
  await screen.findByRole("heading", { name: "Edit posts" });
  await addBlock(user, "Video embed");
  const card = () => screen.getByRole("article", { name: "Video embed" });
  await user.type(
    within(card()).getByRole("textbox", { name: /Video URL/ }),
    "https://example.com/clip",
  );
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  expect(saveDraft).not.toHaveBeenCalled();
  expect(
    (await screen.findAllByText("Enter a valid youtube or vimeo video URL.")).length,
  ).toBeGreaterThan(0);
  const url = within(card()).getByRole("textbox", { name: /Video URL/ });
  await user.clear(url);
  await user.type(url, "https://vimeo.com/123/abc");
  await user.type(within(card()).getByRole("textbox", { name: /^Title/ }), "Studio film");
  await user.click(within(card()).getByRole("button", { name: "Choose media for Preview image" }));
  await user.click(
    await within(screen.getByRole("dialog")).findByRole("button", { name: "cover.png" }),
  );
  expect(
    within(card()).getByRole("button", { name: "Replace media for Preview image" }),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(saveDraft).toHaveBeenCalledTimes(1));
  expect(saveDraft.mock.calls[0]![1].blocks[0]!.data).toMatchObject({
    url: "https://vimeo.com/123/abc",
    title: "Studio film",
    poster: "media-1",
  });
  expect(document.querySelector("iframe")).toBeNull();
  screen.getByRole("button", { name: "Media actions for Preview image" }).focus();
  await user.keyboard("{Enter}");
  await user.click(screen.getByRole("menuitem", { name: "Remove media from Preview image" }));
  expect(
    within(card()).getByRole("button", { name: "Choose media for Preview image" }),
  ).toBeInTheDocument();
}, 15_000);

test.each(["viewer", "editor"] as const)(
  "video embeds retain %s access and conflict recovery",
  async (role) => {
    const user = userEvent.setup();
    const model: ContentModelDto = {
      blockDefinitions: [toBlockMetadata(builtInBlocks.videoEmbed)],
      blocks: ["videoEmbed"],
      fields: {},
      key: "posts",
      kind: "collection",
      route: "/posts/:slug",
      version: 1,
    };
    const block = {
      key: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      type: "videoEmbed",
      schemaVersion: 1,
      position: 1000,
      hidden: false,
      settings: {},
      data: { url: "https://vimeo.com/123", title: "Original film" },
    };
    const saveDraft = vi.fn(async () => {
      throw new AdminClientError({
        code: "CONTENT_REVISION_CONFLICT",
        message: "The draft was modified by another request.",
        status: 409,
      });
    });
    renderRoute(
      "/content/posts/entry-1",
      staticSessionSource({ id: `${role}-1`, role }),
      client({
        listModels: async () => ({ items: [model] }),
        loadEntry: async () => ({ ...draftEntry, draft: { ...draftEntry.draft, blocks: [block] } }),
        saveDraft,
      }),
    );
    await screen.findByRole("heading", { name: "Edit posts" });
    const title = within(screen.getByRole("article", { name: "Video embed" })).getByRole(
      "textbox",
      { name: /^Title/ },
    );
    if (role === "viewer") {
      expect(title).toBeDisabled();
      expect(
        screen.queryByRole("button", { name: "Choose media for Preview image" }),
      ).not.toBeInTheDocument();
      expect(saveDraft).not.toHaveBeenCalled();
    } else {
      await user.clear(title);
      await user.type(title, "Local film");
      await user.click(screen.getByRole("button", { name: "Save draft" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("Draft changed elsewhere");
      expect(title).toHaveValue("Local film");
      await user.click(screen.getByRole("button", { name: "Reload server draft" }));
      await waitFor(() =>
        expect(
          within(screen.getByRole("article", { name: "Video embed" })).getByRole("textbox", {
            name: /^Title/,
          }),
        ).toHaveValue("Original film"),
      );
    }
    expect(document.querySelector("iframe")).toBeNull();
  },
  15_000,
);
