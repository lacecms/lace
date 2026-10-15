import { expect, test, type Route } from "@playwright/test";
import { sessionPath, sessionSummary } from "./support/session.js";

// Match API calls by pathname prefix; a glob such as `**/api/**` would also
// intercept Vite module URLs like `/admin/src/shared/api/index.ts`.
const isApiRequest = (url: URL) => url.pathname.startsWith("/api/");

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ contentType: "application/json", status, body: JSON.stringify(body) });
}

test("deletes media used only by a draft after a confirmation that detaches it", async ({
  page,
}) => {
  let item = {
    createdAt: "2026-09-20T00:00:00.000Z",
    createdBy: { displayName: "Ada Editor", id: "editor-1" },
    filename: "bike.png",
    height: 600,
    id: "media-1",
    mimeType: "image/png",
    size: 2048,
    status: "active",
    updatedAt: "2026-09-20T00:00:00.000Z",
    url: "https://lace.test/api/v1/public/media/media-1",
    usageCount: 1,
    width: 800,
  };
  const usage = [
    {
      entryId: "entry-1",
      locations: [
        {
          blockKey: "block-1",
          blockType: "image",
          field: "media",
          source: "block",
          states: ["draft"],
        },
      ],
      modelKey: "posts",
      status: "draft",
      title: "First post",
    },
  ];
  const deletions: string[] = [];
  await page.route(isApiRequest, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    if (url.pathname === sessionPath)
      return json(route, sessionSummary({ id: "editor-1", role: "editor" }));
    if (url.pathname === "/api/v1/admin/content-models") return json(route, { items: [] });
    if (url.pathname.endsWith("/preview"))
      return route.fulfill({ body: png, contentType: "image/png" });
    if (url.pathname === "/api/v1/admin/media" && method === "GET")
      return json(route, { items: [item] });
    if (url.pathname === "/api/v1/admin/media/media-1" && method === "GET")
      return json(route, { ...item, usage: item.usageCount === 0 ? [] : usage });
    if (url.pathname === "/api/v1/admin/media/media-1" && method === "DELETE") {
      deletions.push(url.search);
      item = { ...item, status: "deleting", usageCount: 0 };
      return json(route, item, 202);
    }
    return route.fallback();
  });

  await page.goto("/admin/media");
  await page
    .getByRole("list", { name: "Media library" })
    .getByRole("button", { name: "bike.png" })
    .click();
  const panel = page.getByRole("dialog", { name: "bike.png" });
  await expect(panel.getByText("Only drafts use this media.", { exact: false })).toBeVisible();
  await panel.getByRole("button", { name: "Delete media" }).click();

  const confirm = page.getByRole("dialog", { name: "Delete bike.png?" });
  await expect(confirm.getByRole("list", { name: "Drafts that lose this media" })).toContainText(
    "First post",
  );
  await confirm.getByRole("button", { name: "Remove from drafts and delete" }).click();
  await expect(confirm).toBeHidden();
  expect(deletions).toEqual(["?detach=drafts"]);
  await expect(panel.getByText("Deletion pending")).toBeVisible();
});
