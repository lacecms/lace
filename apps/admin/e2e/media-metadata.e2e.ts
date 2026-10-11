import { expect, test, type Page, type Route } from "@playwright/test";
import { sessionPath, sessionSummary } from "./support/session.js";

// Match API calls by pathname prefix; a glob such as `**/api/**` would also
// intercept Vite module URLs like `/admin/src/shared/api/index.ts`.
const isApiRequest = (url: URL) => url.pathname.startsWith("/api/");

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

interface MediaItem {
  alt?: string;
  caption?: string;
  readonly createdAt: string;
  readonly createdBy: { readonly displayName: string; readonly id: string };
  readonly filename: string;
  focalPoint?: { x: number; y: number };
  readonly height: number;
  readonly id: string;
  readonly mimeType: string;
  readonly size: number;
  readonly status: "active";
  updatedAt: string;
  readonly url: string;
  readonly usageCount: number;
  readonly width: number;
}

interface Patch {
  readonly body: Record<string, unknown>;
  readonly ifMatch: string | undefined;
}

function media(id: string, filename: string, extra: Partial<MediaItem> = {}): MediaItem {
  return {
    createdAt: "2026-09-20T00:00:00.000Z",
    createdBy: { displayName: "Ada Editor", id: "editor-1" },
    filename,
    height: 600,
    id,
    mimeType: "image/png",
    size: 2048,
    status: "active",
    updatedAt: "2026-09-20T00:00:00.000Z",
    url: `https://lace.test/api/v1/public/media/${id}`,
    usageCount: 1,
    width: 800,
    ...extra,
  };
}

const imageModel = {
  blockDefinitions: [
    {
      fields: {
        alt: { required: false, type: "text" },
        caption: { required: false, type: "text" },
        media: { required: true, type: "media" },
      },
      label: "Image",
      type: "image",
      version: 2,
    },
  ],
  blocks: ["image"],
  fields: {},
  key: "posts",
  kind: "collection",
  route: "/posts/:slug",
  version: 1,
};

function entry(blocks: unknown[]) {
  return {
    draft: {
      blocks,
      createdAt: "2026-09-20T00:00:00.000Z",
      entryId: "entry-1",
      fields: {},
      id: "snapshot-1",
      revision: 2,
      slug: "first-post",
      state: "draft",
      title: "First post",
      updatedAt: "2026-09-20T00:00:00.000Z",
      updatedBy: { id: "editor-1", role: "editor" },
    },
    id: "entry-1",
    model: { key: "posts", kind: "collection", route: "/posts/:slug" },
    updatedBy: { displayName: "editor@lace.test", id: "editor-1" },
  };
}

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ contentType: "application/json", status, body: JSON.stringify(body) });
}

/**
 * A media API with metadata updates guarded like the server: a strong
 * `If-Match` of `updatedAt` in milliseconds, a conflict for stale tags, and a
 * new `updatedAt` per change. `build` decides the reported build outcome.
 */
async function mockMedia(
  page: Page,
  library: MediaItem[],
  options: {
    readonly build?: "queued" | "not-dispatched";
    readonly blocks?: unknown[];
    readonly onDraftSave?: (body: Record<string, unknown>) => void;
  } = {},
) {
  const patches: Patch[] = [];
  let current = entry(options.blocks ?? []);
  await page.route(isApiRequest, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    if (url.pathname === sessionPath)
      return json(route, sessionSummary({ id: "editor-1", role: "editor" }));
    if (url.pathname === "/api/v1/admin/content-models")
      return json(route, { items: [imageModel] });
    if (url.pathname === "/api/v1/admin/entries/entry-1" && method === "GET")
      return json(route, current);
    if (url.pathname === "/api/v1/admin/entries/entry-1/draft" && method === "PUT") {
      const { expectedRevision: _expectedRevision, ...draft } = request.postDataJSON() as Record<
        string,
        unknown
      >;
      options.onDraftSave?.(draft);
      current = {
        ...current,
        draft: { ...current.draft, ...draft, revision: current.draft.revision + 1 },
      };
      return json(route, current);
    }
    if (url.pathname.endsWith("/preview"))
      return route.fulfill({ body: png, contentType: "image/png" });
    if (url.pathname === "/api/v1/admin/media" && method === "GET")
      return json(route, { items: library });
    const detail = /^\/api\/v1\/admin\/media\/([^/]+)$/u.exec(url.pathname);
    const item = library.find((candidate) => candidate.id === detail?.[1]);
    if (detail !== null && item === undefined)
      return json(route, { error: { code: "NOT_FOUND", message: "Not found." } }, 404);
    if (item !== undefined && method === "GET") return json(route, { ...item, usage: [] }, 200);
    if (item !== undefined && method === "PATCH") {
      const ifMatch = request.headers()["if-match"];
      const body = request.postDataJSON() as Record<string, unknown>;
      patches.push({ body, ifMatch });
      if (ifMatch !== `"${Date.parse(item.updatedAt)}"`) {
        return json(
          route,
          { error: { code: "MEDIA_UPDATE_CONFLICT", message: "The media item changed." } },
          409,
        );
      }
      for (const key of ["alt", "caption", "focalPoint"] as const) {
        if (!(key in body)) continue;
        if (body[key] === null) delete item[key];
        else (item as unknown as Record<string, unknown>)[key] = body[key];
      }
      item.updatedAt = new Date(Date.parse(item.updatedAt) + 1000).toISOString();
      return json(route, {
        build:
          options.build === "queued"
            ? { status: "queued", targetVersion: 4 }
            : { status: "not-dispatched" },
        media: item,
      });
    }
    return route.fallback();
  });
  return patches;
}

async function openDetails(page: Page, filename: string) {
  await page.goto("/admin/media");
  await page
    .getByRole("list", { name: "Media library" })
    .getByRole("button", { name: filename })
    .click();
  const panel = page.getByRole("dialog", { name: filename });
  await expect(panel.getByLabel("Alt text")).toBeVisible();
  return panel;
}

test("edits alt text and caption in the details panel and reports the requested build", async ({
  page,
}) => {
  const item = media("media-1", "bike.png");
  const patches = await mockMedia(page, [item], { build: "queued" });
  const panel = await openDetails(page, "bike.png");
  await expect(panel).toContainText("This media has no alt text");

  await panel.getByLabel("Alt text").fill("Red bicycle");
  await panel.getByLabel("Caption").fill("Leaning on a wall");
  await panel.getByRole("button", { name: "Save", exact: true }).click();
  await expect(panel.getByText("Metadata saved. A site build was requested")).toBeVisible();
  expect(patches).toEqual([
    {
      body: { alt: "Red bicycle", caption: "Leaning on a wall" },
      ifMatch: `"${Date.parse("2026-09-20T00:00:00.000Z")}"`,
    },
  ]);
  await expect(panel).not.toContainText("This media has no alt text");
  await expect(panel.getByRole("button", { name: "Save", exact: true })).toBeDisabled();

  // The next save is guarded by the version the first save returned.
  await panel.getByLabel("Alt text").fill("");
  await panel.getByRole("button", { name: "Save", exact: true }).click();
  await expect(panel).toContainText("This media has no alt text");
  expect(patches[1]).toEqual({
    body: { alt: null },
    ifMatch: `"${Date.parse("2026-09-20T00:00:01.000Z")}"`,
  });
});

test("recovers from a concurrent change and protects unsaved edits on close", async ({ page }) => {
  const item = media("media-1", "bike.png", { alt: "Red bicycle", caption: "Old" });
  const patches = await mockMedia(page, [item]);
  const panel = await openDetails(page, "bike.png");

  // Someone else changes the alt text after the panel loaded.
  item.alt = "Blue bicycle";
  item.updatedAt = "2026-09-20T00:00:05.000Z";
  await panel.getByLabel("Caption").fill("Mine");
  await panel.getByRole("button", { name: "Save", exact: true }).click();
  const alert = panel.getByRole("alert");
  await expect(alert).toContainText("Someone else changed this media");
  await expect(alert).toContainText("Blue bicycle");
  await expect(panel.getByLabel("Caption")).toHaveValue("Mine");
  expect(patches).toHaveLength(1);

  await alert.getByRole("button", { name: "Save mine anyway" }).click();
  await expect(panel.getByText("Metadata saved.")).toBeVisible();
  expect(patches[1]).toEqual({
    body: { caption: "Mine" },
    ifMatch: `"${Date.parse("2026-09-20T00:00:05.000Z")}"`,
  });
  await expect(panel.getByLabel("Alt text")).toHaveValue("Blue bicycle");

  await panel.getByLabel("Alt text").fill("Unsaved");
  await page.keyboard.press("Escape");
  const confirm = page.getByRole("dialog", { name: "Discard unsaved changes?" });
  await confirm.getByRole("button", { name: "Keep editing" }).click();
  await expect(confirm).toHaveCount(0);
  await expect(panel.getByLabel("Alt text")).toHaveValue("Unsaved");
  await page.keyboard.press("Escape");
  await confirm.getByRole("button", { name: "Discard changes" }).click();
  await expect(panel).toHaveCount(0);
});

test("sets and resets the focal point with the keyboard only", async ({ page }) => {
  const item = media("media-1", "bike.png", { alt: "Red bicycle" });
  const loadedTag = `"${Date.parse(item.updatedAt)}"`;
  const patches = await mockMedia(page, [item]);
  await page.goto("/admin/media");
  const tile = page
    .getByRole("list", { name: "Media library" })
    .getByRole("button", { name: "bike.png" });
  await tile.focus();
  await page.keyboard.press("Enter");
  const panel = page.getByRole("dialog", { name: "bike.png" });
  const marker = panel.getByRole("slider", { name: "Focal point" });
  await expect(marker).toHaveAttribute("aria-valuetext", "Not set, image centred");

  // Tab from the panel to the marker, the first control in the description.
  await expect(panel).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(marker).toBeFocused();
  const scroll = await panel.evaluate((element) => element.scrollTop);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Shift+ArrowUp");
  await expect(marker).toHaveAttribute("aria-valuetext", "52% from left, 40% from top");
  expect(await panel.evaluate((element) => element.scrollTop)).toBe(scroll);
  await expect(panel).toContainText("Focal point: 52% from left, 40% from top");

  // Reset from the keyboard, then set the point again.
  await page.keyboard.press("Tab");
  await expect(panel.getByRole("button", { name: "Reset focal point" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(marker).toHaveAttribute("aria-valuetext", "Not set, image centred");
  await page.keyboard.press("Shift+Tab");
  await expect(marker).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Shift+ArrowUp");

  // Reset, Alt text, Caption, then Save.
  for (let index = 0; index < 4; index += 1) await page.keyboard.press("Tab");
  await expect(panel.getByRole("button", { name: "Save", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(panel.getByText("Metadata saved.")).toBeVisible();
  expect(patches).toEqual([
    {
      body: { focalPoint: { x: 0.52, y: 0.4 } },
      ifMatch: loadedTag,
    },
  ]);

  // A saved point is cleared by resetting and saving again.
  await panel.getByRole("button", { name: "Reset focal point" }).click();
  await panel.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => patches[1]?.body).toEqual({ focalPoint: null });
});

test("sets the focal point by clicking and dragging on the preview", async ({ page }) => {
  const item = media("media-1", "bike.png", { alt: "Red bicycle" });
  const patches = await mockMedia(page, [item]);
  const panel = await openDetails(page, "bike.png");
  const preview = panel.getByRole("img", { name: "Preview of bike.png" });
  await expect(preview).toBeVisible();
  const box = (await preview.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.75, box.y + box.height * 0.25);
  const marker = panel.getByRole("slider", { name: "Focal point" });
  await expect(marker).toHaveAttribute("aria-valuetext", "75% from left, 25% from top");
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width + 40, box.y + box.height + 40, { steps: 4 });
  await page.mouse.up();
  await expect(marker).toHaveAttribute("aria-valuetext", "100% from left, 100% from top");
  await panel.getByRole("button", { name: "Save", exact: true }).click();
  await expect(panel.getByText("Metadata saved.")).toBeVisible();
  expect(patches[0]?.body).toEqual({ focalPoint: { x: 1, y: 1 } });
});

test("the picker shows alt text and the image block inherits or warns about it", async ({
  page,
}) => {
  const described = media("media-1", "bike.png", { alt: "Red bicycle" });
  const bare = media("media-2", "wall.png");
  let saved: Record<string, unknown> | undefined;
  await mockMedia(page, [described, bare], {
    blocks: [
      {
        data: { media: "media-2" },
        key: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
        position: 100,
        schemaVersion: 2,
        type: "image",
      },
    ],
    onDraftSave: (draft) => {
      saved = draft;
    },
  });
  await page.goto("/admin/content/posts/entry-1");
  await page.getByRole("heading", { name: "Edit posts" }).waitFor();

  const alt = page.getByRole("textbox", { name: "Alt", exact: true });
  const warning = page.getByText("This image has no alt text and will be presented as decorative.");
  await expect(warning).toBeVisible();
  await expect(page.getByText("No alt text", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Replace media for Media" }).click();
  const dialog = page.getByRole("dialog", { name: "Choose media for Media" });
  await expect(dialog.getByRole("button", { name: "bike.png" })).toHaveAccessibleDescription(
    "Red bicycle",
  );
  await expect(dialog.getByRole("button", { name: "wall.png" })).toHaveAccessibleDescription(
    "No alt text",
  );
  await dialog.getByRole("button", { name: "bike.png" }).click();
  await expect(alt).toHaveAttribute("placeholder", "Uses media alt: Red bicycle");
  await expect(warning).toHaveCount(0);
  await expect(page.getByText("Alt text: Red bicycle")).toBeVisible();

  await page.getByRole("button", { name: "Replace media for Media" }).click();
  await dialog.getByRole("button", { name: "wall.png" }).click();
  await expect(warning).toBeVisible();
  await alt.fill("A plain wall");
  await expect(warning).toHaveCount(0);
  await alt.fill("");
  await expect(warning).toBeVisible();

  // The warning never blocks saving.
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Saved revision 3")).toBeVisible();
  expect(saved?.blocks).toEqual([expect.objectContaining({ data: { media: "media-2" } })]);
});
