import { screen, waitFor, within } from "@testing-library/react";
import { userEvent, type UserEvent } from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import type { ContentModelDto } from "@lacecms/contracts";
import {
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

const model: ContentModelDto = {
  blockDefinitions: [
    {
      fields: { heading: { required: false, type: "text" } },
      label: "Hero",
      settings: { tone: { defaultValue: "plain", label: "Tone", required: false, type: "text" } },
      type: "hero",
      version: 1,
    },
  ],
  blocks: ["hero"],
  fields: {},
  key: "posts",
  kind: "collection",
  route: "/posts/:slug",
  version: 1,
};

const block = (key: string, envelope: Record<string, unknown>) => ({
  data: { heading: `Heading ${key.slice(-1)}` },
  hidden: false,
  key,
  position: 100,
  schemaVersion: 1,
  settings: { tone: "plain" },
  type: "hero",
  ...envelope,
});
const first = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const second = "01ARZ3NDEKTSV4RRFFQ69G5FAW";

function mount(
  role: "admin" | "editor" | "viewer" = "editor",
  overrides: Partial<AdminClient> = {},
) {
  const saveDraftMock = vi.fn(
    async (_entryId: string, input: Parameters<AdminClient["saveDraft"]>[1]) => ({
      ...draftEntry,
      draft: { ...draftEntry.draft, ...input, revision: 3 },
    }),
  );
  renderRoute(
    "/content/posts/entry-1",
    staticSessionSource({ id: "editor-1", role }),
    client({
      listModels: async () => ({ items: [models.items[0]!, model] }) as never,
      loadBuildSite: async () =>
        ({ site: { id: "main", label: "Main", url: "https://example.com/" } }) as never,
      loadEntry: async () =>
        ({
          ...draftEntry,
          draft: {
            ...draftEntry.draft,
            blocks: [
              block(first, {}),
              block(second, { anchor: "faq", className: "wide", hidden: true }),
            ],
            slug: "first-post",
          },
        }) as never,
      saveDraft: saveDraftMock as unknown as AdminClient["saveDraft"],
      ...overrides,
    }),
  );
  return saveDraftMock;
}

// Radix menus open from the keyboard in jsdom; pointer opening needs real pointer events.
async function blockAction(user: UserEvent, trigger: HTMLElement, action: string) {
  trigger.focus();
  await user.keyboard("{Enter}");
  await user.click(screen.getByRole("menuitem", { name: action }));
}

test("a writer edits the envelope in the Settings tab and saves it", async () => {
  const user = userEvent.setup();
  const saveDraft = mount();
  await screen.findByRole("heading", { name: "Edit posts" });
  const card = screen.getByRole("article", { name: "Hero" });
  const hiddenCard = screen.getByRole("article", { name: "Hero Hidden" });
  expect(hiddenCard).toHaveTextContent("#faq");

  // The tabs are one tab stop with arrow-key selection; switching is not an edit.
  const contentTab = within(card).getByRole("tab", { name: "Content" });
  contentTab.focus();
  await user.keyboard("{ArrowRight}");
  const settingsTab = within(card).getByRole("tab", { name: "Settings" });
  expect(settingsTab).toHaveFocus();
  expect(settingsTab).toHaveAttribute("aria-selected", "true");
  expect(within(card).getByRole("textbox", { hidden: true, name: "Heading" })).not.toBeVisible();
  expect(screen.queryByText("Unsaved changes")).toBe(null);

  const anchor = within(card).getByRole("textbox", { name: "Anchor" });
  const copy = within(card).getByRole("button", { name: "Copy link" });
  expect(copy).toBeDisabled();
  await user.type(anchor, "Pricing Table");
  expect(within(card).getByRole("alert")).toHaveTextContent(
    "Start with a lowercase letter and use only lowercase letters",
  );
  expect(copy).toBeDisabled();
  await user.clear(anchor);
  await user.type(anchor, "faq");
  expect(within(card).getByRole("alert")).toHaveTextContent(
    "Another block in this entry already uses this anchor.",
  );
  await user.clear(anchor);
  await user.type(anchor, "pricing");
  expect(within(card).queryByRole("alert")).toBe(null);
  await user.click(copy);
  expect(await navigator.clipboard.readText()).toBe("https://example.com/posts/first-post#pricing");
  expect(card).toHaveTextContent("#pricing");

  const tone = within(card).getByRole("textbox", { name: "Tone" });
  await user.clear(tone);
  await user.type(tone, "loud");
  await user.type(within(card).getByRole("textbox", { name: "CSS classes" }), " wide  md:w-1/2 ");

  await blockAction(
    user,
    within(card).getByRole("button", { name: "Actions for Hero block" }),
    "Hide block",
  );
  expect(screen.getByText("Hero block 1 hidden from the site.")).toHaveAttribute("role", "status");
  expect(within(card).getByRole("switch", { name: "Hide on site" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await blockAction(
    user,
    within(hiddenCard).getByRole("button", { name: "Actions for Hero block" }),
    "Show block",
  );
  expect(screen.getByText("Hero block 2 shown on the site.")).toHaveAttribute("role", "status");

  await user.click(screen.getByRole("button", { name: /^Save/u }));
  await waitFor(() => expect(saveDraft).toHaveBeenCalledTimes(1));
  const [saved] = saveDraft.mock.calls[0]![1].blocks;
  expect(saved).toMatchObject({
    anchor: "pricing",
    className: "wide  md:w-1/2",
    hidden: true,
    settings: { tone: "loud" },
  });
  expect(saveDraft.mock.calls[0]![1].blocks[1]).toMatchObject({
    anchor: "faq",
    className: "wide",
    hidden: false,
  });
  // The selected tab survives the save.
  expect(
    within(screen.getAllByRole("article")[0]!).getByRole("tab", { name: "Settings" }),
  ).toHaveAttribute("aria-selected", "true");
});

test("a duplicate starts without an anchor and a cleared anchor is not sent", async () => {
  const user = userEvent.setup();
  const saveDraft = mount();
  await screen.findByRole("heading", { name: "Edit posts" });
  const hiddenCard = screen.getByRole("article", { name: "Hero Hidden" });
  await blockAction(
    user,
    within(hiddenCard).getByRole("button", { name: "Actions for Hero block" }),
    "Duplicate",
  );
  await user.click(within(hiddenCard).getByRole("tab", { name: "Settings" }));
  await user.clear(within(hiddenCard).getByRole("textbox", { name: "Anchor" }));
  await user.click(screen.getByRole("button", { name: /^Save/u }));
  await waitFor(() => expect(saveDraft).toHaveBeenCalledTimes(1));
  const blocks = saveDraft.mock.calls[0]![1].blocks;
  expect(blocks).toHaveLength(3);
  expect(blocks[1]).not.toHaveProperty("anchor");
  expect(blocks[2]).toMatchObject({ className: "wide", hidden: true });
  expect(blocks[2]).not.toHaveProperty("anchor");
});

test("a viewer reads the settings without tabs or envelope actions", async () => {
  mount("viewer");
  await screen.findByRole("heading", { name: "Edit posts" });
  const hiddenCard = screen.getByRole("article", { name: "Hero Hidden" });
  expect(within(hiddenCard).queryByRole("tab")).toBe(null);
  expect(within(hiddenCard).queryByRole("button", { name: "Copy link" })).toBe(null);
  const settings = within(hiddenCard).getByRole("region", { name: "Settings" });
  expect(settings).toHaveTextContent("Anchor#faq");
  expect(settings).toHaveTextContent("VisibilityHidden on site");
  expect(settings).toHaveTextContent("CSS classeswide");
  expect(within(settings).getByRole("textbox", { name: "Tone" })).toBeDisabled();
  expect(within(hiddenCard).queryByRole("menuitem", { hidden: true, name: "Show block" })).toBe(
    null,
  );
});

function rejection(code: string, path: string) {
  return new AdminClientError({
    code: "VALIDATION_FAILED",
    issues: [{ code, message: "Rejected.", path }],
    message: "The request did not satisfy the API contract.",
    status: 422,
  });
}

test("a server anchor issue opens the Settings tab from the summary", async () => {
  const user = userEvent.setup();
  mount("editor", {
    saveDraft: (async () => {
      throw rejection("duplicate_block_anchor", "/blocks/0/anchor");
    }) as unknown as AdminClient["saveDraft"],
  });
  await screen.findByRole("heading", { name: "Edit posts" });
  await user.type(screen.getByLabelText("Title", { exact: true }), " edited");
  await user.click(screen.getByRole("button", { name: /^Save/u }));
  const summary = (
    await screen.findByRole("heading", { name: "There is 1 problem to fix" })
  ).closest("section")!;
  const card = screen.getByRole("article", { name: "Hero" });
  expect(within(card).getByRole("tab", { name: /^Settings ?\(has problems\)$/u })).toHaveAttribute(
    "aria-selected",
    "false",
  );
  await user.click(within(summary).getByRole("link", { name: "Anchor in Hero block 1" }));
  expect(within(card).getByRole("tab", { name: /^Settings ?\(has problems\)$/u })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const anchor = within(card).getByRole("textbox", { name: "Anchor" });
  expect(anchor).toHaveFocus();
  expect(anchor).toHaveAccessibleDescription(
    expect.stringContaining("Another block in this entry already uses this anchor."),
  );
});

test("hiding a block makes its publication problems non-blocking", async () => {
  const user = userEvent.setup();
  mount("admin", {
    publishEntry: (async () => {
      throw rejection("missing_required_field", "/blocks/0/data/heading");
    }) as unknown as AdminClient["publishEntry"],
  });
  await screen.findByRole("heading", { name: "Edit posts" });
  await user.click(screen.getByRole("button", { name: "Publish" }));
  await user.click(
    within(await screen.findByRole("dialog")).getByRole("button", { name: "Confirm publication" }),
  );
  await screen.findByRole("heading", { name: "There is 1 problem to fix" });
  const card = screen.getByRole("article", { name: "Hero" });
  await blockAction(
    user,
    within(card).getByRole("button", { name: "Actions for Hero block" }),
    "Hide block",
  );
  const summary = screen
    .getByRole("heading", {
      name: "The remaining problems are in hidden blocks and do not block publishing",
    })
    .closest("section")!;
  expect(
    within(summary).getByRole("link", { name: "Heading in Hero block 1 (hidden)" }),
  ).toBeInTheDocument();
  expect(document.getElementById("field-blocks-0-data-heading-error")).toHaveTextContent(
    "This field is required to publish. This block is hidden, so this does not block publishing.",
  );
});
