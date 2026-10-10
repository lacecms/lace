import { expect, test, type Page, type Route } from "@playwright/test";
import { sessionPath, sessionSummary } from "./support/session.js";

// Match API calls by pathname prefix; a glob such as `**/api/**` would also
// intercept Vite module URLs like `/admin/src/shared/api/index.ts`.
const isApiRequest = (url: URL) => url.pathname.startsWith("/api/");

type Role = "admin" | "editor";

async function addBlock(page: Page, label: string) {
  await page.getByRole("button", { name: "Add block" }).click();
  await page
    .getByRole("dialog", { name: "Add block" })
    .getByRole("button", { name: label })
    .click();
}

const model = {
  blockDefinitions: [
    {
      defaultValue: { heading: "Hero" },
      fields: { heading: { required: true, type: "text" } },
      type: "hero",
      version: 1,
    },
    {
      defaultValue: { quote: "Quote" },
      fields: { quote: { required: true, type: "text" } },
      type: "quote",
      version: 1,
    },
    {
      fields: { body: { required: false, type: "richText" } },
      label: "Rich text",
      type: "richText",
      version: 1,
    },
  ],
  blocks: ["hero", "quote", "richText"],
  fields: {},
  key: "posts",
  kind: "collection",
  route: "/posts/:slug",
  version: 1,
};

function entry(title = "First post") {
  return {
    draft: {
      blocks: [],
      createdAt: "2026-09-20T00:00:00.000Z",
      entryId: "entry-1",
      fields: {},
      id: "snapshot-1",
      revision: 2,
      slug: "first-post",
      state: "draft",
      title,
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

async function mockEditor(page: Page, role: Role, onRequest?: (route: Route) => Promise<boolean>) {
  let current: ReturnType<typeof entry> & { published?: Record<string, unknown> } = entry();
  await page.route(isApiRequest, async (route) => {
    if (onRequest !== undefined && (await onRequest(route))) return;
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === sessionPath) return json(route, sessionSummary({ id: `${role}-1`, role }));
    if (url.pathname === "/api/v1/admin/content-models") return json(route, { items: [model] });
    if (url.pathname === "/api/v1/admin/entries/entry-1" && request.method() === "GET")
      return json(route, current);
    if (url.pathname === "/api/v1/admin/entries/entry-1/draft" && request.method() === "PUT") {
      const { expectedRevision: _expectedRevision, ...draft } =
        request.postDataJSON() as typeof current.draft & {
          expectedRevision: number;
        };
      current = {
        ...current,
        draft: { ...current.draft, ...draft, revision: current.draft.revision + 1 },
      };
      return json(route, current);
    }
    if (url.pathname === "/api/v1/admin/entries/entry-1/publish" && request.method() === "POST") {
      current = {
        ...current,
        published: { ...current.draft, id: "published-1", state: "published" },
      };
      return json(route, {
        build: { status: "queued", targetVersion: 1 },
        entry: current,
        publication: "published",
      });
    }
    return route.fallback();
  });
}

test("authors, reorders, and saves blocks through the browser", async ({ page }) => {
  let savedTypes: string[] = [];
  await mockEditor(page, "editor", async (route) => {
    if (new URL(route.request().url()).pathname !== "/api/v1/admin/entries/entry-1/draft")
      return false;
    savedTypes = (route.request().postDataJSON() as { blocks: Array<{ type: string }> }).blocks.map(
      (block) => block.type,
    );
    return false;
  });
  await page.goto("/admin/content/posts/entry-1");
  await page.getByRole("heading", { name: "Edit posts" }).waitFor();
  await addBlock(page, "Hero");
  await addBlock(page, "Quote");
  await page.getByRole("button", { name: "Actions for Quote block" }).click();
  await page.getByRole("menuitem", { name: "Move up" }).click();
  await expect(page.getByRole("article").first()).toHaveAccessibleName("Quote");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Saved revision 3")).toBeVisible();
  expect(savedTypes).toEqual(["quote", "hero"]);
});

test("inserts between blocks and reorders with the keyboard drag handle", async ({ page }) => {
  let savedTypes: string[] = [];
  await mockEditor(page, "editor", async (route) => {
    if (new URL(route.request().url()).pathname !== "/api/v1/admin/entries/entry-1/draft")
      return false;
    savedTypes = (route.request().postDataJSON() as { blocks: Array<{ type: string }> }).blocks.map(
      (block) => block.type,
    );
    return false;
  });
  await page.goto("/admin/content/posts/entry-1");
  await page.getByRole("heading", { name: "Edit posts" }).waitFor();
  await addBlock(page, "Hero");
  await addBlock(page, "Hero");
  await page.getByRole("button", { name: "Insert block at position 2" }).click();
  const menu = page.getByRole("dialog", { name: "Add block" });
  await menu.getByRole("searchbox", { name: "Filter blocks" }).fill("quo");
  await page.keyboard.press("Enter");
  const cards = page.getByRole("article");
  await expect(cards.nth(1)).toHaveAccessibleName("Quote");
  await expect(cards.nth(1)).toBeFocused();
  await expect(cards.nth(1)).toHaveAttribute("data-active", "true");

  // Keep all sortable targets visible so keyboard coordinates do not depend on scrolling tall fields.
  for (const label of ["Hero", "Hero", "Quote"]) {
    await page
      .getByRole("button", { name: `Collapse ${label} block` })
      .first()
      .click();
  }
  const handle = page.getByRole("button", { name: "Reorder Quote block" });
  await handle.focus();
  await page.keyboard.press("Space");
  await expect(handle).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ArrowUp");
  const live = page.locator("[id^=DndLiveRegion]");
  await expect(live).toHaveText("Quote block moved to position 1 of 3.");
  await page.keyboard.press("Space");
  await expect(live).toHaveText("Quote block dropped at position 1 of 3.");
  await expect(cards.first()).toHaveAccessibleName("Quote");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Saved revision 3")).toBeVisible();
  expect(savedTypes).toEqual(["quote", "hero", "hero"]);
});

test("formats rich text from the toolbar and keyboard and follows the validation summary", async ({
  page,
}) => {
  type SavedBlock = { data: { body?: { content: unknown[] } } };
  let saved: SavedBlock[] = [];
  let reject = false;
  await mockEditor(page, "editor", async (route) => {
    if (new URL(route.request().url()).pathname !== "/api/v1/admin/entries/entry-1/draft")
      return false;
    if (reject) {
      await json(
        route,
        {
          error: {
            code: "VALIDATION_FAILED",
            details: {
              issues: [
                {
                  code: "invalid_field_value",
                  message: "does not conform to its field definition.",
                  path: "/blocks/0/data/body/content/0",
                },
              ],
            },
            message: "The request did not satisfy the API contract.",
          },
        },
        422,
      );
      return true;
    }
    saved = (route.request().postDataJSON() as { blocks: SavedBlock[] }).blocks;
    return false;
  });
  await page.goto("/admin/content/posts/entry-1");
  await page.getByRole("heading", { name: "Edit posts" }).waitFor();
  await addBlock(page, "Rich text");
  const body = page.getByRole("textbox", { name: "Body" });
  await expect(body).toHaveAttribute("aria-placeholder", "Write something…");
  await body.click();
  await page.keyboard.type("Hello world");
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ControlOrMeta+b");

  const toolbar = page.getByRole("toolbar", { name: "Body formatting" });
  await page.keyboard.press("Alt+F10");
  await expect(toolbar.getByRole("combobox", { name: "Text style" })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(toolbar.getByRole("button", { name: "Italic" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(toolbar.getByRole("button", { name: "Italic" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.keyboard.press("Escape");
  await expect(body).toBeFocused();

  await page.keyboard.press("ControlOrMeta+k");
  const url = page.getByLabel("Link URL");
  await expect(url).toBeFocused();
  await url.fill("javascript:alert(1)");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Links must start with https://")).toBeVisible();
  await url.fill("https://example.com");
  await page.keyboard.press("Enter");
  await expect(body).toBeFocused();
  await expect(body.getByRole("link", { name: "Hello world" })).toHaveAttribute(
    "href",
    "https://example.com",
  );
  await toolbar.getByRole("button", { name: "Numbered list" }).click();

  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Saved revision 3")).toBeVisible();
  expect(saved[0]?.data.body?.content).toEqual([
    {
      content: [
        {
          content: [
            {
              content: [
                {
                  marks: [
                    { attrs: { href: "https://example.com" }, type: "link" },
                    { type: "bold" },
                    { type: "italic" },
                  ],
                  text: "Hello world",
                  type: "text",
                },
              ],
              type: "paragraph",
            },
          ],
          type: "listItem",
        },
      ],
      type: "orderedList",
    },
  ]);

  reject = true;
  await body.click();
  await page.keyboard.press("End");
  await page.keyboard.type("!");
  await page.getByRole("button", { name: "Save draft" }).click();
  const summary = page.getByRole("alert").filter({ hasText: "There is 1 problem to fix" });
  await expect(summary).toBeFocused();
  await summary.getByRole("link", { name: "Body in Rich text block 1" }).click();
  await expect(body).toBeFocused();
  await expect(body).toHaveAttribute("aria-invalid", "true");
});

test("saves with the keyboard shortcut while header actions stay visible", async ({ page }) => {
  let saves = 0;
  await mockEditor(page, "editor", async (route) => {
    if (new URL(route.request().url()).pathname === "/api/v1/admin/entries/entry-1/draft")
      saves += 1;
    return false;
  });
  await page.setViewportSize({ height: 600, width: 1280 });
  await page.goto("/admin/content/posts/entry-1");
  await page.getByRole("heading", { name: "Edit posts" }).waitFor();
  for (let index = 0; index < 6; index += 1) await addBlock(page, "Hero");
  const header = page.getByRole("banner");
  await expect(header.getByRole("status")).toHaveText("Unsaved changes");
  await page.mouse.wheel(0, 4000);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await expect(header.getByRole("navigation", { name: "Breadcrumb" })).toBeInViewport();
  await expect(header.getByRole("button", { name: "Save draft" })).toBeInViewport();
  await page.keyboard.press("Control+s");
  await expect(header.getByRole("status")).toHaveText("Saved revision 3");
  expect(saves).toBe(1);
});

test("offers only explicit conflict recovery after a concurrent save", async ({ page }) => {
  let conflicted = false;
  await mockEditor(page, "editor", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/v1/admin/entries/entry-1/draft" && request.method() === "PUT") {
      conflicted = true;
      await json(route, { error: { code: "CONTENT_REVISION_CONFLICT", message: "Changed" } }, 409);
      return true;
    }
    if (
      url.pathname === "/api/v1/admin/entries/entry-1" &&
      request.method() === "GET" &&
      conflicted
    ) {
      await json(route, entry("Server draft"));
      return true;
    }
    return false;
  });
  await page.goto("/admin/content/posts/entry-1");
  await page.getByRole("textbox", { name: "Title" }).fill("Local draft");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("alert")).toContainText("Draft changed elsewhere");
  await expect(page.getByRole("textbox", { name: "Title" })).toHaveValue("Local draft");
  await page.getByRole("button", { name: "Reload server draft" }).click();
  await expect(page.getByRole("textbox", { name: "Title" })).toHaveValue("Server draft");
});

test("limits publication to admins and preserves public output after a later draft save", async ({
  page,
  browser,
}) => {
  await mockEditor(page, "editor");
  await page.goto("/admin/content/posts/entry-1");
  await expect(page.getByRole("button", { name: "Publish" })).toHaveCount(0);

  const admin = await browser.newPage();
  await mockEditor(admin, "admin");
  await admin.goto("/admin/content/posts/entry-1");
  await admin.getByRole("button", { name: "Publish" }).click();
  await admin.getByRole("button", { name: "Confirm publication" }).click();
  await expect(admin.getByText("Published. Build pending.")).toBeVisible();
  await admin.getByRole("textbox", { name: "Title" }).fill("Later private draft");
  await admin.getByRole("button", { name: "Save draft" }).click();
  await expect(admin.getByRole("region", { name: "Publication status" })).toContainText(
    "/posts/first-post",
  );
  await admin.close();
});

test("admin routes distinguish empty and failure states at a narrow width", async ({ browser }) => {
  const empty = await browser.newPage({ viewport: { width: 375, height: 740 } });
  let releaseModels: (() => void) | undefined;
  const modelsGate = new Promise<void>((resolve) => {
    releaseModels = resolve;
  });
  await empty.route(isApiRequest, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === sessionPath) return json(route, sessionSummary({ id: "admin-1", role: "admin" }));
    if (path === "/api/v1/admin/content-models") {
      await modelsGate;
      return json(route, { items: [] });
    }
    if (path === "/api/v1/admin/media") return json(route, { items: [] });
    if (path === "/api/v1/admin/users") return json(route, { items: [] });
    if (path === "/api/v1/admin/invitations") return json(route, { items: [] });
    if (path === "/api/v1/admin/site-builds") return json(route, { items: [] });
    if (path === "/api/v1/admin/settings/status")
      return json(route, {
        configuredModels: 0,
        email: { provider: "none" as const },
        engineVersion: "0.1.0-alpha.4",
        ready: true,
      });
    if (path === "/api/v1/admin/api-tokens") return json(route, { items: [] });
    return route.fallback();
  });
  await empty.goto("/admin/content");
  await expect(empty.getByRole("status", { name: "Loading content models" })).toBeVisible();
  releaseModels?.();
  await expect(empty.getByText("No content models configured")).toBeVisible();
  await empty.getByRole("button", { name: "Open navigation" }).focus();
  await expect(empty.getByRole("button", { name: "Open navigation" })).toBeFocused();
  const focus = await empty
    .getByRole("button", { name: "Open navigation" })
    .evaluate((element) => getComputedStyle(element).outlineStyle);
  expect(focus).not.toBe("none");
  await empty.getByRole("button", { name: "Open navigation" }).press("Enter");
  await expect(empty.getByRole("link", { name: "Media" })).toBeVisible();
  for (const [route, message] of [
    ["media", "No media yet"],
    ["users", "No users found"],
    ["settings", "No build tokens"],
  ] as const) {
    await empty.goto(`/admin/${route}`);
    await expect(empty.getByText(message)).toBeVisible();
  }
  await empty.goto("/admin/does-not-exist");
  await expect(empty.getByRole("main").getByText("Page not found")).toBeVisible();
  await expect(empty.getByRole("link", { name: "Go to Content" })).toBeVisible();
  await empty.goto("/admin/builds");
  await expect(empty.getByText("No builds yet")).toBeVisible();
  expect(await empty.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await empty.close();

  for (const route of ["content", "media", "users", "settings"]) {
    const failed = await browser.newPage();
    await failed.route(isApiRequest, async (requestRoute) => {
      if (new URL(requestRoute.request().url()).pathname === sessionPath)
        return json(requestRoute, sessionSummary({ id: "admin-1", role: "admin" }));
      return requestRoute.abort();
    });
    await failed.goto(`/admin/${route}`);
    await expect(failed.getByRole("alert").first()).toBeVisible();
    await failed.close();
  }
});

test("restores collection search, status filter, and sort from the URL after a reload", async ({
  browser,
}) => {
  const page = await browser.newPage({ viewport: { width: 375, height: 740 } });
  const listQueries: string[] = [];
  const summary = {
    draftRevision: 2,
    id: "entry-1",
    listValues: {},
    modelKey: "posts",
    publishedAt: "2026-09-20T00:00:00.000Z",
    publishedSnapshotId: "published-1",
    slug: "first-post",
    status: "changed",
    title: "First post",
    updatedAt: "2026-09-21T00:00:00.000Z",
    updatedBy: { displayName: "Ada Editor", id: "editor-1" },
  };
  await mockEditor(page, "editor", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname !== "/api/v1/admin/models/posts/entries") return false;
    if (!url.searchParams.has("limit")) listQueries.push(url.searchParams.toString());
    await json(route, { items: [summary], totals: { all: 1, changed: 1, draft: 0, published: 0 } });
    return true;
  });

  await page.goto("/admin/content/posts");
  await expect(page.getByRole("table", { name: "posts entries" })).toBeVisible();
  await page.getByRole("searchbox", { name: "Search entries" }).fill("first");
  await expect(page).toHaveURL(/q=first/u);
  await page.getByRole("button", { name: "Changed 1" }).click();
  await page.getByRole("button", { name: "Title", exact: true }).click();
  await expect(page).toHaveURL(/sort=title/u);
  await expect(page).toHaveURL(/status=changed/u);

  await page.reload();
  await expect(page.getByRole("searchbox", { name: "Search entries" })).toHaveValue("first");
  await expect(page.getByRole("button", { name: "Changed 1" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("columnheader", { name: "Title" })).toHaveAttribute(
    "aria-sort",
    "ascending",
  );
  expect(new URLSearchParams(listQueries.at(-1))).toEqual(
    new URLSearchParams("q=first&status=changed&sort=title"),
  );
  await expect(page.getByText("entry-1")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await page.close();
});

test("browses, uploads several files, and inspects media in the library", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    "base64",
  );
  const item = (id: string, filename: string, usageCount = 0) => ({
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
    usageCount,
    width: 800,
  });
  const listed = [item("media-1", "hero.png", 1)];
  const listQueries: string[] = [];
  await mockEditor(page, "editor", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith("/preview")) {
      await route.fulfill({ body: png, contentType: "image/png" });
      return true;
    }
    if (url.pathname === "/api/v1/admin/media" && request.method() === "GET") {
      listQueries.push(url.searchParams.toString());
      await json(route, { items: listed });
      return true;
    }
    if (url.pathname === "/api/v1/admin/media" && request.method() === "POST") {
      const body = request.postDataBuffer()?.toString("latin1") ?? "";
      if (body.includes('filename="broken.png"')) {
        await json(
          route,
          { error: { code: "VALIDATION_FAILED", message: "The image data is invalid." } },
          422,
        );
        return true;
      }
      const created = item(`media-${listed.length + 1}`, "fresh.png");
      listed.unshift(created);
      await json(route, created, 201);
      return true;
    }
    if (url.pathname === "/api/v1/admin/media/media-1") {
      await json(route, {
        ...item("media-1", "hero.png", 1),
        usage: [
          {
            entryId: "entry-1",
            locations: [{ field: "cover", source: "field", states: ["draft", "published"] }],
            modelKey: "posts",
            status: "published",
            title: "First post",
          },
        ],
      });
      return true;
    }
    return false;
  });

  await page.goto("/admin/media");
  const grid = page.getByRole("list", { name: "Media library" });
  await expect(grid.getByRole("button", { name: "hero.png" })).toBeVisible();

  await page.getByLabel("Upload images").setInputFiles([
    { buffer: png, mimeType: "image/png", name: "fresh.png" },
    { buffer: Buffer.from("%PDF"), mimeType: "application/pdf", name: "notes.pdf" },
    { buffer: png, mimeType: "image/png", name: "broken.png" },
  ]);
  const queue = page.getByRole("list", { name: "Upload queue" });
  await expect(queue.getByRole("listitem").filter({ hasText: "fresh.png" })).toContainText(
    "Uploaded",
  );
  await expect(queue.getByRole("listitem").filter({ hasText: "notes.pdf" })).toContainText(
    "not supported",
  );
  await expect(queue.getByRole("listitem").filter({ hasText: "broken.png" })).toContainText(
    "The image data is invalid.",
  );
  await expect(grid.getByRole("button", { name: "fresh.png" })).toBeVisible();

  await page.getByRole("searchbox", { name: "Search media" }).fill("hero");
  await expect(page).toHaveURL(/q=hero/u);
  await page.getByRole("button", { name: "PNG", exact: true }).click();
  await page.getByRole("button", { name: "List view" }).click();
  await expect(page).toHaveURL(/view=list/u);
  await page.reload();
  await expect(page.getByRole("searchbox", { name: "Search media" })).toHaveValue("hero");
  await expect(page.getByRole("button", { name: "PNG", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("table", { name: "Media library" })).toBeVisible();
  expect(new URLSearchParams(listQueries.at(-1))).toEqual(
    new URLSearchParams("q=hero&type=image%2Fpng"),
  );

  const opener = page.getByRole("table", { name: "Media library" }).getByRole("button", {
    name: "hero.png",
  });
  await opener.focus();
  await page.keyboard.press("Enter");
  const panel = page.getByRole("dialog", { name: "hero.png" });
  await expect(panel.getByRole("link", { name: "First post" })).toBeVisible();
  await expect(panel).toContainText("Cover field · Draft and published");
  await expect(panel.getByRole("button", { name: "Delete media" })).toBeDisabled();
  await expect(panel).not.toContainText("editor-1");
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(opener).toBeFocused();
  await page.close();
});

test("uploads in the picker dialog and reuses images in a block from the keyboard", async ({
  page,
}) => {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    "base64",
  );
  const item = (id: string, filename: string) => ({
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
    usageCount: 0,
    width: 800,
  });
  const listed = [item("media-1", "hero.png")];
  const mediaModel = {
    ...model,
    blockDefinitions: [
      {
        defaultValue: { heading: "Hero" },
        fields: {
          heading: { required: true, type: "text" },
          image: { required: false, type: "media" },
        },
        type: "hero",
        version: 1,
      },
    ],
    blocks: ["hero"],
  };
  let savedImage: unknown;
  await mockEditor(page, "editor", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/v1/admin/content-models") {
      await json(route, { items: [mediaModel] });
      return true;
    }
    if (url.pathname.endsWith("/preview")) {
      await route.fulfill({ body: png, contentType: "image/png" });
      return true;
    }
    if (url.pathname === "/api/v1/admin/media" && request.method() === "GET") {
      await json(route, { items: listed });
      return true;
    }
    if (url.pathname === "/api/v1/admin/media" && request.method() === "POST") {
      const body = request.postDataBuffer()?.toString("latin1") ?? "";
      if (body.includes('filename="broken.png"')) {
        await json(
          route,
          { error: { code: "VALIDATION_FAILED", message: "The image data is invalid." } },
          422,
        );
        return true;
      }
      const created = item("media-2", "fresh.png");
      listed.unshift(created);
      await json(route, created, 201);
      return true;
    }
    const detail = /^\/api\/v1\/admin\/media\/([^/]+)$/u.exec(url.pathname);
    if (detail !== null) {
      const found = listed.find((candidate) => candidate.id === detail[1]);
      await (found === undefined
        ? json(route, { error: { code: "NOT_FOUND", message: "Not found." } }, 404)
        : json(route, { ...found, usage: [] }));
      return true;
    }
    if (url.pathname === "/api/v1/admin/entries/entry-1/draft" && request.method() === "PUT") {
      savedImage = (request.postDataJSON() as { blocks: Array<{ data: { image?: unknown } }> })
        .blocks[0]?.data.image;
    }
    return false;
  });

  await page.goto("/admin/content/posts/entry-1");
  await page.getByRole("heading", { name: "Edit posts" }).waitFor();
  await addBlock(page, "Hero");
  const choose = page.getByRole("button", { name: "Choose media for Image" });
  await choose.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Choose media for Image" });
  await expect(dialog.getByRole("button", { name: "hero.png" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(choose).toBeFocused();

  await page.keyboard.press("Enter");
  await dialog.getByLabel("Upload images").setInputFiles([
    { buffer: png, mimeType: "image/png", name: "fresh.png" },
    { buffer: png, mimeType: "image/png", name: "broken.png" },
  ]);
  const queue = dialog.getByRole("list", { name: "Upload queue" });
  await expect(queue.getByRole("listitem").filter({ hasText: "broken.png" })).toContainText(
    "The image data is invalid.",
  );
  await expect(queue.getByRole("listitem").filter({ hasText: "fresh.png" })).toContainText(
    "Uploaded",
  );
  await expect(page.getByText("No media selected")).toBeVisible();
  await dialog.getByRole("button", { name: "Use fresh.png" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("fresh.png")).toBeVisible();
  const replace = page.getByRole("button", { name: "Replace media for Image" });
  await expect(replace).toBeFocused();

  await page.keyboard.press("Enter");
  const tile = dialog.getByRole("button", { name: "hero.png" });
  await tile.focus();
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("hero.png")).toBeVisible();
  await expect(replace).toBeFocused();
  await expect(page.getByText("media-1")).toHaveCount(0);

  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Saved revision 3")).toBeVisible();
  expect(savedImage).toBe("media-1");
});
