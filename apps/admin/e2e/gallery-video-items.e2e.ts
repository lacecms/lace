import { expect, test, type Page, type Route } from "@playwright/test";
import { builtInBlocks, toBlockMetadata } from "@lacecms/content";
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
    alt: "Described",
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

const model = {
  blockDefinitions: [toBlockMetadata(builtInBlocks.gallery)],
  blocks: ["gallery"],
  fields: {},
  key: "posts",
  kind: "collection",
  route: "/posts/:slug",
  version: 1,
};

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ body: JSON.stringify(body), contentType: "application/json", status });
}

/** A stateful entry with one empty gallery block; saves are recorded. */
async function mockApi(page: Page) {
  const library = [media("media-a", "a.png"), media("media-b", "b.png")];
  let snapshot = {
    blocks: [
      {
        data: { images: [] },
        hidden: false,
        key: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
        position: 1000,
        schemaVersion: builtInBlocks.gallery.version,
        settings: { layoutMode: "grid", layoutPreset: "auto", layoutWrap: true, lightbox: false },
        type: "gallery",
      },
    ],
    createdAt: "2026-11-01T00:00:00.000Z",
    entryId: "entry-1",
    fields: {},
    id: "snapshot-1",
    revision: 1,
    slug: "portfolio",
    state: "draft",
    title: "Portfolio",
    updatedAt: "2026-11-01T00:00:00.000Z",
    updatedBy: { id: "editor-1", role: "editor" },
  };
  const saves: Record<string, unknown>[] = [];
  const entry = () => ({
    draft: snapshot,
    id: "entry-1",
    model: { key: "posts", kind: "collection", route: "/posts/:slug" },
    updatedBy: { displayName: "editor@lace.test", id: "editor-1" },
  });
  await page.route(isApiRequest, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    if (url.pathname === sessionPath)
      return json(route, sessionSummary({ id: "editor-1", role: "editor" }));
    if (url.pathname === "/api/v1/admin/content-models") return json(route, { items: [model] });
    if (url.pathname === "/api/v1/admin/entries/entry-1" && method === "GET")
      return json(route, entry());
    if (url.pathname === "/api/v1/admin/entries/entry-1/draft") {
      const { expectedRevision: _expectedRevision, ...input } = request.postDataJSON();
      saves.push(input);
      snapshot = { ...snapshot, ...input, revision: snapshot.revision + 1 };
      return json(route, entry());
    }
    if (url.pathname.endsWith("/preview"))
      return route.fulfill({ body: png, contentType: "image/png" });
    if (url.pathname === "/api/v1/admin/media/tags") return json(route, { items: [] });
    if (url.pathname === "/api/v1/admin/media" && method === "GET")
      return json(route, { items: library });
    const detail = /^\/api\/v1\/admin\/media\/([^/]+)$/u.exec(url.pathname);
    const item = library.find((candidate) => candidate.id === detail?.[1]);
    if (item !== undefined) return json(route, { ...item, usage: [] });
    if (url.pathname.endsWith("/build-site")) return json(route, { site: null });
    return json(route, { items: [], totals: { all: 0, changed: 0, draft: 0, published: 0 } });
  });
  return saves;
}

const list = "Images and videos";
const row = (page: Page, position: number) =>
  page.getByRole("listitem").filter({
    has: page.getByRole("button", { name: `Expand ${list} item ${position}`, exact: true }),
  });

for (const width of [320, 1280])
  test(`a gallery mixes images from the picker with an added video at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const saves = await mockApi(page);
    await page.goto("/admin/content/posts/entry-1");

    await page.getByRole("button", { name: `Add ${list} item`, exact: true }).click();
    const dialog = page.getByRole("dialog", { name: `Add media to ${list}` });
    const grid = dialog.getByRole("list", { name: `Media choices for ${list}` });
    await grid.getByRole("button", { name: "a.png" }).click();
    await grid.getByRole("button", { name: "b.png" }).click();
    await dialog.getByRole("button", { name: "Add 2 images" }).click();
    await expect(dialog).toHaveCount(0);

    const addVideo = page.getByRole("button", { name: `Add Video item to ${list}` });
    await expect(addVideo).toHaveText("Add Video");
    await addVideo.click();
    const video = page.getByRole("group", { name: `${list} item 3`, exact: true });
    await expect(video.getByRole("radio", { name: /Video/u })).toBeChecked();
    await expect(video.getByRole("textbox", { name: "Alt text" })).toHaveCount(0);
    await video.getByRole("textbox", { name: "Video URL" }).fill("https://vimeo.com/76979871");
    await video.getByRole("textbox", { name: "Video title" }).fill("Studio tour");
    await video.getByRole("radio", { name: /Ambient/u }).click();
    await video.getByRole("radio", { name: /^1:1/u }).click();

    // Switching the type keeps what was typed for the other kind.
    await video.getByRole("radio", { name: /Image/u }).click();
    await expect(video.getByRole("textbox", { name: "Video URL" })).toHaveCount(0);
    await video.getByRole("radio", { name: /Video/u }).click();
    await expect(video.getByRole("textbox", { name: "Video URL" })).toHaveValue(
      "https://vimeo.com/76979871",
    );

    await page.getByRole("button", { name: `Collapse ${list} item 3`, exact: true }).click();
    await expect(row(page, 3)).toContainText("Studio tour");
    await expect(row(page, 3)).toContainText("Vimeo video");
    await expect(row(page, 3).getByText("No alt", { exact: true })).toHaveCount(0);
    await expect(row(page, 1)).toContainText("a.png");

    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("Saved revision 2")).toBeVisible();
    const saved = saves[0]!.blocks as { data: { images: unknown[] } }[];
    expect(saved[0]!.data.images).toEqual([
      ...["media-a", "media-b"].map((media) => ({
        aspectRatio: "16:9",
        kind: "image",
        media,
        placement: "auto",
        playback: "ambient",
        size: "fill",
      })),
      {
        aspectRatio: "1:1",
        kind: "video",
        placement: "auto",
        playback: "ambient",
        size: "fill",
        videoTitle: "Studio tour",
        videoUrl: "https://vimeo.com/76979871",
      },
    ]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (width === 320) await expectNoAccessibilityViolations(page, "gallery video items 320");
  });
