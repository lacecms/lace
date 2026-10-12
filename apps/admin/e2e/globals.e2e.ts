import { expect, test, type Page, type Route } from "@playwright/test";
import { expectVisibleFocus, tabTo } from "./support/keyboard.js";
import { sessionPath, sessionSummary } from "./support/session.js";

// Match API calls by pathname prefix so Vite module URLs under /src/shared/api
// are never intercepted.
const isApiRequest = (url: URL) => url.pathname.startsWith("/api/");

const now = "2026-10-01T00:00:00.000Z";
const home = { blocks: [], fields: {}, key: "home", kind: "page", path: "/", version: 1 };
const settings = {
  blocks: [],
  description: "Name and tagline shown on every page.",
  fields: {
    siteName: { label: "Site name", required: true, type: "text" },
    tagline: { label: "Tagline", required: false, type: "text" },
  },
  key: "settings",
  kind: "global",
  label: "Site settings",
  version: 1,
};

interface Snapshot {
  readonly blocks: unknown[];
  readonly createdAt: string;
  readonly entryId: string;
  readonly fields: Record<string, unknown>;
  readonly id: string;
  readonly revision: number;
  readonly state: "draft" | "published";
  readonly title: string;
  readonly updatedAt: string;
  readonly updatedBy: { readonly id: string; readonly role: "admin" };
}

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ body: JSON.stringify(body), contentType: "application/json", status });
}

/** A stateful admin API with one page and one synchronized, unpublished global. */
async function mockApi(page: Page) {
  const draft: Snapshot = {
    blocks: [],
    createdAt: now,
    entryId: "settings-1",
    fields: { siteName: "Lace", tagline: "Built with Lace" },
    id: "settings-1-draft",
    revision: 1,
    state: "draft",
    title: "Site settings",
    updatedAt: now,
    updatedBy: { id: "admin-1", role: "admin" },
  };
  const entry: {
    draft: Snapshot;
    readonly id: string;
    readonly model: { readonly key: string; readonly kind: string };
    published?: Snapshot;
    readonly updatedBy: { readonly displayName: string; readonly id: string };
  } = {
    draft,
    id: "settings-1",
    model: { key: "settings", kind: "global" },
    updatedBy: { displayName: "Ada Admin", id: "admin-1" },
  };
  const requests: string[] = [];
  let version = 5;
  await page.route(isApiRequest, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (path === sessionPath) return json(route, sessionSummary({ id: "admin-1", role: "admin" }));
    if (path === "/api/v1/admin/content-models") return json(route, { items: [home, settings] });
    if (path === "/api/v1/admin/build-site")
      return json(route, {
        site: { id: "main-site", label: "Main site", url: "https://site.example/" },
      });
    if (path === "/api/v1/admin/site-builds") return json(route, { items: [] });
    if (path === "/api/v1/admin/models/home/entries")
      return json(route, { items: [], totals: { all: 0, changed: 0, draft: 0, published: 0 } });
    if (path === "/api/v1/admin/models/settings/entries") {
      const status =
        entry.published === undefined
          ? "draft"
          : entry.published.revision === entry.draft.revision
            ? "published"
            : "changed";
      return json(route, {
        items: [
          {
            draftRevision: entry.draft.revision,
            id: entry.id,
            listValues: {},
            modelKey: "settings",
            status,
            title: entry.draft.title,
            updatedAt: entry.draft.updatedAt,
            updatedBy: entry.updatedBy,
          },
        ],
        totals: { all: 1, changed: 0, draft: 0, published: 0, [status]: 1 },
      });
    }
    const match = /^\/api\/v1\/admin\/entries\/settings-1(?:\/([a-z]+))?$/u.exec(path);
    if (match === null) return route.fallback();
    const action = match[1];
    if (action === undefined && method === "GET") return json(route, entry);
    requests.push(`${method} ${action ?? "entry"}`);
    if (action === "draft") {
      const body = request.postDataJSON() as {
        fields: Record<string, unknown>;
        slug?: string;
        title: string;
      };
      requests.push(`title=${body.title} slug=${body.slug ?? "-"}`);
      entry.draft = {
        ...entry.draft,
        fields: body.fields,
        revision: entry.draft.revision + 1,
        title: "Site settings",
      };
      return json(route, entry);
    }
    if (action === "publish") {
      entry.published = {
        ...entry.draft,
        id: `published-${entry.draft.revision}`,
        state: "published",
      };
      version += 1;
      return json(route, {
        build: { status: "queued", targetVersion: version },
        entry,
        publication: "published",
      });
    }
    if (action === "revert" && entry.published !== undefined) {
      const revision = entry.draft.revision + 1;
      entry.draft = { ...entry.published, id: entry.draft.id, revision, state: "draft" };
      entry.published = { ...entry.published, revision };
      return json(route, entry);
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

test("an admin edits, publishes, and reverts a global with the keyboard alone", async ({
  page,
}) => {
  const requests = await mockApi(page);
  await page.goto("/admin/content");
  await expect(page.getByRole("heading", { name: "Content", exact: true })).toBeVisible();
  const sidebar = page.getByRole("complementary", { name: "Admin navigation" });
  const site = sidebar.getByRole("list", { name: "Site" });
  const link = site.getByRole("link", { name: "Site settings" });
  await expect(link).toHaveAttribute("href", "/admin/content/settings/settings-1");
  await tabTo(page, link);
  await page.keyboard.press("Enter");

  await expect(page.getByRole("heading", { name: "Edit Site settings" })).toBeVisible();
  await expect(page.getByText("Name and tagline shown on every page.")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Title" })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Slug" })).toHaveCount(0);
  const header = page.getByRole("navigation", { name: "Breadcrumb" });
  await expect(header).toContainText("Site settings");
  await expect(header.getByRole("link")).toHaveText(["Content"]);
  const publication = page.getByRole("region", { name: "Publication status" });
  await expect(publication).not.toContainText("Public URL");

  const siteName = page.getByRole("textbox", { name: /Site name/u });
  await tabTo(page, siteName);
  await retype(page, "Lace Journal");
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.getByRole("banner").getByRole("status")).toHaveText("Saved revision 2");

  const publish = page.getByRole("button", { name: "Publish", exact: true });
  await publish.focus();
  await expectVisibleFocus(page);
  await page.keyboard.press("Enter");
  const confirmation = page.getByRole("dialog", { name: "Publish this site content?" });
  await expect(confirmation).toContainText(
    "It affects every page that shows it after the next site build.",
  );
  await tabTo(page, confirmation.getByRole("button", { name: "Confirm publication" }));
  await page.keyboard.press("Enter");
  await expect(publication).toContainText("LiveRevision 2");
  await expect(publication).toContainText(/Published\. Build for version 6/u);
  await expect(publication.getByRole("link", { name: /on site/u })).toHaveCount(0);

  const tagline = page.getByRole("textbox", { name: "Tagline" });
  await tabTo(page, tagline);
  await retype(page, "A later draft");
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.getByRole("banner").getByRole("status")).toHaveText("Saved revision 3");

  const actions = page.getByRole("button", { name: "Entry actions" });
  await actions.focus();
  await expectVisibleFocus(page);
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem")).toHaveText(["Revert to published", "Unpublish"]);
  await page.keyboard.press("Escape");
  await expect(actions).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(menu.getByRole("menuitem", { name: "Revert to published" })).toBeFocused();
  await page.keyboard.press("Enter");
  const revert = page.getByRole("dialog", { name: "Revert to published?" });
  await tabTo(page, revert.getByRole("button", { name: "Revert to published" }));
  await page.keyboard.press("Enter");
  await expect(tagline).toHaveValue("Built with Lace");
  await expect(siteName).toHaveValue("Lace Journal");
  await expect(publication).toContainText("Published");
  await expect(actions).toBeFocused();

  expect(requests).toEqual([
    "PUT draft",
    "title=Site settings slug=-",
    "POST publish",
    "PUT draft",
    "title=Site settings slug=-",
    "POST revert",
  ]);
});

test("a global's model route and overview card carry no list or path", async ({ page }) => {
  await mockApi(page);
  await page.goto("/admin/content");
  const section = page.getByRole("region", { name: "Site" });
  await expect(section.getByRole("link", { name: "Site settings" })).toBeVisible();
  await expect(section).toContainText("Name and tagline shown on every page.");
  await page.goto("/admin/content/settings");
  await expect(page.getByText("Open this global from the content landing route.")).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
});
