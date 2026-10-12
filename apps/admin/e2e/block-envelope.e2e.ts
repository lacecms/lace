import { expect, test, type Locator, type Page, type Route } from "@playwright/test";
import { expectVisibleFocus, tabTo } from "./support/keyboard.js";
import { sessionPath, sessionSummary } from "./support/session.js";

// Match API calls by pathname prefix so Vite module URLs under /src/shared/api
// are never intercepted.
const isApiRequest = (url: URL) => url.pathname.startsWith("/api/");

const now = "2026-10-01T00:00:00.000Z";
const first = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const second = "01ARZ3NDEKTSV4RRFFQ69G5FAW";

const posts = {
  blockDefinitions: [
    {
      fields: { heading: { label: "Heading", required: true, type: "text" } },
      label: "Hero",
      settings: {
        align: {
          defaultValue: "left",
          label: "Alignment",
          options: ["left", "center"],
          required: false,
          type: "select",
        },
      },
      type: "hero",
      version: 1,
    },
  ],
  blocks: ["hero"],
  fields: {},
  key: "posts",
  kind: "collection",
  label: "Posts",
  route: "/posts/:slug",
  version: 1,
};

type Block = Record<string, unknown>;

function block(key: string, envelope: Block): Block {
  return {
    data: { heading: key === first ? "Welcome" : "Questions" },
    hidden: false,
    key,
    position: 1_000,
    schemaVersion: 1,
    settings: { align: "left" },
    type: "hero",
    ...envelope,
  };
}

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ body: JSON.stringify(body), contentType: "application/json", status });
}

/**
 * A stateful admin API with one post of two hero blocks; the second is hidden
 * with anchor `faq`. `reject` answers the next save or publish with issues.
 */
async function mockApi(page: Page) {
  const post = {
    draft: {
      blocks: [block(first, {}), block(second, { anchor: "faq", hidden: true })],
      createdAt: now,
      entryId: "post-1",
      fields: {},
      id: "post-1-draft",
      revision: 1,
      slug: "first-post",
      state: "draft",
      title: "First post",
      updatedAt: now,
      updatedBy: { id: "admin-1", role: "admin" },
    },
    id: "post-1",
    model: { key: "posts", kind: "collection", route: "/posts/:slug" },
    updatedBy: { displayName: "Ada Admin", id: "admin-1" },
  };
  const state = {
    reject: undefined as
      | { readonly code: string; readonly on: "publish" | "save"; readonly path: string }
      | undefined,
    saved: [] as Block[][],
  };
  const issues = (on: "publish" | "save") => {
    const rejection = state.reject;
    if (rejection?.on !== on) return undefined;
    state.reject = undefined;
    return {
      error: {
        code: "VALIDATION_FAILED",
        details: {
          issues: [{ code: rejection.code, message: "Rejected.", path: rejection.path }],
        },
        message: "The request did not satisfy the API contract.",
      },
    };
  };
  await page.route(isApiRequest, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (path === sessionPath) return json(route, sessionSummary({ id: "admin-1", role: "admin" }));
    if (path === "/api/v1/admin/content-models") return json(route, { items: [posts] });
    if (path === "/api/v1/admin/build-site")
      return json(route, {
        site: { id: "main-site", label: "Main site", url: "https://site.example/" },
      });
    if (path === "/api/v1/admin/site-builds") return json(route, { items: [] });
    if (path === "/api/v1/admin/models/posts/entries")
      return json(route, { items: [], totals: { all: 0, changed: 0, draft: 0, published: 0 } });
    if (path === "/api/v1/admin/entries/post-1" && method === "GET") return json(route, post);
    if (path === "/api/v1/admin/entries/post-1/draft" && method === "PUT") {
      const rejected = issues("save");
      if (rejected !== undefined) return json(route, rejected, 422);
      const body = request.postDataJSON() as { blocks: Block[]; title: string };
      state.saved.push(body.blocks);
      post.draft = {
        ...post.draft,
        blocks: body.blocks.map((item) => ({ settings: {}, ...item })),
        revision: post.draft.revision + 1,
        title: body.title,
      };
      return json(route, post);
    }
    if (path === "/api/v1/admin/entries/post-1/publish" && method === "POST") {
      const rejected = issues("publish");
      if (rejected !== undefined) return json(route, rejected, 422);
    }
    return route.fallback();
  });
  return state;
}

/** Replaces the value of a focused text field with the keyboard. */
async function retype(page: Page, text: string) {
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type(text);
}

/**
 * Opens a block's actions menu with the keyboard and chooses an action. The
 * trigger is focused directly because it precedes the controls just edited.
 */
async function blockAction(page: Page, card: Locator, action: string) {
  const trigger = card.getByRole("button", { name: "Actions for Hero block" });
  await trigger.focus();
  await expectVisibleFocus(page);
  await page.keyboard.press("Enter");
  const item = page.getByRole("menuitem", { name: action });
  await expect(item).toBeVisible();
  while (!(await item.evaluate((element) => element === document.activeElement)))
    await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(trigger).toBeFocused();
}

test("an admin edits block envelopes with the keyboard alone", async ({ context, page }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const state = await mockApi(page);
  await page.goto("/admin/content/posts/post-1");
  await expect(page.getByRole("heading", { name: "Edit Posts" })).toBeVisible();
  const card = page.locator(`article[data-block-key="${first}"]`);
  const hiddenCard = page.locator(`article[data-block-key="${second}"]`);
  await expect(card).toHaveAccessibleName("Hero");
  await expect(hiddenCard).toHaveAccessibleName("Hero Hidden");
  await expect(hiddenCard).toContainText("#faq");

  // The tabs are one tab stop: arrows, Home and End select without editing the draft.
  const contentTab = card.getByRole("tab", { name: "Content" });
  const settingsTab = card.getByRole("tab", { name: "Settings" });
  await tabTo(page, contentTab);
  await page.keyboard.press("ArrowRight");
  await expect(settingsTab).toBeFocused();
  await expect(settingsTab).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await expect(contentTab).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("End");
  await expect(settingsTab).toHaveAttribute("aria-selected", "true");
  await expectVisibleFocus(page);
  await expect(page.getByRole("banner").getByRole("status")).toHaveText("Saved revision 1");

  const anchor = card.getByRole("textbox", { name: "Anchor" });
  const copy = card.getByRole("button", { name: "Copy link" });
  await tabTo(page, anchor);
  await page.keyboard.type("Pricing Table");
  await expect(card.getByText(/^Start with a lowercase letter/u)).toBeVisible();
  await expect(copy).toBeDisabled();
  await retype(page, "faq");
  await expect(
    card.getByText("Another block in this entry already uses this anchor."),
  ).toBeVisible();
  await retype(page, "pricing");
  await expect(card.getByRole("alert")).toHaveCount(0);
  await tabTo(page, copy);
  await page.keyboard.press("Enter");
  await expect(page.getByText("Link copied.")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "https://site.example/posts/first-post#pricing",
  );
  await expect(card).toContainText("#pricing");

  const alignment = card.getByRole("combobox", { name: "Alignment" });
  await tabTo(page, alignment);
  await page.keyboard.press("Enter");
  const center = page.getByRole("option", { name: "center" });
  await center.waitFor();
  while (!(await center.evaluate((element) => element === document.activeElement)))
    await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(alignment).toHaveText("center");
  await tabTo(page, card.getByRole("textbox", { name: "CSS classes" }));
  await page.keyboard.type(" wide  md:w-1/2 ");

  await blockAction(page, card, "Hide block");
  await expect(card).toHaveAccessibleName("Hero Hidden");
  await expect(card.getByRole("switch", { name: "Hide on site" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(page.getByText("Hero block 1 hidden from the site.")).toBeAttached();
  await blockAction(page, hiddenCard, "Show block");
  await expect(hiddenCard).toHaveAccessibleName("Hero");
  await expect(page.getByText("Hero block 2 shown on the site.")).toBeAttached();

  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.getByRole("banner").getByRole("status")).toHaveText("Saved revision 2");
  expect(state.saved).toEqual([
    [
      expect.objectContaining({
        anchor: "pricing",
        className: "wide  md:w-1/2",
        hidden: true,
        key: first,
        settings: { align: "center" },
      }),
      expect.objectContaining({ anchor: "faq", hidden: false, key: second }),
    ],
  ]);
  expect(state.saved[0]?.[1]).not.toHaveProperty("className");
});

test("a server anchor issue opens the Settings tab from the summary", async ({ page }) => {
  const state = await mockApi(page);
  await page.goto("/admin/content/posts/post-1");
  const card = page.locator(`article[data-block-key="${first}"]`);
  await tabTo(page, page.getByLabel("Title", { exact: true }));
  await page.keyboard.type(" edited");
  state.reject = { code: "duplicate_block_anchor", on: "save", path: "/blocks/0/anchor" };
  await page.keyboard.press("ControlOrMeta+s");
  const problems = page.getByRole("alert", { name: "There is 1 problem to fix" });
  await expect(problems).toBeFocused();
  await expect(card.getByRole("tab", { name: /^Settings.*has problems/u })).toHaveAttribute(
    "aria-selected",
    "false",
  );
  await tabTo(page, problems.getByRole("link", { name: "Anchor in Hero block 1" }));
  await page.keyboard.press("Enter");
  await expect(card.getByRole("textbox", { name: "Anchor" })).toBeFocused();
  await expect(card.getByRole("tab", { name: /^Settings/u })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expectVisibleFocus(page);
});

test("hiding a block makes its publication problem non-blocking", async ({ page }) => {
  const state = await mockApi(page);
  await page.goto("/admin/content/posts/post-1");
  const card = page.locator(`article[data-block-key="${first}"]`);
  state.reject = {
    code: "missing_required_field",
    on: "publish",
    path: "/blocks/0/data/heading",
  };
  await tabTo(page, page.getByRole("button", { name: "Publish" }));
  await page.keyboard.press("Enter");
  await page.getByRole("dialog").getByRole("button", { name: "Confirm publication" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alert", { name: "There is 1 problem to fix" })).toBeVisible();

  await blockAction(page, card, "Hide block");
  const summary = page.getByRole("alert", {
    name: "The remaining problems are in hidden blocks and do not block publishing",
  });
  await expect(
    summary.getByRole("link", { name: "Heading in Hero block 1 (hidden)" }),
  ).toBeVisible();
  await expect(page.locator("#field-blocks-0-data-heading-error")).toHaveText(
    "This field is required to publish. This block is hidden, so this does not block publishing.",
  );
});
