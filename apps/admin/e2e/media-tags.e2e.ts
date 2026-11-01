import { expect, test, type Page, type Route } from "@playwright/test";
import { expectNoAccessibilityViolations } from "./support/accessibility.js";
import { sessionPath, sessionSummary } from "./support/session.js";

// Match API calls by pathname prefix; a glob such as `**/api/**` would also
// intercept Vite module URLs like `/admin/src/shared/api/index.ts`.
const isApiRequest = (url: URL) => url.pathname.startsWith("/api/");

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

interface MediaItem {
  readonly createdAt: string;
  readonly createdBy: { readonly displayName: string; readonly id: string };
  readonly filename: string;
  readonly height: number;
  readonly id: string;
  readonly mimeType: string;
  readonly size: number;
  readonly status: "active";
  tags: string[];
  updatedAt: string;
  readonly url: string;
  readonly usageCount: number;
  readonly width: number;
}

function media(id: string, filename: string, tags: string[] = []): MediaItem {
  return {
    createdAt: "2026-09-20T00:00:00.000Z",
    createdBy: { displayName: "Ada Editor", id: "editor-1" },
    filename,
    height: 600,
    id,
    mimeType: "image/png",
    size: 2048,
    status: "active",
    tags,
    updatedAt: "2026-09-20T00:00:00.000Z",
    url: `https://lace.test/api/v1/public/media/${id}`,
    usageCount: 0,
    width: 800,
  };
}

const postsModel = {
  blockDefinitions: [],
  blocks: [],
  fields: { cover: { label: "Cover", required: false, type: "media" } },
  key: "posts",
  kind: "collection",
  route: "/posts/:slug",
  version: 1,
};

const entry = {
  draft: {
    blocks: [],
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

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ contentType: "application/json", status, body: JSON.stringify(body) });
}

interface Recorded {
  /** Tag filters of every media-list request, in order. */
  readonly lists: string[][];
  readonly patches: Record<string, unknown>[];
  /** Tags sent with each upload, read from the multipart `tags` parts. */
  readonly uploads: string[][];
}

/**
 * A media API with tags: AND filtering, a prefix catalog with counts,
 * full-replacement updates guarded by `If-Match`, and uploads that store the
 * multipart `tags` parts.
 */
async function mockMedia(
  page: Page,
  library: MediaItem[],
  role: "editor" | "viewer" = "editor",
): Promise<Recorded> {
  const recorded: Recorded = { lists: [], patches: [], uploads: [] };
  await page.route(isApiRequest, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    if (url.pathname === sessionPath) return json(route, sessionSummary({ id: `${role}-1`, role }));
    if (url.pathname === "/api/v1/admin/content-models")
      return json(route, { items: [postsModel] });
    if (url.pathname === "/api/v1/admin/entries/entry-1" && method === "GET")
      return json(route, entry);
    if (url.pathname.endsWith("/preview"))
      return route.fulfill({ body: png, contentType: "image/png" });
    if (url.pathname === "/api/v1/admin/media/tags") {
      const q = url.searchParams.get("q") ?? "";
      const counts = new Map<string, number>();
      for (const item of library)
        for (const tag of item.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
      const items = [...counts]
        .filter(([tag]) => tag.startsWith(q))
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([tag, count]) => ({ count, tag }));
      return json(route, { items });
    }
    if (url.pathname === "/api/v1/admin/media" && method === "GET") {
      const tags = url.searchParams.getAll("tag");
      recorded.lists.push(tags);
      return json(route, {
        items: library.filter((item) => tags.every((tag) => item.tags.includes(tag))),
      });
    }
    if (url.pathname === "/api/v1/admin/media" && method === "POST") {
      const body = request.postDataBuffer()?.toString("latin1") ?? "";
      const tags = [...body.matchAll(/name="tags"\r\n\r\n([^\r]*)\r\n/gu)].map(
        (match) => match[1]!,
      );
      const filename = /filename="([^"]+)"/u.exec(body)?.[1] ?? "upload.png";
      recorded.uploads.push(tags);
      const created = media(`media-${library.length + 1}`, filename, [...tags].sort());
      library.unshift(created);
      return json(route, created, 201);
    }
    const detail = /^\/api\/v1\/admin\/media\/([^/]+)$/u.exec(url.pathname);
    const item = library.find((candidate) => candidate.id === detail?.[1]);
    if (item !== undefined && method === "GET") return json(route, { ...item, usage: [] });
    if (item !== undefined && method === "PATCH") {
      const body = request.postDataJSON() as Record<string, unknown>;
      recorded.patches.push(body);
      if (request.headers()["if-match"] !== `"${Date.parse(item.updatedAt)}"`)
        return json(
          route,
          { error: { code: "MEDIA_UPDATE_CONFLICT", message: "The media item changed." } },
          409,
        );
      if (Array.isArray(body.tags)) item.tags = [...(body.tags as string[])].sort();
      item.updatedAt = new Date(Date.parse(item.updatedAt) + 1000).toISOString();
      return json(route, { build: { status: "not-dispatched" }, media: item });
    }
    return route.fallback();
  });
  return recorded;
}

const filterLabel = "Filter by tags (all must match)";

test("a keyboard user adds, removes, and saves tags in the details panel", async ({ page }) => {
  const library = [
    media("media-1", "bike.png", ["cover"]),
    media("media-2", "wall.png", ["portrait", "project-2026"]),
  ];
  const recorded = await mockMedia(page, library);
  await page.goto("/admin/media");
  const tile = page
    .getByRole("list", { name: "Media library" })
    .getByRole("button", { name: "bike.png" });
  await tile.focus();
  await page.keyboard.press("Enter");
  const panel = page.getByRole("dialog", { name: "bike.png" });
  const tags = panel.getByRole("combobox", { name: "Tags" });
  await expect(panel.getByRole("button", { name: "Remove tag cover" })).toBeVisible();

  // Suggestions by prefix, chosen with the arrow keys.
  await tags.focus();
  await page.keyboard.type("pro");
  await expect(panel.getByRole("option", { name: "project-2026, 1 item" })).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(panel.getByRole("button", { name: "Remove tag project-2026" })).toBeVisible();
  await expect(tags).toHaveValue("");

  // Escape closes open suggestions without closing the panel.
  await page.keyboard.type("p");
  await expect(panel.getByRole("option", { name: "portrait, 1 item" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(tags).toHaveAttribute("aria-expanded", "false");
  await expect(panel).toBeVisible();
  await page.keyboard.press("Backspace");

  // Typed text is normalized; invalid text is explained and kept.
  await page.keyboard.type(" Cover-Shot ,");
  await expect(panel.getByRole("button", { name: "Remove tag cover-shot" })).toBeVisible();
  await page.keyboard.type("summer trip");
  await page.keyboard.press("Enter");
  await expect(panel.getByRole("alert")).toContainText("Use ASCII letters, digits, and hyphens");
  await expect(tags).toHaveValue("summer trip");
  await tags.fill("");

  // Backspace in the empty input removes the last chip.
  await page.keyboard.press("Backspace");
  await expect(panel.getByRole("button", { name: "Remove tag project-2026" })).toHaveCount(0);
  await page.keyboard.type("project-2026");
  await page.keyboard.press("Enter");

  await page.keyboard.press("Tab");
  await expect(panel.getByRole("button", { name: "Save", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(panel.getByText("Metadata saved.")).toBeVisible();
  expect(recorded.patches).toEqual([{ tags: ["cover", "cover-shot", "project-2026"] }]);
  await expect(panel.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
});

test("the library tag filter is URL state and tags new uploads", async ({ page }) => {
  const library = [
    media("media-1", "bike.png", ["cover", "project-2026"]),
    media("media-2", "wall.png", ["project-2026"]),
    media("media-3", "sea.png"),
  ];
  const recorded = await mockMedia(page, library);
  await page.goto("/admin/media");
  const grid = page.getByRole("list", { name: "Media library" });
  await expect(grid.getByRole("button", { name: "sea.png" })).toBeVisible();

  const filter = page.getByRole("combobox", { name: filterLabel });
  await filter.fill("project-2026");
  await filter.press("Enter");
  await filter.fill("cover");
  await filter.press("Enter");
  await expect(grid.getByRole("button", { name: "bike.png" })).toBeVisible();
  await expect(grid.getByRole("button", { name: "wall.png" })).toHaveCount(0);
  await expect(page.getByText("No media matches")).toHaveCount(0);
  expect(recorded.lists.at(-1)).toEqual(["cover", "project-2026"]);
  await expect
    .poll(() => new URL(page.url()).searchParams.get("tag"))
    .toBe(JSON.stringify(["cover", "project-2026"]));

  await page.reload();
  await expect(page.getByRole("button", { name: "Remove tag cover" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove tag project-2026" })).toBeVisible();
  await expect(grid.getByRole("button", { name: "bike.png" })).toBeVisible();
  expect(recorded.lists.at(-1)).toEqual(["cover", "project-2026"]);

  await expect(page.getByText("New uploads are tagged cover, project-2026.")).toBeVisible();
  await page.getByLabel("Upload images").setInputFiles({
    buffer: png,
    mimeType: "image/png",
    name: "hero.png",
  });
  await expect(grid.getByRole("button", { name: "hero.png" })).toBeVisible();
  expect(recorded.uploads).toEqual([["cover", "project-2026"]]);

  await page.getByRole("button", { name: "Clear filters" }).first().click();
  await expect(grid.getByRole("button", { name: "sea.png" })).toBeVisible();
  expect(new URL(page.url()).searchParams.has("tag")).toBe(false);
});

test("the picker tag filter is local and resets when reopened", async ({ page }) => {
  const library = [media("media-1", "bike.png", ["cover"]), media("media-2", "sea.png")];
  const recorded = await mockMedia(page, library);
  await page.goto("/admin/content/posts/entry-1");
  await page.getByRole("heading", { name: "Edit posts" }).waitFor();
  const opener = page.getByRole("button", { name: "Choose media for Cover" });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Choose media for Cover" });
  await expect(dialog.getByRole("button", { name: "sea.png" })).toBeVisible();

  const filter = dialog.getByRole("combobox", { name: filterLabel });
  await filter.fill("co");
  await expect(dialog.getByRole("option", { name: "cover, 1 item" })).toBeVisible();
  // Escape first closes only the suggestions; the arrow keys reopen them.
  await page.keyboard.press("Escape");
  await expect(filter).toHaveAttribute("aria-expanded", "false");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(dialog.getByRole("button", { name: "sea.png" })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "bike.png" })).toBeVisible();
  expect(recorded.lists.at(-1)).toEqual(["cover"]);
  expect(new URL(page.url()).search).toBe("");

  await expect(filter).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();

  await opener.click();
  await expect(dialog.getByRole("button", { name: "sea.png" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Remove tag cover" })).toHaveCount(0);
  expect(recorded.lists.at(-1)).toEqual([]);
});

test("a viewer sees tags read-only and can still filter", async ({ page }) => {
  const recorded = await mockMedia(page, [media("media-1", "bike.png", ["cover"])], "viewer");
  await page.goto("/admin/media");
  await page
    .getByRole("list", { name: "Media library" })
    .getByRole("button", { name: "bike.png" })
    .click();
  const panel = page.getByRole("dialog", { name: "bike.png" });
  await expect(panel).toContainText("Tagscover");
  await expect(panel.getByRole("combobox", { name: "Tags" })).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Remove tag cover" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  const filter = page.getByRole("combobox", { name: filterLabel });
  await filter.fill("cover");
  await filter.press("Enter");
  await expect.poll(() => recorded.lists.at(-1)).toEqual(["cover"]);
  await expect(page.getByText(/New uploads are tagged/)).toHaveCount(0);
});

test("the toolbar with tag chips fits a 320 px viewport", async ({ page }) => {
  await page.setViewportSize({ height: 720, width: 320 });
  await mockMedia(page, [media("media-1", "bike.png", ["cover", "project-2026"])]);
  await page.goto(
    `/admin/media?tag=${encodeURIComponent(JSON.stringify(["cover", "project-2026"]))}`,
  );
  await expect(page.getByRole("button", { name: "Remove tag project-2026" })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  // Narrow screens stack the controls in reading order.
  const tops = await Promise.all(
    [
      page.getByRole("searchbox", { name: "Search media" }),
      page.getByRole("group", { name: "Filter by type" }),
      page.getByRole("combobox", { name: "Sort media" }),
      page.getByRole("combobox", { name: filterLabel }),
      page.getByRole("button", { name: "Clear filters" }),
    ].map(async (locator) => (await locator.boundingBox())!.y),
  );
  expect(tops).toEqual([...tops].sort((left, right) => left - right));
  // Chips stay inside the bordered tag field.
  const field = page.getByRole("combobox", { name: filterLabel }).locator("..");
  const box = (await field.boundingBox())!;
  for (const chip of await page.getByRole("button", { name: /^Remove tag / }).all()) {
    const chipBox = (await chip.boundingBox())!;
    expect(chipBox.x).toBeGreaterThanOrEqual(box.x);
    expect(chipBox.x + chipBox.width).toBeLessThanOrEqual(box.x + box.width + 0.5);
  }
  await expectNoAccessibilityViolations(page, "media toolbar 320");
});

test("the picker toolbar keeps two rows and explains the tag rule", async ({ page }) => {
  await page.setViewportSize({ height: 900, width: 1280 });
  await mockMedia(page, [media("media-1", "bike.png", ["cover", "portrait"])]);
  await page.goto("/admin/content/posts/entry-1");
  await page.getByRole("button", { name: "Choose media for Cover" }).click();
  const dialog = page.getByRole("dialog", { name: "Choose media for Cover" });
  const filter = dialog.getByRole("combobox", { name: filterLabel });
  for (const tag of ["cover", "portrait"]) {
    await filter.fill(tag);
    await filter.press("Enter");
  }
  await expect(dialog.getByRole("button", { name: "Remove tag portrait" })).toBeVisible();
  const top = async (locator: ReturnType<Page["getByRole"]>) => (await locator.boundingBox())!;
  const search = await top(dialog.getByRole("searchbox", { name: "Search media" }));
  const types = await top(dialog.getByRole("group", { name: "Filter by type" }));
  const sort = await top(dialog.getByRole("combobox", { name: "Sort media" }));
  const field = await top(filter);
  const help = await top(dialog.getByRole("button", { name: "About tag filters" }));
  const clear = await top(dialog.getByRole("button", { name: "Clear filters" }));
  const middle = (box: { y: number; height: number }) => box.y + box.height / 2;
  // Search, types and sort share the first row; the tag field, help and Clear the second.
  for (const box of [types, sort]) expect(Math.abs(middle(box) - middle(search))).toBeLessThan(6);
  expect(field.y).toBeGreaterThan(search.y + search.height);
  for (const box of [help, clear]) expect(Math.abs(middle(box) - middle(field))).toBeLessThan(8);

  const info = dialog.getByRole("button", { name: "About tag filters" });
  await info.hover();
  await expect(page.getByRole("tooltip")).toHaveText("Items must have all tags");
  await info.focus();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(filter).toHaveAccessibleDescription("Items must have all tags");
  await expectNoAccessibilityViolations(page, "media picker toolbar");
});
