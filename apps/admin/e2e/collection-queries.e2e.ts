import { expect, test } from "@playwright/test";
import { startCollectionQueryBackend } from "./support/collection-query-backend.mjs";
import { expectNoAccessibilityViolations } from "./support/accessibility.js";

for (const kind of ["node", "d1"] as const) {
  test.describe(`${kind} real collection queries`, () => {
    let backend: Awaited<ReturnType<typeof startCollectionQueryBackend>>;
    test.beforeAll(async () => {
      backend = await startCollectionQueryBackend(kind);
    });
    test.afterAll(async () => {
      await backend?.close();
    });
    test("configured controls, literal search, URL/history and all read roles", async ({
      page,
      context,
    }) => {
      test.setTimeout(60_000);
      for (const role of ["viewer", "editor", "admin"]) {
        await context.addCookies([{ name: "cqRole", value: role, url: backend.origin }]);
        await page.goto(`${backend.origin}/admin/content/posts`);
        await expect(page.getByRole("table", { name: "Posts entries" })).toBeVisible();
        await expect(page.getByRole("combobox", { name: "Sort entries" })).toBeVisible();
        await page.getByRole("combobox", { name: "Sort entries" }).selectOption("field:orderText");
        await expect(page).toHaveURL(/field/);
        await expect(page.getByRole("columnheader", { name: "Hidden order" })).toHaveCount(0);
      }
      await page.getByRole("button", { name: "Filters", exact: true }).click();
      await expect(page.getByRole("dialog", { name: "Filters", exact: true })).toBeVisible();
      await page.getByLabel("Field", { exact: true }).selectOption("featured");
      await page.getByRole("button", { name: "Apply filter" }).click();
      await expect(page.getByRole("button", { name: "Remove filter Featured" })).toBeVisible();
      await expect(page.getByText("Showing 27 of 27")).toBeVisible();
      await page.getByRole("button", { name: "Filters", exact: true }).focus();
      await page.keyboard.press("Enter");
      await page.getByLabel("Field", { exact: true }).selectOption("year");
      await page.getByLabel("Operator", { exact: true }).selectOption("range");
      await page.getByLabel("Minimum", { exact: true }).fill("50");
      await page.getByRole("button", { name: "Apply filter" }).click();
      await expect(page.getByText("Showing 2 of 2")).toBeVisible();
      await page.getByRole("button", { name: "Filters", exact: true }).click();
      await page.getByLabel("Field", { exact: true }).selectOption("category");
      await page.getByLabel("news", { exact: true }).check();
      await page.getByLabel("events", { exact: true }).check();
      await page.getByRole("button", { name: "Apply filter" }).click();
      await page.reload();
      await expect(page.getByText("Showing 2 of 2")).toBeVisible();
      await page.getByRole("button", { name: "Clear filters", exact: true }).click();
      await expect(page.getByRole("combobox", { name: "Sort entries" })).toHaveValue(
        "field:orderText",
      );
      const search = page.getByRole("searchbox", { name: "Search entries" });
      await search.fill("launch");
      await expect(page.getByText("Showing 50 of 55")).toBeVisible();
      await search.fill("МОСКВА");
      await expect(page.getByRole("heading", { name: "No matching entries" })).toBeVisible();
      await search.fill("Москва");
      await expect(page.getByText("Showing 50 of 55")).toBeVisible();
      await page.reload();
      await expect(search).toHaveValue("Москва");
      await expect(page.getByRole("combobox", { name: "Sort entries" })).toHaveValue(
        "field:orderText",
      );
      const validUrl = page.url();
      await page.goto(`${backend.origin}/admin/content/posts?q=Launch`);
      await page.goBack();
      await expect(page).toHaveURL(validUrl);
      await expect(search).toHaveValue("Москва");
      await page.goForward();
      await expect(search).toHaveValue("Launch");
      await search.fill("%_\\");
      await expect(page.getByText("Showing 50 of 55")).toBeVisible();
      await expect(page).toHaveURL(/q=/);
      await search.fill("я".repeat(25));
      if (kind === "d1") {
        await expect(search).toHaveAttribute("aria-invalid", "true");
        await page.waitForTimeout(350);
        expect(
          backend.requests.filter((url) => new URL(url).searchParams.get("q") === "я".repeat(25)),
        ).toHaveLength(0);
      } else {
        await expect(page.getByRole("heading", { name: "No matching entries" })).toBeVisible();
        expect(
          backend.requests.some((url) => new URL(url).searchParams.get("q") === "я".repeat(25)),
        ).toBe(true);
      }
      await search.fill("Launch");
      await expect(page.getByRole("table", { name: "Posts entries" })).toBeVisible();
      await expectNoAccessibilityViolations(page, `${kind} configured list`);
      await search.fill(kind === "node" ? "a".repeat(200) : "a".repeat(48));
      await expect(page.getByRole("heading", { name: "No matching entries" })).toBeVisible();
      expect(
        backend.requests.some(
          (url) => new URL(url).searchParams.get("q") === "a".repeat(kind === "node" ? 200 : 48),
        ),
      ).toBe(true);
      if (kind === "d1") {
        const filters = encodeURIComponent(
          JSON.stringify([{ field: "year", op: "range", min: 50 }]),
        );
        await page.goto(
          `${backend.origin}/admin/content/posts?q=${encodeURIComponent("я".repeat(25))}&filters=${filters}`,
        );
        await expect(page.getByRole("searchbox", { name: "Search entries" })).toHaveValue("");
        await expect(page.getByText("Showing 5 of 5")).toBeVisible();
      }
      await page.goto(`${backend.origin}/admin/content/legacy`);
      await expect(page.getByRole("heading", { name: "No entries yet" })).toBeVisible();
      await expect(page.getByRole("combobox", { name: "Sort entries" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Filters", exact: true })).toHaveCount(0);
    });
    test("long-string paging and edited/deleted anchor restart retain query intent", async ({
      page,
    }) => {
      for (const action of ["edit", "delete"] as const) {
        await page.goto(
          `${backend.origin}/admin/content/posts?sort=field%3AorderText&status=draft`,
        );
        await expect(page.getByRole("table", { name: "Posts entries" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Load more entries" })).toBeVisible();
        const first = [...backend.responses]
          .reverse()
          .find((response) => response.body.nextCursor)!;
        expect(first.body.nextCursor!.length).toBeLessThanOrEqual(4096);
        const intent = page.url();
        await backend.mutateBoundary(action);
        await page.getByRole("button", { name: "Load more entries" }).click();
        const restart = page.getByRole("button", { name: "Restart list" });
        await expect(restart).toBeVisible();
        const staleRequests = backend.requests.filter((url) =>
          new URL(url).searchParams.has("after"),
        ).length;
        await restart.focus();
        await page.keyboard.press("Enter");
        await expect(page.getByRole("status")).toHaveText(/List restarted/);
        await expect(page).toHaveURL(intent);
        expect(
          backend.requests.filter((url) => new URL(url).searchParams.has("after")),
        ).toHaveLength(staleRequests);
        expect(backend.responses.at(-1)!.status).toBe(200);
        await page.getByRole("button", { name: "Load more entries" }).click();
        await expect(
          page.getByText(action === "delete" ? "Showing 54 of 54" : "Showing 55 of 55"),
        ).toBeVisible();
        await expect(page.getByRole("button", { name: "Load more entries" })).toHaveCount(0);
        await expect(page).not.toHaveURL(/after=/);
      }
    });
  });
}
