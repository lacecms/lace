import { expect, test, type Page } from "@playwright/test";
import { builtInBlocks, toBlockMetadata } from "@lacecms/content";
import { sessionPath, sessionSummary } from "./support/session.js";
import { expectNoAccessibilityViolations } from "./support/accessibility.js";

async function mock(page: Page, rejectSave = false) {
  let snapshot = {
    id: "snapshot-1",
    entryId: "entry-1",
    state: "draft",
    revision: 1,
    title: "Layouts",
    slug: "layouts",
    createdAt: "2026-10-21T00:00:00.000Z",
    updatedAt: "2026-10-21T00:00:00.000Z",
    updatedBy: { id: "admin-1", role: "admin" },
    fields: {},
    blocks: [
      {
        key: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
        type: "gallery",
        schemaVersion: 4,
        position: 1000,
        hidden: false,
        data: { images: [] },
        settings: { lightbox: false, layoutMode: "grid", layoutWrap: true, layoutPreset: "auto" },
      },
    ],
  };
  snapshot.blocks.push({
    ...structuredClone(snapshot.blocks[0]!),
    key: "01ARZ3NDEKTSV4RRFFQ69G5FAW",
    position: 2000,
    settings: {
      lightbox: false,
      layoutMode: "flex-column",
      layoutWrap: false,
      layoutPreset: "featured-first",
    },
  });
  const saves: unknown[] = [];
  let mediaReads = 0;
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    async (route) => {
      const path = new URL(route.request().url()).pathname;
      const json = (body: unknown) =>
        route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
      if (path === sessionPath) return json(sessionSummary({ id: "admin-1", role: "admin" }));
      if (path.endsWith("/content-models"))
        return json({
          items: [
            {
              key: "posts",
              kind: "collection",
              route: "/posts/:slug",
              version: 1,
              fields: {},
              blocks: ["gallery"],
              blockDefinitions: [toBlockMetadata(builtInBlocks.gallery)],
            },
          ],
        });
      if (path === "/api/v1/admin/entries/entry-1")
        return json({
          id: "entry-1",
          model: { key: "posts", kind: "collection", route: "/posts/:slug" },
          updatedBy: { id: "admin-1", displayName: "Admin" },
          draft: snapshot,
        });
      if (path.endsWith("/draft")) {
        if (rejectSave)
          return route.fulfill({
            status: 422,
            contentType: "application/json",
            body: JSON.stringify({
              error: {
                code: "VALIDATION_FAILED",
                message: "Invalid stored setting",
                details: {
                  issues: [
                    {
                      code: "invalid_value",
                      message: "Invalid stored wrap",
                      path: "/blocks/0/settings/layoutWrap",
                    },
                  ],
                },
              },
            }),
          });
        const { expectedRevision: _expectedRevision, ...input } = route.request().postDataJSON();
        saves.push(input);
        snapshot = { ...snapshot, ...input, revision: snapshot.revision + 1 };
        return json({
          id: "entry-1",
          model: { key: "posts", kind: "collection", route: "/posts/:slug" },
          updatedBy: { id: "admin-1", displayName: "Admin" },
          draft: snapshot,
        });
      }
      if (path.includes("/media")) mediaReads++;
      if (path.endsWith("/build-site")) return json({ site: null });
      return json({ items: [], totals: { all: 0, draft: 0, changed: 0, published: 0 } });
    },
  );
  return { saves, mediaReads: () => mediaReads };
}
for (const width of [320, 1280])
  for (const theme of ["light", "dark"]) {
    test(`LIST2 conditional schematic cards ${theme} at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem("lace:admin-theme", value), theme);
      const state = await mock(page);
      await page.goto("/admin/content/posts/entry-1");
      const block = page.getByRole("article").first();
      await block.getByRole("tab", { name: "Settings", exact: true }).click();
      const mode = block.getByRole("radiogroup", { name: "Arrangement", exact: true });
      const preset = block.getByRole("radiogroup", { name: "Grid preset", exact: true });
      await expect(mode.getByRole("radio")).toHaveCount(3);
      await expect(preset.getByRole("radio")).toHaveCount(7);
      expect(await block.locator('[aria-hidden="true"] .absolute').count()).toBeGreaterThan(0);
      await preset.getByRole("radio", { name: "Three columns", exact: true }).click();
      await expect(block.getByRole("switch", { name: "Wrap items" })).toHaveCount(0);
      await mode.getByRole("radio", { name: "Grid", exact: true }).focus();
      await page.keyboard.press("ArrowRight");
      await expect(mode.getByRole("radio", { name: "Horizontal", exact: true })).toBeChecked();
      await expect(mode.getByRole("radio", { name: "Horizontal", exact: true })).toBeFocused();
      await expect(preset).toHaveCount(0);
      await block.getByRole("switch", { name: "Wrap items" }).click();
      await mode.getByRole("radio", { name: "Vertical", exact: true }).click();
      await expect(block.getByRole("switch", { name: "Wrap items" })).not.toBeChecked();
      await expect(preset).toHaveCount(0);
      await mode.getByRole("radio", { name: "Horizontal", exact: true }).click();
      const second = page.getByRole("article").nth(1);
      await second.getByRole("tab", { name: "Settings", exact: true }).click();
      await expect(second.getByRole("radio", { name: "Vertical", exact: true })).toBeChecked();
      await expect(second.getByRole("switch", { name: "Wrap items" })).not.toBeChecked();
      await expect(
        second.getByRole("radiogroup", { name: "Grid preset", exact: true }),
      ).toHaveCount(0);
      await page.getByRole("button", { name: "Save draft" }).click();
      await expect(page.getByText("Saved revision 2")).toBeVisible();
      expect(JSON.stringify(state.saves)).toContain('"layoutMode":"flex-row"');
      expect(JSON.stringify(state.saves)).not.toMatch(/presentation|diagram/);
      await page.reload();
      await block.getByRole("tab", { name: "Settings", exact: true }).click();
      await expect(block.getByRole("radio", { name: "Horizontal", exact: true })).toBeChecked();
      await expect(block.getByRole("switch", { name: "Wrap items" })).not.toBeChecked();
      await mode.getByRole("radio", { name: "Grid", exact: true }).click();
      await expect(preset.getByRole("radio", { name: "Three columns", exact: true })).toBeChecked();
      // Tab leaves the active radio group; hidden Wrap items cannot receive focus.
      await preset.getByRole("radio", { name: "Three columns", exact: true }).focus();
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => document.activeElement?.closest("[hidden]") === null)).toBe(
        true,
      );
      await page.getByRole("button", { name: "Save draft" }).click();
      await expect(page.getByText("Saved revision 3")).toBeVisible();
      expect(state.mediaReads()).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await expectNoAccessibilityViolations(page, `LIST2 ${theme} ${width}`);
    });
  }

test("LIST2 summary reveals and focuses an inactive setting without changing mode", async ({
  page,
}) => {
  await mock(page, true);
  await page.goto("/admin/content/posts/entry-1");
  await page.getByRole("textbox", { name: "Title", exact: true }).first().fill("Changed");
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.getByRole("link", { name: "Wrap items in Gallery block 1", exact: true }).click();
  const block = page.getByRole("article").first();
  const wrap = block.getByRole("switch", { name: "Wrap items" });
  await expect(wrap).toBeFocused();
  await expect(wrap).toHaveAccessibleDescription(/Shown to resolve.*Invalid stored wrap/);
  await expect(block.getByRole("radio", { name: "Grid", exact: true })).toBeChecked();
  await wrap.click();
  await expect(wrap).toHaveCount(0);
});
