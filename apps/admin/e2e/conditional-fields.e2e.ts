import { expect, test, type Page, type Route } from "@playwright/test";
import { defineBlock, field, toBlockMetadata } from "@lacecms/content";
import { expectNoAccessibilityViolations } from "./support/accessibility.js";
import { sessionPath, sessionSummary } from "./support/session.js";

// Match API calls by pathname prefix; a glob such as `**/api/**` would also
// intercept Vite module URLs like `/admin/src/shared/api/index.ts`.
const isApiRequest = (url: URL) => url.pathname.startsWith("/api/");

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

function media(id: string, filename: string) {
  return {
    createdAt: "2026-11-01T00:00:00.000Z",
    createdBy: { displayName: "Ada Editor", id: "editor-1" },
    filename,
    height: 600,
    id,
    mimeType: "image/png",
    size: 2048,
    status: "active" as const,
    tags: [],
    updatedAt: "2026-11-01T00:00:00.000Z",
    url: `https://lace.test/api/v1/public/media/${id}`,
    usageCount: 0,
    width: 800,
  };
}

// A list whose items hold either an image or a video, chosen by `kind`.
const showcase = defineBlock({
  fields: {
    items: field.list({
      item: field.group({
        fields: {
          kind: field.select({
            defaultValue: "image",
            label: "Kind",
            options: ["image", "video"],
            presentation: {
              control: "cards",
              choices: [
                { value: "image", label: "Image", description: "A picture from the library." },
                { value: "video", label: "Video", description: "A YouTube or Vimeo link." },
              ],
            },
            required: true,
          }),
          media: field.media({ label: "Image", required: true }),
          alt: field.text({ label: "Alt text" }),
          videoUrl: field.url({ label: "Video URL", required: true }),
          videoTitle: field.text({ label: "Video title", required: true }),
          caption: field.text({ label: "Caption" }),
        },
        visibility: {
          media: { field: "kind", values: ["image"] },
          alt: { field: "kind", values: ["image"] },
          videoUrl: { field: "kind", values: ["video"] },
          videoTitle: { field: "kind", values: ["video"] },
        },
      }),
      itemLabel: "caption",
      label: "Items",
      maxItems: 10,
    }),
  },
  label: "Showcase",
  type: "showcase",
  version: 1,
});

const model = {
  blockDefinitions: [toBlockMetadata(showcase)],
  blocks: ["showcase"],
  fields: {
    hasCta: field.boolean({ label: "Has call to action" }),
    ctaUrl: field.url({ label: "Action URL", required: true }),
  },
  key: "posts",
  kind: "collection",
  route: "/posts/:slug",
  version: 1,
  visibility: { ctaUrl: { field: "hasCta", values: [true] } },
};

const items = [
  { caption: "Photo", kind: "image", media: "media-a" },
  {
    caption: "Studio walk-through",
    kind: "video",
    media: "media-a",
    videoTitle: "Studio",
    videoUrl: "https://vimeo.com/1",
  },
];

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ body: JSON.stringify(body), contentType: "application/json", status });
}

/** A stateful entry with one showcase block; `reject` answers the next save or publish. */
async function mockApi(page: Page, role: "admin" | "editor" | "viewer" = "editor") {
  const library = [media("media-a", "a.png"), media("media-b", "b.png"), media("media-c", "c.png")];
  let snapshot = {
    blocks: [
      {
        data: { items },
        hidden: false,
        key: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
        position: 1000,
        schemaVersion: 1,
        settings: {},
        type: "showcase",
      },
    ],
    createdAt: "2026-11-01T00:00:00.000Z",
    entryId: "entry-1",
    fields: { hasCta: false },
    id: "snapshot-1",
    revision: 1,
    slug: "portfolio",
    state: "draft",
    title: "Portfolio",
    updatedAt: "2026-11-01T00:00:00.000Z",
    updatedBy: { id: `${role}-1`, role },
  };
  const state = {
    reject: undefined as { readonly on: "publish" | "save"; readonly path: string } | undefined,
    saves: [] as Record<string, unknown>[],
  };
  const entry = () => ({
    draft: snapshot,
    id: "entry-1",
    model: { key: "posts", kind: "collection", route: "/posts/:slug" },
    updatedBy: { displayName: "editor@lace.test", id: "editor-1" },
  });
  const rejected = (on: "publish" | "save") => {
    if (state.reject?.on !== on) return undefined;
    const { path } = state.reject;
    state.reject = undefined;
    return {
      error: {
        code: "VALIDATION_FAILED",
        details: {
          issues: [
            {
              code: on === "publish" ? "missing_required_field" : "invalid_field_value",
              message: "Rejected.",
              path,
            },
          ],
        },
        message: "The request did not satisfy the API contract.",
      },
    };
  };
  await page.route(isApiRequest, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    if (url.pathname === sessionPath) return json(route, sessionSummary({ id: `${role}-1`, role }));
    if (url.pathname === "/api/v1/admin/content-models") return json(route, { items: [model] });
    if (url.pathname === "/api/v1/admin/entries/entry-1" && method === "GET")
      return json(route, entry());
    if (url.pathname === "/api/v1/admin/entries/entry-1/draft") {
      const rejection = rejected("save");
      if (rejection !== undefined) return json(route, rejection, 422);
      const { expectedRevision: _expectedRevision, ...input } = request.postDataJSON();
      state.saves.push(input);
      snapshot = { ...snapshot, ...input, revision: snapshot.revision + 1 };
      return json(route, entry());
    }
    if (url.pathname === "/api/v1/admin/entries/entry-1/publish") {
      const rejection = rejected("publish");
      if (rejection !== undefined) return json(route, rejection, 422);
    }
    if (url.pathname.endsWith("/preview"))
      return route.fulfill({ body: png, contentType: "image/png" });
    if (url.pathname === "/api/v1/admin/media/tags") return json(route, { items: [] });
    if (url.pathname === "/api/v1/admin/media" && method === "GET")
      return json(route, { items: library });
    const detail = /^\/api\/v1\/admin\/media\/([^/]+)$/u.exec(url.pathname);
    const item = library.find((candidate) => candidate.id === detail?.[1]);
    if (item !== undefined) return json(route, { ...item, alt: undefined, usage: [] });
    if (url.pathname.endsWith("/build-site")) return json(route, { site: null });
    return json(route, { items: [], totals: { all: 0, changed: 0, draft: 0, published: 0 } });
  });
  return state;
}

const row = (page: Page, position: number) =>
  page.getByRole("listitem").filter({
    has: page.getByRole("button", { name: `Expand Items item ${position}`, exact: true }),
  });

for (const width of [320, 1280])
  test(`switching kinds shows applicable fields and keeps hidden values at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const state = await mockApi(page);
    await page.goto("/admin/content/posts/entry-1");

    // The video row is not described by its stale image.
    const video = row(page, 2);
    await expect(video).toContainText("Studio walk-through");
    // Hidden fields stay mounted, so only their visibility can be checked.
    await expect(video.getByText("a.png")).toBeHidden();
    await expect(video.getByText("No alt", { exact: true })).toBeHidden();
    await expect(row(page, 1).getByText("No alt", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Expand Items item 1", exact: true }).click();
    const item = page.getByRole("group", { name: "Items item 1", exact: true });
    await expect(item.getByRole("textbox", { name: "Alt text" })).toBeVisible();
    await expect(item.getByRole("textbox", { name: "Video URL" })).toHaveCount(0);
    await item.getByRole("radio", { name: /Video/u }).click();
    await expect(item.getByRole("textbox", { name: "Alt text" })).toHaveCount(0);
    await item.getByRole("textbox", { name: "Video URL" }).fill("https://vimeo.com/2");
    await item.getByRole("radio", { name: /Image/u }).click();
    await expect(item.getByRole("textbox", { name: "Video URL" })).toHaveCount(0);
    await expect(item.getByText("a.png")).toBeVisible();

    const cta = page.getByRole("switch", { name: "Has call to action" });
    await expect(page.getByRole("textbox", { name: "Action URL" })).toHaveCount(0);
    await cta.click();
    await expect(page.getByRole("textbox", { name: "Action URL" })).toBeVisible();
    await cta.click();

    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("Saved revision 2")).toBeVisible();
    const saved = state.saves[0]!.blocks as { data: { items: unknown[] } }[];
    expect(saved[0]!.data.items[0]).toEqual({
      caption: "Photo",
      kind: "image",
      media: "media-a",
      videoUrl: "https://vimeo.com/2",
    });
    expect(state.saves[0]!.fields).toEqual({ hasCta: false });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (width === 320) await expectNoAccessibilityViolations(page, "conditional fields 320");
  });

test("a stale publication problem follows its field's visibility", async ({ page }) => {
  const state = await mockApi(page, "admin");
  await page.goto("/admin/content/posts/entry-1");
  state.reject = { on: "publish", path: "/blocks/0/data/items/1/videoUrl" };
  await page.getByRole("button", { name: "Publish" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Confirm publication" }).click();
  const summary = page.getByRole("alert", { name: "There is 1 problem to fix" });
  await summary
    .getByRole("link", { name: "Video URL in Item 2 in Items in Showcase block 1" })
    .click();
  const item = page.getByRole("group", { name: "Items item 2", exact: true });
  await expect(item.getByRole("textbox", { name: "Video URL" })).toBeFocused();

  await item.getByRole("radio", { name: /Image/u }).click();
  await expect(summary).toHaveCount(0);
  await expect(item.getByRole("textbox", { name: "Video URL" })).toHaveCount(0);
  await expect(page.getByText("Has problems")).toHaveCount(0);
  await item.getByRole("radio", { name: /Video/u }).click();
  await expect(item.getByRole("textbox", { name: "Video URL" })).toHaveAccessibleDescription(
    /Rejected|required/u,
  );
});

test("a hidden invalid value stays shown until it is fixed", async ({ page }) => {
  const state = await mockApi(page);
  await page.goto("/admin/content/posts/entry-1");
  await page.getByRole("button", { name: "Expand Items item 1", exact: true }).click();
  const item = page.getByRole("group", { name: "Items item 1", exact: true });
  await item.getByRole("radio", { name: /Video/u }).click();
  await item.getByRole("textbox", { name: "Video URL" }).fill("not a url");
  await item.getByRole("radio", { name: /Image/u }).click();
  await page.getByRole("button", { name: "Save draft" }).click();
  await page
    .getByRole("link", { name: "Video URL in Item 1 in Items in Showcase block 1" })
    .click();
  const url = item.getByRole("textbox", { name: "Video URL" });
  await expect(url).toBeFocused();
  await expect(url).toHaveAccessibleDescription(
    /Shown to fix a problem in a stored value\. Applies when Kind is Video\./u,
  );
  expect(state.saves).toHaveLength(0);
  await url.fill("");
  await expect(url).toHaveCount(0);
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Saved revision 2")).toBeVisible();
});

test("adding several images to a conditional list starts each item as an image", async ({
  page,
}) => {
  const state = await mockApi(page);
  await page.goto("/admin/content/posts/entry-1");
  await page.getByRole("button", { name: "Add Items item" }).click();
  const dialog = page.getByRole("dialog", { name: "Add media to Items" });
  const grid = dialog.getByRole("list", { name: "Media choices for Items" });
  await grid.getByRole("button", { name: "b.png" }).click();
  await grid.getByRole("button", { name: "c.png" }).click();
  await dialog.getByRole("button", { name: "Add 2 images" }).click();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Saved revision 2")).toBeVisible();
  const saved = state.saves[0]!.blocks as { data: { items: unknown[] } }[];
  expect(saved[0]!.data.items.slice(2)).toEqual([
    { kind: "image", media: "media-b" },
    { kind: "image", media: "media-c" },
  ]);
});

test("viewers see only the applicable fields", async ({ page }) => {
  await mockApi(page, "viewer");
  await page.goto("/admin/content/posts/entry-1");
  await page.getByRole("button", { name: "Expand Items item 2", exact: true }).click();
  const item = page.getByRole("group", { name: "Items item 2", exact: true });
  await expect(item.getByRole("textbox", { name: "Video URL" })).toBeVisible();
  await expect(item.getByRole("textbox", { name: "Alt text" })).toHaveCount(0);
  await expect(item.getByText("a.png")).toBeHidden();
  await expect(page.getByRole("textbox", { name: "Action URL" })).toHaveCount(0);
});
