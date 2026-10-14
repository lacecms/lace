import { expect, test, type Page, type Route } from "@playwright/test";
import { expectVisibleFocus, tabTo } from "./support/keyboard.js";
import { sessionPath, sessionSummary } from "./support/session.js";

// Match API calls by pathname prefix so Vite module URLs under /src/shared/api
// are never intercepted.
const isApiRequest = (url: URL) => url.pathname.startsWith("/api/");

const now = "2026-10-01T00:00:00.000Z";
const actor = { id: "admin-1", role: "admin" as const };
const home = { blocks: [], fields: {}, key: "home", kind: "page", path: "/", version: 1 };
const posts = {
  blocks: [],
  fields: { excerpt: { label: "Excerpt", required: false, type: "textarea" } },
  key: "posts",
  kind: "collection",
  label: "Posts",
  route: "/posts/:slug",
  seo: { description: "excerpt", image: null },
  version: 1,
};
const settings = {
  blocks: [],
  fields: {
    siteName: { label: "Site name", required: true, type: "text" },
    tagline: { label: "Tagline", required: false, type: "text" },
  },
  key: "settings",
  kind: "global",
  label: "Site settings",
  seoDefaults: { description: "tagline", image: null, siteName: "siteName", titleTemplate: null },
  version: 1,
};
const emptySeo = { canonical: null, description: null, image: null, noindex: false, title: null };

function snapshot(entryId: string, fields: Record<string, unknown>, title: string) {
  return {
    blocks: [],
    createdAt: now,
    entryId,
    fields,
    id: `${entryId}-draft`,
    revision: 1,
    state: "draft" as const,
    title,
    updatedAt: now,
    updatedBy: actor,
  };
}

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ body: JSON.stringify(body), contentType: "application/json", status });
}

function summary(entry: { id: string; draft: { revision: number; title: string } }, key: string) {
  return {
    draftRevision: entry.draft.revision,
    id: entry.id,
    listValues: {},
    modelKey: key,
    status: "draft",
    title: entry.draft.title,
    updatedAt: now,
    updatedBy: { displayName: "Ada Admin", id: "admin-1" },
  };
}

/** A stateful admin API with an SEO-enabled post and a published defaults global. */
async function mockApi(page: Page) {
  const post = {
    draft: {
      ...snapshot("post-1", { excerpt: "A short intro" }, "First post"),
      seo: emptySeo,
      slug: "first-post",
    },
    id: "post-1",
    model: { key: "posts", kind: "collection", route: "/posts/:slug" },
    updatedBy: { displayName: "Ada Admin", id: "admin-1" },
  };
  const settingsDraft = snapshot(
    "settings-1",
    { siteName: "Lace", tagline: "Notes on Lace" },
    "Site settings",
  );
  const settingsEntry = {
    draft: settingsDraft,
    id: "settings-1",
    model: { key: "settings", kind: "global" },
    published: { ...settingsDraft, id: "settings-1-published", state: "published" },
    updatedBy: { displayName: "Ada Admin", id: "admin-1" },
  };
  const requests: unknown[] = [];
  await page.route(isApiRequest, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (path === sessionPath) return json(route, sessionSummary({ id: "admin-1", role: "admin" }));
    if (path === "/api/v1/admin/content-models")
      return json(route, { items: [home, posts, settings] });
    if (path === "/api/v1/admin/build-site")
      return json(route, {
        site: { id: "main-site", label: "Main site", url: "https://site.example/" },
      });
    if (path === "/api/v1/admin/site-builds") return json(route, { items: [] });
    const totals = (count: number) => ({ all: count, changed: 0, draft: count, published: 0 });
    if (path === "/api/v1/admin/models/home/entries")
      return json(route, { items: [], totals: totals(0) });
    if (path === "/api/v1/admin/models/posts/entries")
      return json(route, { items: [summary(post, "posts")], totals: totals(1) });
    if (path === "/api/v1/admin/models/settings/entries")
      return json(route, { items: [summary(settingsEntry, "settings")], totals: totals(1) });
    if (path === "/api/v1/admin/entries/settings-1" && method === "GET")
      return json(route, settingsEntry);
    if (path === "/api/v1/admin/entries/post-1" && method === "GET") return json(route, post);
    if (path === "/api/v1/admin/entries/post-1/draft" && method === "PUT") {
      const body = request.postDataJSON() as { seo?: typeof emptySeo; title: string };
      requests.push({ seo: body.seo, title: body.title });
      post.draft = {
        ...post.draft,
        revision: post.draft.revision + 1,
        seo: body.seo ?? emptySeo,
        title: body.title,
      };
      return json(route, post);
    }
    return route.fallback();
  });
  return requests;
}

/** Replaces the value of a focused text field with the keyboard. */
async function retype(page: Page, text: string) {
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type(text);
}

test("an admin edits SEO values with the keyboard alone", async ({ page }) => {
  const requests = await mockApi(page);
  await page.goto("/admin/content/posts/post-1");
  await expect(page.getByRole("heading", { name: "Edit Posts" })).toBeVisible();

  const card = page.getByRole("region", { name: "SEO", exact: true });
  const title = card.getByRole("textbox", { name: "SEO title" });
  const preview = card.getByRole("region", { name: "Search result preview" });
  await expect(title).toHaveAttribute("placeholder", "Uses entry title: First post | Lace");
  await expect(card.getByRole("textbox", { name: "SEO description" })).toHaveAttribute(
    "placeholder",
    "Uses Excerpt: A short intro",
  );
  await expect(card.getByText("No image is shared")).toBeVisible();
  await expect(preview).toContainText("First post | Lace");
  await expect(preview).toContainText("https://site.example/posts/first-post");
  await expect(preview).toContainText("A short intro");

  await tabTo(page, title);
  await page.keyboard.type("A very long search title that keeps going well past sixty chars");
  await expect(
    card.getByText("63 / 60 characters (recommended). Limit: 200 characters."),
  ).toBeVisible();
  await expect(
    card.getByText("Search results may shorten titles longer than 60 characters."),
  ).toBeVisible();
  await retype(page, "Hello from Lace");
  await expect(
    card.getByText("15 / 60 characters (recommended). Limit: 200 characters."),
  ).toBeVisible();
  await expect(card.getByText(/may shorten titles/u)).toHaveCount(0);
  await expect(preview).toContainText("Hello from Lace");

  const canonical = card.getByRole("textbox", { name: "Canonical URL" });
  await expect(canonical).toHaveAttribute(
    "placeholder",
    "Uses this page's URL: https://site.example/posts/first-post",
  );
  await tabTo(page, canonical);
  await page.keyboard.type("/posts/first-post");
  await page.keyboard.press("ControlOrMeta+s");
  const problems = page.getByRole("alert", { name: "There is 1 problem to fix" });
  await expect(problems).toBeFocused();
  await tabTo(page, problems.getByRole("link", { name: "Canonical URL" }));
  await page.keyboard.press("Enter");
  await expect(canonical).toBeFocused();
  await expectVisibleFocus(page);
  await retype(page, "https://site.example/posts/first-post");

  const noindex = card.getByRole("switch", { name: "Hide from search engines" });
  await tabTo(page, noindex);
  await page.keyboard.press("Space");
  await expect(noindex).toBeChecked();
  await expect(preview).toContainText("Hidden from search results.");

  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.getByRole("banner").getByRole("status")).toHaveText("Saved revision 2");
  await expect(title).toHaveValue("Hello from Lace");
  expect(requests).toEqual([
    {
      seo: {
        canonical: "https://site.example/posts/first-post",
        description: null,
        image: null,
        noindex: true,
        title: "Hello from Lace",
      },
      title: "First post",
    },
  ]);
});

test("the defaults global names the site defaults its fields provide", async ({ page }) => {
  await mockApi(page);
  await page.goto("/admin/content/settings/settings-1");
  await expect(page.getByRole("heading", { name: "Edit Site settings" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Site name" })).toHaveAccessibleDescription(
    "Required for publication only. 4 characters Site name used in search and social titles.",
  );
  await expect(page.getByRole("textbox", { name: "Tagline" })).toHaveAccessibleDescription(
    "13 characters Default description for search and social previews.",
  );
  await expect(page.getByRole("region", { name: "SEO", exact: true })).toHaveCount(0);
});
