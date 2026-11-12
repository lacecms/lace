import { expect, test } from "@playwright/test";
import { sessionPath, sessionSummary } from "./support/session.js";

test.use({ hasTouch: true });

test("collection controls fit on wide screens and wrap on narrow screens", async ({ page }) => {
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    async (route) => {
      const path = new URL(route.request().url()).pathname;
      let body: unknown = {};
      if (path === sessionPath) body = sessionSummary({ id: "editor", role: "editor" });
      else if (path === "/api/v1/admin/content-models")
        body = {
          items: [
            {
              key: "posts",
              kind: "collection",
              label: "Posts",
              route: "/posts/:slug",
              version: 1,
              blocks: [],
              fields: {
                venue: {
                  type: "text",
                  required: false,
                  label: "Organisation or venue with a very long descriptive name",
                },
              },
              listOptions: { sortableFields: ["venue"], filterableFields: ["venue"] },
            },
          ],
        };
      else if (path.endsWith("/entries"))
        body = { items: [], totals: { all: 0, changed: 0, draft: 0, published: 0 } };
      await route.fulfill({ json: body });
    },
  );
  await page.setViewportSize({ width: 1800, height: 800 });
  await page.goto("/admin/content/posts?sort=-field%3Avenue");
  const toolbar = page.getByRole("group", { name: "Collection list controls" });
  const sort = toolbar.getByRole("combobox", { name: "Sort entries" });
  const search = toolbar.getByRole("searchbox", { name: "Search entries" });
  const filters = toolbar.getByRole("button", { name: "Filters", exact: true });
  await expect(sort).toHaveValue("field:venue");
  const [sortBox, searchBox, filterBox] = await Promise.all([
    sort.boundingBox(),
    search.boundingBox(),
    filters.boundingBox(),
  ]);
  expect(sortBox).not.toBeNull();
  expect(searchBox).not.toBeNull();
  expect(filterBox).not.toBeNull();
  expect(Math.abs(sortBox!.y - searchBox!.y)).toBeLessThan(5);
  expect(Math.abs(sortBox!.y - filterBox!.y)).toBeLessThan(5);
  await page.setViewportSize({ width: 390, height: 700 });
  await expect(sort).toBeVisible();
  await expect(search).toBeVisible();
  await expect(filters).toBeVisible();
  await toolbar.getByRole("button", { name: "Search information" }).tap();
  await expect(page.getByRole("dialog", { name: "Search information" })).toContainText(
    "ASCII case is ignored",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Search information" })).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await sort.focus();
  await page.keyboard.press("Tab");
  await expect(toolbar.getByRole("button", { name: "Sort descending" })).toBeFocused();
});
