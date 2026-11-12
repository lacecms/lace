import { expect, test } from "@playwright/test";
import { sessionPath, sessionSummary } from "./support/session.js";

for (const viewport of [
  { width: 1200, height: 400 },
  { width: 390, height: 400 },
]) {
  test(`model navigation remains reachable at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.route(
      (url) => url.pathname.startsWith("/api/"),
      async (route) => {
        const path = new URL(route.request().url()).pathname;
        let body: unknown = {};
        if (path === sessionPath) body = sessionSummary({ id: "editor", role: "editor" });
        else if (path === "/api/v1/admin/content-models")
          body = {
            items: Array.from({ length: 24 }, (_, index) => ({
              key: `page-${index}`,
              kind: "page",
              path: `/page-${index}`,
              version: 1,
              label: `Page ${index}`,
              blocks: [],
              fields: {},
            })),
          };
        else if (path.endsWith("/entries"))
          body = { items: [], totals: { all: 0, changed: 0, draft: 0, published: 0 } };
        await route.fulfill({ json: body });
      },
    );
    await page.goto("/admin/content");
    if (viewport.width < 768) await page.getByRole("button", { name: "Open navigation" }).click();
    const nav = page.getByRole("navigation", { name: "Main" });
    const pages = nav.getByRole("button", { name: "Pages" });
    await expect(pages).toHaveAttribute("aria-expanded", "true");
    const last = nav.getByRole("link", { name: "Page 23" });
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeVisible();
    await pages.focus();
    await page.keyboard.press("Enter");
    await expect(pages).toHaveAttribute("aria-expanded", "false");
    await expect(last).toBeHidden();
    await expect(nav.getByRole("link", { name: "Media" })).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(last).toBeVisible();
  });
}
