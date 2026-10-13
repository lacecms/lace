import { expect, test, type Page, type Route, type Locator } from "@playwright/test";
import { field } from "@lacecms/content";
import { sessionPath, sessionSummary } from "./support/session.js";
import { expectNoAccessibilityViolations } from "./support/accessibility.js";
import { expectVisibleFocus, tabTo } from "./support/keyboard.js";

const date = "2026-10-12T00:00:00.000Z";
const key = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const richDocument = (text: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});
const links = field.list({
  label: "Links",
  itemLabel: "title",
  item: field.group({
    fields: {
      title: field.text({ label: "Link title" }),
      url: field.url({ label: "Address", required: true }),
      children: field.list({
        label: "Children",
        item: field.group({
          fields: {
            title: field.text({ label: "Child title" }),
            url: field.url({ label: "Child address" }),
          },
        }),
      }),
    },
  }),
});
const cards = field.list({
  label: "Cards",
  itemLabel: "title",
  item: field.group({
    fields: {
      title: field.text({ label: "Card title" }),
      image: field.media({ label: "Picture" }),
      body: field.richText({ label: "Details" }),
    },
  }),
});
async function activate(page: Page, locator: Locator) {
  await locator.focus();
  await page.keyboard.press("Enter");
}
async function keyboardMoveDown(page: Page, label: string) {
  const handle = page.getByRole("button", { name: `Reorder ${label} item 1`, exact: true });
  await handle.scrollIntoViewIfNeeded();
  await handle.focus();
  await page.keyboard.press("Space");
  await expect(handle).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.locator("[id^=DndLiveRegion]").filter({ hasText: `${label} position 1 of 2.` }),
  ).toHaveCount(1);
  // Wait for dnd-kit's deferred keyboard listener and measured item geometry.
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await page.keyboard.press("ArrowDown");
  await expect(
    page.locator("[id^=DndLiveRegion]").filter({ hasText: `${label} position 2 of 2.` }),
  ).toHaveCount(1);
  await page.keyboard.press("Space");
  await expect(
    page.locator("[id^=DndLiveRegion]").filter({ hasText: `${label} dropped at position 2.` }),
  ).toHaveCount(1);
}
async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ body: JSON.stringify(body), contentType: "application/json", status });
}
async function mock(
  page: Page,
  options: {
    kind?: "page" | "collection" | "global";
    role?: "editor" | "viewer";
    budget?: boolean;
  } = {},
) {
  const kind = options.kind ?? "collection",
    role = options.role ?? "editor";
  const model = {
    key: "content",
    label: "Content",
    kind,
    version: 1,
    ...(kind === "collection" ? { route: "/posts/:slug" } : kind === "page" ? { path: "/" } : {}),
    fields: { links, numbers: field.list({ label: "Numbers", item: field.number({ min: 10 }) }) },
    blocks: ["cards"],
    blockDefinitions: [
      {
        type: "cards",
        label: "Card section",
        version: 1,
        fields: { cards, tags: field.list({ label: "Tags", item: field.text() }) },
      },
    ],
  };
  const block = (index: number, data: Record<string, unknown>, hidden = false) => ({
    key: index === 0 ? key : `01ARZ3NDEKTSV4RRFFQ69G5FA${index}`,
    type: "cards",
    schemaVersion: 1,
    position: (index + 1) * 1000,
    hidden,
    settings: {},
    data,
  });
  let entry = {
    id: "entry-1",
    model: {
      key: "content",
      kind,
      ...(kind === "collection" ? { route: "/posts/:slug" } : kind === "page" ? { path: "/" } : {}),
    },
    draft: {
      id: "snapshot-1",
      entryId: "entry-1",
      state: "draft",
      title: "First entry",
      ...(kind === "collection" ? { slug: "first" } : {}),
      revision: 1,
      createdAt: date,
      updatedAt: date,
      updatedBy: { id: "editor-1", role: "editor" },
      fields: {
        links: options.budget
          ? []
          : [
              { title: "One", url: "/one", children: [{ title: "Child", url: "/child" }] },
              { title: "Two", url: "/two" },
            ],
        numbers: [],
      },
      blocks: options.budget
        ? Array.from({ length: 5 }, (_, index) =>
            block(index, { tags: Array(100).fill("tag") }, true),
          )
        : [
            block(0, {
              cards: [
                { title: "First card", body: richDocument("Alpha") },
                { title: "Second card", body: richDocument("Beta") },
              ],
              tags: [],
            }),
          ],
    },
    updatedBy: { id: "editor-1", displayName: "Ada" },
  };
  const media = {
    id: "media-1",
    filename: "photo.png",
    mimeType: "image/png",
    status: "active",
    size: 20,
    width: 1,
    height: 1,
    createdAt: date,
    updatedAt: date,
    createdBy: { id: "editor-1", displayName: "Ada" },
    usageCount: 0,
    url: "https://site.test/photo.png",
  };
  const state = {
    saved: [] as Record<string, unknown>[],
    reject: undefined as "conflict" | "nested" | "blockNested" | undefined,
    requests: 0,
    delay: undefined as Promise<void> | undefined,
  };
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    async (route) => {
      const request = route.request(),
        path = new URL(request.url()).pathname;
      if (path === sessionPath) return json(route, sessionSummary({ id: "editor-1", role }));
      if (path === "/api/v1/admin/content-models") return json(route, { items: [model] });
      if (path === "/api/v1/admin/build-site")
        return json(route, { site: { id: "main", label: "Main" } });
      if (path === "/api/v1/admin/site-builds") return json(route, { items: [] });
      if (path === "/api/v1/admin/models/content/entries")
        return json(route, { items: [], totals: { all: 0, changed: 0, draft: 0, published: 0 } });
      if (path === "/api/v1/admin/entries/entry-1") return json(route, entry);
      if (path === "/api/v1/admin/entries/entry-1/draft") {
        state.requests++;
        if (state.reject) {
          const reject = state.reject;
          state.reject = undefined;
          return json(
            route,
            {
              error: {
                code: reject === "conflict" ? "CONTENT_REVISION_CONFLICT" : "VALIDATION_FAILED",
                message: "Rejected.",
                ...(reject === "nested" || reject === "blockNested"
                  ? {
                      details: {
                        issues: [
                          {
                            code: "invalid_field_value",
                            message: "Rejected URL",
                            path:
                              reject === "blockNested"
                                ? "/blocks/0/data/cards/0/body/content/0"
                                : "/fields/links/0/children/0/url",
                          },
                        ],
                      },
                    }
                  : {}),
              },
            },
            reject === "conflict" ? 409 : 422,
          );
        }
        if (state.delay) await state.delay;
        const { expectedRevision: _expectedRevision, ...body } = request.postDataJSON();
        state.saved.push(body);
        entry = {
          ...entry,
          draft: { ...entry.draft, ...body, revision: entry.draft.revision + 1 },
        };
        return json(route, entry);
      }
      if (path === "/api/v1/admin/media" && request.method() === "POST")
        return json(route, media, 201);
      if (path === "/api/v1/admin/media") return json(route, { items: [media] });
      if (path === "/api/v1/admin/media/media-1") return json(route, { ...media, usage: [] });
      if (path.endsWith("/preview"))
        return route.fulfill({
          contentType: "image/png",
          body: Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
            "base64",
          ),
        });
      return route.fallback();
    },
  );
  await page.goto("/admin/content/content/entry-1");
  await expect(page.getByRole("heading", { name: "Edit Content" })).toBeVisible();
  return state;
}
for (const kind of ["page", "collection", "global"] as const)
  test(`${kind} nested fields save plain composite JSON`, async ({ page }) => {
    const state = await mock(page, { kind });
    await page.getByRole("textbox", { name: "Link title", exact: true }).first().fill("Changed");
    await page.keyboard.press("ControlOrMeta+s");
    await expect(page.getByRole("banner").getByRole("status")).toHaveText("Saved revision 2");
    const fields = state.saved[0]!.fields as { links: Record<string, unknown>[] };
    expect(fields.links[0]).toMatchObject({
      title: "Changed",
      children: [{ title: "Child", url: "/child" }],
    });
    expect(JSON.stringify(state.saved)).not.toContain("item-");
  });

test("keyboard edits nested lists, scalar insertion and rich text, preserves media through duplicate/move/collapse", async ({
  page,
}) => {
  const state = await mock(page);
  const address = page.getByRole("textbox", { name: "Child address", exact: true });
  await tabTo(page, address, 100);
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("/edited-child");
  const duplicate = page.getByRole("button", { name: "Duplicate Links item 1", exact: true });
  await tabTo(page, duplicate, 100);
  await page.keyboard.press("Enter");
  expect(
    await page
      .getByRole("textbox", { name: "Child address", exact: true })
      .evaluateAll((elements) => elements.map((element) => (element as HTMLInputElement).value)),
  ).toEqual(["/edited-child", "/edited-child"]);
  await page.getByRole("button", { name: "Add Numbers item" }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("spinbutton", { name: "New Numbers item" }).focus();
  await page.keyboard.type("15");
  await tabTo(page, page.getByRole("button", { name: "Add item", exact: true }));
  await page.keyboard.press("Enter");
  const details = page.getByRole("textbox", { name: "Details", exact: true }).first();
  await details.focus();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("Alpha edited");
  await activate(page, page.getByRole("button", { name: "Choose media for Picture" }).first());
  await activate(
    page,
    page.getByRole("dialog", { name: /Picture/u }).getByRole("button", { name: /photo.png/u }),
  );
  await expect(page.getByText("photo.png").first()).toBeVisible();
  await activate(page, page.getByRole("button", { name: "Duplicate Cards item 1", exact: true }));
  await page.getByRole("button", { name: "Move down Cards item 1", exact: true }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Collapse Cards item 2", exact: true }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Expand Cards item 2", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("textbox", { name: "Details", exact: true }).nth(1)).toHaveText(
    "Alpha edited",
  );
  // Keyboard drag stays in the child list; Escape cancels without moving a parent.
  const handle = page.getByRole("button", { name: "Reorder Children item 1", exact: true }).first();
  await handle.focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("Escape");
  await expectVisibleFocus(page);
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.getByRole("banner").getByRole("status")).toHaveText("Saved revision 2");
  const saved = state.saved[0] as {
    blocks: { data: { cards: { image?: string; body: unknown }[] } }[];
  };
  expect(saved.blocks[0]!.data.cards.slice(0, 2).map((item) => item.image)).toEqual([
    "media-1",
    "media-1",
  ]);
  expect(JSON.stringify(saved.blocks[0]!.data.cards[1]!.body)).toContain("Alpha edited");
});

test("collapsed exact error focus and conflict JSON/reload retain complete local data", async ({
  context,
  page,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const state = await mock(page);
  await page.getByRole("textbox", { name: "Child address", exact: true }).fill("/local");
  await activate(page, page.getByRole("button", { name: "Collapse Children item 1", exact: true }));
  await activate(page, page.getByRole("button", { name: "Collapse Links item 1", exact: true }));
  await activate(page, page.getByRole("button", { name: "Collapse Links", exact: true }));
  state.reject = "nested";
  await page.keyboard.press("ControlOrMeta+s");
  const summaryLink = page.getByRole("link", {
    name: /Child address in Item 1 in Children in Item 1 in Links/u,
  });
  await expect(summaryLink).toBeVisible();
  await summaryLink.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("textbox", { name: "Child address", exact: true })).toBeFocused();
  state.reject = "conflict";
  await page.getByRole("textbox", { name: "Child address", exact: true }).fill("/recover");
  await page.keyboard.press("ControlOrMeta+s");
  await activate(page, page.getByRole("button", { name: "Copy my JSON" }));
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("/recover");
  expect(copied).not.toContain("item-");
  await activate(page, page.getByRole("button", { name: /Reload server draft/u }));
  await expect(page.getByRole("textbox", { name: "Child address", exact: true })).toHaveValue(
    "/child",
  );
});

test("pointer drag changes only the selected list", async ({ page }) => {
  const state = await mock(page);
  const first = page.getByRole("button", { name: "Reorder Cards item 1", exact: true });
  const target = page.getByRole("button", { name: "Reorder Cards item 2", exact: true });
  const from = await first.boundingBox(),
    to = await target.boundingBox();
  if (!from || !to) throw new Error("Missing drag handle");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 15 });
  await page.mouse.up();
  await expect(page.getByRole("textbox", { name: "Card title", exact: true }).first()).toHaveValue(
    "Second card",
  );
  await page.keyboard.press("ControlOrMeta+s");
  await expect.poll(() => state.saved.length).toBe(1);
  expect((state.saved[0]!.fields as { links: { title: string }[] }).links[0]!.title).toBe("One");
});

for (const role of ["editor", "viewer"] as const)
  for (const theme of ["light", "dark"] as const)
    test(`${theme} ${role} narrow composite forms pass accessibility`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.addInitScript((theme) => localStorage.setItem("lace:admin-theme", theme), theme);
      await mock(page, { role });
      if (role === "viewer") {
        await expect(page.getByRole("button", { name: "Add Links item" })).toHaveCount(0);
        await expect(
          page.getByRole("textbox", { name: "Link title", exact: true }).first(),
        ).toBeDisabled();
      }
      const disclosure = page.getByRole("button", { name: "Collapse Links", exact: true });
      await disclosure.focus();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("button", { name: "Expand Links", exact: true })).toBeFocused();
      await page.keyboard.press("Enter");
      await expectNoAccessibilityViolations(page, `${theme} ${role} composites 375px`);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    });

test("500-element hidden-block budget prevents list and block growth, removal allows an exact-boundary save", async ({
  page,
}) => {
  const state = await mock(page, { budget: true });
  await expect(page.getByText(/List items: 500 \/ 500/u)).toBeVisible();
  await expect(page.getByRole("button", { name: "Add Links item" })).toBeDisabled();
  const firstBlock = page.locator(`article[data-block-key="${key}"]`);
  await firstBlock.getByRole("button", { name: "Actions for Card section block" }).click();
  await expect(page.getByRole("menuitem", { name: "Duplicate", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await firstBlock.getByRole("button", { name: "Remove Tags item 1", exact: true }).click();
  await expect(page.getByRole("button", { name: "Add Links item" })).toBeEnabled();
  await page.getByRole("button", { name: "Add Links item" }).click();
  await expect(page.getByText(/List items: 500 \/ 500/u)).toBeVisible();
  await page.keyboard.press("ControlOrMeta+s");
  await expect.poll(() => state.saved.length).toBe(1);
});

test("keyboard drag stays within nested lists and pending save locks mutations", async ({
  page,
}) => {
  const state = await mock(page);
  await keyboardMoveDown(page, "Links");
  await expect(page.getByRole("textbox", { name: "Link title", exact: true }).first()).toHaveValue(
    "Two",
  );
  await page.getByRole("button", { name: "Add Children item", exact: true }).last().focus();
  await page.keyboard.press("Enter");
  await page.getByRole("textbox", { name: "Child title", exact: true }).last().focus();
  await page.keyboard.type("New child");
  await keyboardMoveDown(page, "Children");
  await expect(page.getByRole("textbox", { name: "Child title", exact: true }).first()).toHaveValue(
    "New child",
  );
  await expect(page.getByRole("textbox", { name: "Link title", exact: true }).first()).toHaveValue(
    "Two",
  );
  await expectVisibleFocus(page);
  let release!: () => void;
  await activate(
    page,
    page
      .locator(`article[data-block-key="${key}"]`)
      .getByRole("tab", { name: "Settings", exact: true }),
  );
  state.delay = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.keyboard.press("ControlOrMeta+s");
  await expect.poll(() => state.requests).toBe(1);
  await expect(
    page.getByRole("button", { name: "Move down Links item 1", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("textbox", { name: "Link title", exact: true }).first(),
  ).toBeDisabled();
  await expect(page.getByRole("textbox", { name: "Anchor", exact: true })).toBeDisabled();
  await expect(page.getByRole("switch", { name: "Hide on site", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Collapse Links", exact: true })).toBeEnabled();
  release();
  await expect(page.getByRole("banner").getByRole("status")).toHaveText("Saved revision 2");
});

test("uploads media directly from a nested block item", async ({ page }) => {
  const state = await mock(page);
  await page.getByRole("button", { name: "Choose media for Picture" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Choose media for Picture" });
  await dialog.getByLabel("Upload images").setInputFiles({
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
      "base64",
    ),
    mimeType: "image/png",
    name: "photo.png",
  });
  await expect(
    dialog.getByRole("list", { name: "Upload queue" }).getByRole("listitem"),
  ).toContainText("Uploaded");
  await dialog.getByRole("button", { name: "Use photo.png", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Replace media for Picture" }).first(),
  ).toBeFocused();
  await page.keyboard.press("ControlOrMeta+s");
  await expect.poll(() => state.saved.length).toBe(1);
  expect(
    (state.saved[0]!.blocks as { data: { cards: { image: string }[] } }[])[0]!.data.cards[0]!.image,
  ).toBe("media-1");
});

test("a cleared scalar item guards navigation and saving from a clean saved baseline", async ({
  page,
}) => {
  const state = await mock(page);
  await page.getByRole("button", { name: "Add Numbers item" }).click();
  await page.getByRole("spinbutton", { name: "New Numbers item" }).fill("15");
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.getByRole("banner").getByRole("status")).toHaveText("Saved revision 2");
  await expect(page.getByRole("button", { name: "Save draft", exact: true })).toBeDisabled();
  await page.getByRole("spinbutton", { name: "Numbers item 1" }).fill("");
  await expect(page.getByRole("button", { name: "Save draft", exact: true })).toBeEnabled();
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.getByRole("link", { name: /Item 1 in Numbers/u })).toBeVisible();
  expect(state.requests).toBe(1);
  await page
    .getByRole("complementary", { name: "Admin navigation" })
    .getByRole("link", { name: "Content", exact: true })
    .click();
  await expect(page.getByRole("alertdialog", { name: "Discard unsaved changes?" })).toBeVisible();
  await page.getByRole("button", { name: "Stay", exact: true }).click();
  await expect(page.getByRole("spinbutton", { name: "Numbers item 1" })).toHaveValue("");
  await page.getByRole("spinbutton", { name: "Numbers item 1" }).fill("15");
  await expect(page.getByRole("button", { name: "Save draft", exact: true })).toBeDisabled();
});

test("a nested rich-text server issue reveals the block Content tab and every disclosure", async ({
  page,
}) => {
  const state = await mock(page);
  const block = page.locator(`article[data-block-key="${key}"]`);
  await page.getByRole("textbox", { name: "Link title", exact: true }).first().fill("Dirty");
  await activate(page, page.getByRole("button", { name: "Collapse Cards item 1", exact: true }));
  await activate(page, page.getByRole("button", { name: "Collapse Cards", exact: true }));
  await activate(page, block.getByRole("tab", { name: "Settings", exact: true }));
  await activate(
    page,
    block.getByRole("button", { name: "Collapse Card section block", exact: true }),
  );
  state.reject = "blockNested";
  await page.keyboard.press("ControlOrMeta+s");
  const link = page.getByRole("link", { name: /Details in Item 1 in Cards/u });
  await expect(link).toBeVisible();
  await activate(page, link);
  await expect(page.locator('[id="field-blocks-0-data-cards-0-body"]')).toHaveCount(1);
  await expect(page.getByRole("textbox", { name: "Details", exact: true }).first()).toBeFocused();
  await expect(block.getByRole("tab", { name: /^Content/u })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});
