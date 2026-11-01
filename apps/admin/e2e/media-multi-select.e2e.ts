import { expect, test, type Page, type Route } from "@playwright/test";
import { builtInBlocks, defineBlock, field, toBlockMetadata } from "@lacecms/content";
import { expectNoAccessibilityViolations } from "./support/accessibility.js";
import { sessionPath, sessionSummary } from "./support/session.js";

// Match API calls by pathname prefix; a glob such as `**/api/**` would also
// intercept Vite module URLs like `/admin/src/shared/api/index.ts`.
const isApiRequest = (url: URL) => url.pathname.startsWith("/api/");

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

function media(id: string, filename: string, tags: string[] = []) {
  return {
    createdAt: "2026-10-31T00:00:00.000Z",
    createdBy: { displayName: "Ada Editor", id: "editor-1" },
    filename,
    height: 600,
    id,
    mimeType: "image/png",
    size: 2048,
    status: "active" as const,
    tags,
    updatedAt: "2026-10-31T00:00:00.000Z",
    url: `https://lace.test/api/v1/public/media/${id}`,
    usageCount: 0,
    width: 800,
  };
}
type MediaItem = ReturnType<typeof media>;

// A custom block whose list item is a group with one required media field.
const projects = defineBlock({
  fields: {
    projects: field.list({
      item: field.group({
        fields: {
          cover: field.media({ label: "Cover", required: true }),
          label: field.text({ defaultValue: "Untitled", label: "Label" }),
        },
      }),
      label: "Projects",
      maxItems: 5,
    }),
  },
  label: "Projects",
  type: "projects",
  version: 1,
});

const model = {
  blockDefinitions: [toBlockMetadata(builtInBlocks.gallery), toBlockMetadata(projects)],
  blocks: ["gallery", "projects"],
  fields: {},
  key: "posts",
  kind: "collection",
  route: "/posts/:slug",
  version: 1,
};

const galleryBlock = {
  data: { images: [] },
  hidden: false,
  key: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  position: 1000,
  schemaVersion: 5,
  settings: { layoutMode: "grid", layoutPreset: "auto", layoutWrap: true, lightbox: false },
  type: "gallery",
};

const projectsBlock = {
  data: { projects: [{ cover: "media-hero", label: "Hero" }] },
  hidden: false,
  key: "01ARZ3NDEKTSV4RRFFQ69G5FAW",
  position: 1000,
  schemaVersion: 1,
  settings: {},
  type: "projects",
};

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ contentType: "application/json", status, body: JSON.stringify(body) });
}

/** An editor's entry with one block, a tag-filtering media list, uploads, and draft saves. */
async function mockEditor(page: Page, block: unknown, library: MediaItem[]) {
  const saves: Record<string, unknown>[] = [];
  let snapshot = {
    blocks: [block],
    createdAt: "2026-10-31T00:00:00.000Z",
    entryId: "entry-1",
    fields: {},
    id: "snapshot-1",
    revision: 1,
    slug: "portfolio",
    state: "draft",
    title: "Portfolio",
    updatedAt: "2026-10-31T00:00:00.000Z",
    updatedBy: { id: "editor-1", role: "editor" },
  };
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
    if (url.pathname === "/api/v1/admin/media" && method === "GET") {
      const tags = url.searchParams.getAll("tag");
      return json(route, {
        items: library.filter((item) => tags.every((tag) => item.tags.includes(tag))),
      });
    }
    if (url.pathname === "/api/v1/admin/media" && method === "POST") {
      const body = request.postDataBuffer()?.toString("latin1") ?? "";
      const filename = /filename="([^"]+)"/u.exec(body)?.[1] ?? "upload.png";
      const created = media(`media-${filename.replace(".png", "")}`, filename);
      library.unshift(created);
      return json(route, created, 201);
    }
    const detail = /^\/api\/v1\/admin\/media\/([^/]+)$/u.exec(url.pathname);
    const item = library.find((candidate) => candidate.id === detail?.[1]);
    if (item !== undefined) return json(route, { ...item, usage: [] });
    if (url.pathname.endsWith("/build-site")) return json(route, { site: null });
    return json(route, { items: [], totals: { all: 0, changed: 0, draft: 0, published: 0 } });
  });
  return saves;
}

const upload = (name: string) => ({ buffer: png, mimeType: "image/png", name });

test("twenty tagged images join a gallery in one step", async ({ page }) => {
  const tagged = Array.from({ length: 20 }, (_, index) => {
    const name = `p${String(index + 1).padStart(2, "0")}`;
    return media(`media-${name}`, `${name}.png`, ["project-2026"]);
  });
  const saves = await mockEditor(page, galleryBlock, [
    ...tagged,
    media("media-other", "other.png", ["travel"]),
  ]);
  await page.goto("/admin/content/posts/entry-1");
  await page.getByRole("button", { name: "Add Images and videos item" }).click();
  const dialog = page.getByRole("dialog", { name: "Add media to Images and videos" });
  await dialog
    .getByRole("combobox", { name: "Filter by tags (all must match)" })
    .fill("project-2026");
  await page.keyboard.press("Enter");
  const grid = dialog.getByRole("list", { name: "Media choices for Images and videos" });
  await expect(grid.getByRole("button")).toHaveCount(20);
  for (const item of tagged) await grid.getByRole("button", { name: item.filename }).click();
  await expect(dialog.getByRole("status")).toHaveText(
    "20 items selected. 30 more can be selected.",
  );
  await dialog.getByRole("button", { name: "Add 20 images" }).click();
  await expect(dialog).toBeHidden();

  await expect(
    page.getByRole("button", { name: "Expand Images and videos item 1", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Expand Images and videos item 20" }),
  ).toBeVisible();
  await expect(page.getByText("20 / 50", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Saved revision 2")).toBeVisible();
  const saved = saves[0]!.blocks as { data: { images: unknown[] } }[];
  expect(saved[0]!.data.images).toEqual(
    tagged.map((item) => ({
      aspectRatio: "16:9",
      kind: "image",
      media: item.id,
      playback: "player",
    })),
  );
});

test("a custom block list keeps selection order, capacity, uploads and defaults", async ({
  page,
}) => {
  const library = ["a", "b", "c", "d", "hero"].map((name) => media(`media-${name}`, `${name}.png`));
  const saves = await mockEditor(page, projectsBlock, library);
  await page.goto("/admin/content/posts/entry-1");
  await page.getByRole("button", { name: "Add Projects item" }).click();
  const dialog = page.getByRole("dialog", { name: "Add media to Projects" });
  const grid = dialog.getByRole("list", { name: "Media choices for Projects" });
  const tile = (name: string) => grid.getByRole("button", { name: `${name}.png` });
  const status = dialog.getByRole("status");

  await expect(tile("hero")).toContainText("Already in Projects");
  await tile("c").click();
  await tile("a").click();
  await tile("b").click();
  await tile("a").click();
  await expect(tile("c")).toContainText("1");
  await expect(tile("b")).toContainText("2");
  await expect(tile("a")).toHaveAttribute("aria-pressed", "false");
  await expect(status).toHaveText("2 items selected. 2 more can be selected.");

  // A confirmed upload joins the selection after the selected tiles.
  await dialog.getByLabel("Upload images").setInputFiles(upload("fresh.png"));
  await expect(dialog.getByRole("button", { name: "Select fresh.png" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await tile("a").click();
  await expect(status).toHaveText(
    "4 items selected. Limit reached: Projects allows at most 5 items.",
  );
  await expect(tile("d")).toHaveAttribute("aria-disabled", "true");
  await tile("d").click({ force: true });
  await expect(tile("d")).toHaveAttribute("aria-pressed", "false");

  // An upload that does not fit stays unselected.
  await dialog.getByLabel("Upload images").setInputFiles(upload("late.png"));
  const late = dialog.getByRole("button", { name: "Select late.png" });
  await expect(late).toHaveAttribute("aria-pressed", "false");
  await expect(dialog.getByText("Selection limit reached")).toBeVisible();

  await dialog.getByRole("button", { name: "Add 4 images" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("5 / 5", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Saved revision 2")).toBeVisible();
  const saved = saves[0]!.blocks as { data: { projects: unknown[] } }[];
  expect(saved[0]!.data.projects).toEqual([
    { cover: "media-hero", label: "Hero" },
    { cover: "media-c", label: "Untitled" },
    { cover: "media-b", label: "Untitled" },
    { cover: "media-fresh", label: "Untitled" },
    { cover: "media-a", label: "Untitled" },
  ]);
});

test("a keyboard user selects with Space and Enter, and Escape discards", async ({ page }) => {
  await mockEditor(page, galleryBlock, [media("media-a", "a.png"), media("media-b", "b.png")]);
  await page.goto("/admin/content/posts/entry-1");
  const add = page.getByRole("button", { name: "Add Images and videos item" });
  await add.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Add media to Images and videos" });
  const a = dialog.getByRole("button", { name: "a.png" });
  const b = dialog.getByRole("button", { name: "b.png" });
  await a.focus();
  await page.keyboard.press("Space");
  await b.focus();
  await page.keyboard.press("Enter");
  await expect(a).toHaveAttribute("aria-pressed", "true");
  await expect(b).toHaveAttribute("aria-pressed", "true");
  await expect(b).toBeFocused();
  await expect(dialog.getByRole("button", { name: "Add 2 images" })).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(add).toBeFocused();
  await expect(page.getByText("No items.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save draft" })).toBeDisabled();

  // Reopening starts with an empty selection.
  await page.keyboard.press("Enter");
  await expect(dialog.getByRole("button", { name: "a.png" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(dialog.getByRole("button", { name: "Add 0 images" })).toBeDisabled();
});

for (const theme of ["light", "dark"])
  test(`the multiple-mode picker passes the accessibility audit at 320px (${theme})`, async ({
    page,
  }) => {
    await page.setViewportSize({ height: 900, width: 320 });
    await page.addInitScript((value) => localStorage.setItem("lace:admin-theme", value), theme);
    await mockEditor(page, projectsBlock, [
      media("media-a", "a.png"),
      media("media-b", "b.png"),
      media("media-c", "c.png"),
      media("media-d", "d.png"),
      media("media-e", "e.png"),
      media("media-hero", "hero.png"),
    ]);
    await page.goto("/admin/content/posts/entry-1");
    await page.getByRole("button", { name: "Add Projects item" }).click();
    const dialog = page.getByRole("dialog", { name: "Add media to Projects" });
    for (const name of ["a", "b", "c", "d"])
      await dialog.getByRole("button", { name: `${name}.png` }).click();
    await expect(dialog.getByRole("button", { name: "e.png" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    const confirm = dialog.getByRole("button", { name: "Add 4 images" });
    await confirm.scrollIntoViewIfNeeded();
    await expect(confirm).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      320,
    );
    await expectNoAccessibilityViolations(page, `multiple-mode media picker (${theme})`);
  });
