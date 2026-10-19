import { expect, test, type Page } from "@playwright/test";
import { itemAction, openAllItems } from "./support/list-items.js";
import { defineBlock, field, toBlockMetadata } from "@lacecms/content";
import { sessionPath, sessionSummary } from "./support/session.js";
import { expectNoAccessibilityViolations } from "./support/accessibility.js";

async function mock(page: Page, role: "admin" | "viewer" = "admin") {
  const cards = field.list({
    label: "Cards",
    item: field.group({
      fields: {
        note: field.text({ label: "Note" }),
        address: field.url({ label: "Address" }),
        body: field.richText({ label: "Body" }),
        image: field.media({ label: "Picture" }),
      },
      layout: {
        mode: "tabs",
        groups: [
          { key: "text", label: "Text tab", fields: ["note"] },
          { key: "rich", label: "Rich tab", fields: ["body", "image"] },
          { key: "link", label: "Link tab", fields: ["address"] },
        ],
      },
    }),
  });
  const fields = { intro: field.text({ label: "Intro" }), cards };
  const layout = {
    mode: "tabs" as const,
    groups: [
      { key: "intro", label: "Overview tab", fields: ["intro"] },
      { key: "cards", label: "Cards tab", fields: ["cards"] },
    ],
  } as const;
  const model = {
    key: "posts",
    kind: "collection",
    route: "/posts/:slug",
    version: 1,
    fields,
    layout,
    blocks: ["card"],
    blockDefinitions: [
      toBlockMetadata(
        defineBlock({
          type: "card",
          label: "Card",
          version: 1,
          fields,
          layout,
          settings: { tone: field.text({ defaultValue: "normal", label: "Tone" }) },
          settingsLayout: {
            mode: "tabs",
            groups: [{ key: "style", label: "Style tab", fields: ["tone"] }],
          },
        }),
      ),
    ],
  };
  const initialFields = {
    intro: "Intro",
    cards: [
      {
        note: "One",
        address: "/one",
        image: "media-1",
        body: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "Rich one" }] }],
        },
      },
      { note: "Two", address: "/two" },
    ],
  };
  const snapshot = {
    id: "snapshot-1",
    entryId: "entry-1",
    state: "draft",
    revision: 1,
    title: "Layout",
    slug: "stable",
    createdAt: "2026-10-14T00:00:00.000Z",
    updatedAt: "2026-10-14T00:00:00.000Z",
    updatedBy: { id: "admin-1", role: "admin" },
    fields: initialFields,
    blocks: [
      {
        key: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
        type: "card",
        schemaVersion: 1,
        position: 1000,
        hidden: false,
        settings: { tone: "normal" },
        data: initialFields,
      },
    ],
  };
  let current = {
    id: "entry-1",
    model: { key: "posts", kind: "collection", route: "/posts/:slug" },
    updatedBy: { id: "admin-1", displayName: "Admin" },
    draft: snapshot,
  };
  const saves: Record<string, unknown>[] = [];
  const creates: Record<string, unknown>[] = [];
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    async (route) => {
      const path = new URL(route.request().url()).pathname;
      const json = (body: unknown) =>
        route.fulfill({ body: JSON.stringify(body), contentType: "application/json" });
      if (path === sessionPath) return json(sessionSummary({ id: `${role}-1`, role }));
      if (path === "/api/v1/admin/content-models") return json({ items: [model] });
      if (path === "/api/v1/admin/entries/entry-1") return json(current);
      if (path === "/api/v1/admin/build-site") return json({ site: null });
      if (path.endsWith("/models/posts/entries")) {
        if (route.request().method() === "POST") {
          const input = route.request().postDataJSON();
          creates.push(input);
          current = { ...current, draft: { ...snapshot, ...input } };
          return json(current);
        }
        return json({ items: [], totals: { all: 0, draft: 0, changed: 0, published: 0 } });
      }
      if (path.endsWith("/draft")) {
        const { expectedRevision: _revision, ...draft } = route.request().postDataJSON();
        saves.push(draft);
        current = {
          ...current,
          draft: { ...current.draft, ...draft, revision: current.draft.revision + 1 },
        };
        return json(current);
      }
      if (path.endsWith("/media/media-1"))
        return json({
          id: "media-1",
          filename: "cover.png",
          mimeType: "image/png",
          size: 12,
          status: "active",
          createdAt: snapshot.createdAt,
          updatedAt: snapshot.updatedAt,
          usageCount: 0,
          usage: [],
          createdBy: { id: "admin-1", displayName: "Admin" },
          url: "/api/v1/public/media/media-1",
        });
      if (path.endsWith("/public/media/media-1"))
        return route.fulfill({
          contentType: "image/svg+xml",
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" />',
        });
      if (path.endsWith("/site-builds")) return json({ items: [] });
      return route.fallback();
    },
  );
  return { saves, creates };
}

for (const width of [1280, 390]) {
  test(`CE9B recursive layouts retain rich text/media, reorder and reveal errors at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const state = await mock(page);
    await page.goto("/admin/content/posts/entry-1");
    const entryFields = page.getByRole("region", { name: "Fields", exact: true });
    await entryFields.getByRole("tab", { name: "Cards tab", exact: true }).click();
    await openAllItems(page);
    const list = entryFields.getByRole("list", { name: "Cards", exact: true });
    const first = list.getByRole("listitem").first();
    await first.getByRole("tab", { name: "Rich tab", exact: true }).click();
    const rich = first.getByRole("textbox", { name: "Body", exact: true });
    const identity = await rich.elementHandle();
    await rich.click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type(" edited");
    await expect(first).toContainText("cover.png");
    await itemAction(page, "Cards item 1", "Move down", { scope: first });
    const moved = list.getByRole("listitem").nth(1);
    await expect(moved.getByRole("textbox", { name: "Body", exact: true })).toHaveText(
      "Rich one edited",
    );
    expect(await identity!.evaluate((node) => node.isConnected)).toBe(true);
    await moved.getByRole("tab", { name: "Link tab", exact: true }).click();
    await moved.getByRole("textbox", { name: "Address", exact: true }).fill("javascript:bad");
    await entryFields.getByRole("button", { name: "Collapse Cards item 2" }).click();
    await entryFields.getByRole("tab", { name: "Overview tab", exact: true }).click();
    await page.getByRole("button", { name: "Save draft" }).click();
    await page.getByRole("link", { name: "Address in Item 2 in Cards", exact: true }).click();
    await expect(moved.getByRole("textbox", { name: "Address", exact: true })).toBeFocused();
    await moved.getByRole("textbox", { name: "Address", exact: true }).fill("/changed");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("Saved revision 2")).toBeVisible();
    expect(state.saves).toHaveLength(1);
    const saved = state.saves[0]!.fields as typeof initialForAssertion;
    expect(saved.cards[1]!.image).toBe("media-1");
    expect(saved.cards[1]!.body.content[0]!.content[0]!.text).toBe("Rich one edited");
    expect(saved.cards[1]!.address).toBe("/changed");
    expect(JSON.stringify(state.saves)).not.toContain('"layout"');
    const block = page.getByRole("article");
    await block.getByRole("tab", { name: "Settings", exact: true }).click();
    await expect(block.getByRole("tab", { name: "Style tab", exact: true })).toBeVisible();
    await block.getByRole("tab", { name: "Content", exact: true }).click();
    await page.reload();
    await entryFields.getByRole("tab", { name: "Cards tab", exact: true }).click();
    await openAllItems(page);
    await list
      .getByRole("listitem")
      .nth(1)
      .getByRole("tab", { name: "Rich tab", exact: true })
      .click();
    await expect(
      list.getByRole("listitem").nth(1).getByRole("textbox", { name: "Body", exact: true }),
    ).toHaveText("Rich one edited");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await expectNoAccessibilityViolations(page, `CE9B layout ${width}`);
  });
}
// A narrowed view of the asserted save fields; transport tests validate the complete DTO.
declare const initialForAssertion: {
  cards: { image: string; address: string; body: { content: { content: { text: string }[] }[] } }[];
};

test("CE9B viewers operate keyboard tabs without edits", async ({ page }) => {
  await mock(page, "viewer");
  await page.goto("/admin/content/posts/entry-1");
  const fields = page.getByRole("region", { name: "Fields", exact: true });
  await fields.getByRole("tab", { name: "Overview tab", exact: true }).focus();
  await page.keyboard.press("End");
  await expect(fields.getByRole("tab", { name: "Cards tab", exact: true })).toBeFocused();
  await openAllItems(page);
  await expect(fields.getByRole("textbox", { name: "Note", exact: true }).first()).toBeDisabled();
  await fields.getByRole("tab", { name: "Cards tab", exact: true }).focus();
  await page.keyboard.press("Home");
  await expect(fields.getByRole("tab", { name: "Overview tab", exact: true })).toBeFocused();
  await expect(page.getByRole("button", { name: "Save draft" })).toHaveCount(0);
  await expectNoAccessibilityViolations(page, "CE9B viewer");
});

test("CE9B new-entry slug follows title, stops on manual editing and opens clean", async ({
  page,
}) => {
  const state = await mock(page);
  await page.goto("/admin/content/posts");
  await page.getByRole("button", { name: "Create entry" }).click();
  const dialog = page.getByRole("dialog", { name: "Create entry" });
  await dialog.getByRole("textbox", { name: "Title", exact: true }).fill("Café & News");
  await expect(dialog.getByRole("textbox", { name: "Slug", exact: true })).toHaveValue("cafe-news");
  await dialog.getByRole("textbox", { name: "Slug", exact: true }).fill("manual");
  await dialog.getByRole("textbox", { name: "Title", exact: true }).fill("Other title");
  await expect(dialog.getByRole("textbox", { name: "Slug", exact: true })).toHaveValue("manual");
  await dialog.getByRole("checkbox", { name: "Suggest from title" }).check();
  await expect(dialog.getByRole("textbox", { name: "Slug", exact: true })).toHaveValue(
    "other-title",
  );
  await dialog.getByRole("button", { name: "Create entry" }).click();
  await expect(page).toHaveURL(/\/posts\/entry-1$/u);
  await expect(page.getByLabel("Slug", { exact: true })).toHaveValue("other-title");
  await expect(page.getByRole("button", { name: "Save draft" })).toBeDisabled();
  await page.getByRole("textbox", { name: "Title", exact: true }).fill("Later title");
  await expect(page.getByLabel("Slug", { exact: true })).toHaveValue("other-title");
  expect(state.creates).toMatchObject([{ slug: "other-title", title: "Other title" }]);
});

test("CE9B block summary reveals Content, layout tabs and collapsed item", async ({ page }) => {
  await mock(page);
  await page.goto("/admin/content/posts/entry-1");
  const block = page.getByRole("article");
  await block.getByRole("tab", { name: "Cards tab", exact: true }).click();
  await openAllItems(page);
  const item = block
    .getByRole("list", { name: "Cards", exact: true })
    .getByRole("listitem")
    .first();
  await item.getByRole("tab", { name: "Link tab", exact: true }).click();
  await item.getByRole("textbox", { name: "Address", exact: true }).fill("javascript:bad");
  await block.getByRole("button", { name: "Collapse Cards item 1", exact: true }).click();
  await block.getByRole("tab", { name: "Overview tab", exact: true }).click();
  await block.getByRole("tab", { name: "Settings", exact: true }).click();
  await block.getByRole("button", { name: "Collapse Card block", exact: true }).click();
  await page.getByRole("button", { name: "Save draft" }).click();
  await page
    .getByRole("link", { name: "Address in Item 1 in Cards in Card block 1", exact: true })
    .click();
  await expect(item.getByRole("textbox", { name: "Address", exact: true })).toBeFocused();
  await expect(block.getByRole("tab", { name: /Content/ }).first()).toHaveAttribute(
    "aria-selected",
    "true",
  );
});
