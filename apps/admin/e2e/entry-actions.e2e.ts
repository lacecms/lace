import { expect, test, type Page, type Route } from "@playwright/test";
import { sessionPath, sessionSummary } from "./support/session.js";

// Match API calls by pathname prefix; a glob such as `**/api/**` would also
// intercept Vite module URLs like `/admin/src/shared/api/index.ts`.
const isApiRequest = (url: URL) => url.pathname.startsWith("/api/");

type Role = "admin" | "editor" | "viewer";

const posts = {
  blocks: [],
  fields: {},
  key: "posts",
  kind: "collection",
  label: "Posts",
  route: "/posts/:slug",
  version: 1,
};
const about = { blocks: [], fields: {}, key: "about", kind: "page", path: "/about", version: 1 };

interface Snapshot {
  readonly blocks: unknown[];
  readonly createdAt: string;
  readonly entryId: string;
  readonly fields: Record<string, unknown>;
  readonly id: string;
  readonly revision: number;
  readonly slug?: string;
  readonly state: "draft" | "published";
  readonly title: string;
  readonly updatedAt: string;
  readonly updatedBy: { readonly id: string; readonly role: Role };
}

interface StoredEntry {
  draft: Snapshot;
  readonly id: string;
  readonly model: Record<string, string>;
  published?: Snapshot;
  readonly updatedBy: { readonly displayName: string; readonly id: string };
}

const now = "2026-10-01T00:00:00.000Z";

function snapshot(entryId: string, revision: number, title: string, slug?: string): Snapshot {
  return {
    blocks: [],
    createdAt: now,
    entryId,
    fields: {},
    id: `${entryId}-draft`,
    revision,
    ...(slug === undefined ? {} : { slug }),
    state: "draft",
    title,
    updatedAt: now,
    updatedBy: { id: "admin-1", role: "admin" },
  };
}

function published(draft: Snapshot, revision = draft.revision): Snapshot {
  return { ...draft, id: `${draft.entryId}-published-${revision}`, revision, state: "published" };
}

function seed(): Map<string, StoredEntry> {
  const postModel = { key: "posts", kind: "collection", route: "/posts/:slug" };
  const launchDraft = snapshot("launch", 4, "Launch", "launch");
  const notesDraft = snapshot("notes", 2, "Notes");
  const aboutDraft = snapshot("about-1", 3, "About us");
  const updatedBy = { displayName: "Ada Admin", id: "admin-1" };
  return new Map<string, StoredEntry>([
    [
      "launch",
      {
        draft: launchDraft,
        id: "launch",
        model: postModel,
        published: { ...published(launchDraft, 3), title: "Launch (live)" },
        updatedBy,
      },
    ],
    ["notes", { draft: notesDraft, id: "notes", model: postModel, updatedBy }],
    [
      "about-1",
      {
        draft: aboutDraft,
        id: "about-1",
        model: { key: "about", kind: "page", path: "/about" },
        published: published(aboutDraft),
        updatedBy,
      },
    ],
  ]);
}

function summary(entry: StoredEntry) {
  const status =
    entry.published === undefined
      ? "draft"
      : entry.published.revision === entry.draft.revision
        ? "published"
        : "changed";
  return {
    draftRevision: entry.draft.revision,
    id: entry.id,
    listValues: {},
    modelKey: entry.model.key,
    ...(entry.published === undefined
      ? {}
      : { publishedAt: entry.published.updatedAt, publishedSnapshotId: entry.published.id }),
    ...(entry.draft.slug === undefined ? {} : { slug: entry.draft.slug }),
    status,
    title: entry.draft.title,
    updatedAt: entry.draft.updatedAt,
    updatedBy: entry.updatedBy,
  };
}

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ body: JSON.stringify(body), contentType: "application/json", status });
}

function validationError(route: Route, path: string) {
  return json(
    route,
    {
      error: {
        code: "VALIDATION_FAILED",
        details: { issues: [{ code: "invalid_value", message: "Invalid", path }] },
        message: "The submitted value is invalid.",
      },
    },
    422,
  );
}

/** A stateful admin API covering the entry lifecycle endpoints. */
async function mockApi(page: Page, role: Role) {
  const entries = seed();
  const requests: string[] = [];
  let version = 5;
  await page.route(isApiRequest, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path.endsWith("/link-impact"))
      return json(route, {
        mode: "sources",
        sources: [],
        hasPublishedUsages: false,
        receipt: "unreferenced",
      });
    const method = request.method();
    if (path === sessionPath) return json(route, sessionSummary({ id: `${role}-1`, role }));
    if (path === "/api/v1/admin/content-models") return json(route, { items: [about, posts] });
    if (path === "/api/v1/admin/build-site")
      return json(route, {
        site: { id: "main-site", label: "Main site", url: "https://site.example/blog/" },
      });
    if (path === "/api/v1/admin/site-builds") return json(route, { items: [] });
    const list = /^\/api\/v1\/admin\/models\/([^/]+)\/entries$/u.exec(path);
    if (list !== null && method === "GET") {
      const items = [...entries.values()]
        .filter((entry) => entry.model.key === list[1])
        .map(summary);
      const totals = { all: items.length, changed: 0, draft: 0, published: 0 };
      for (const item of items) totals[item.status as "changed" | "draft" | "published"] += 1;
      return json(route, { items, totals });
    }
    const match = /^\/api\/v1\/admin\/entries\/([^/]+)(?:\/([a-z]+))?$/u.exec(path);
    const entry = match === null ? undefined : entries.get(match[1]!);
    if (match === null || entry === undefined) return route.fallback();
    const action = match[2];
    if (method !== "GET") requests.push(`${method} ${action ?? "entry"}`);
    if (action === undefined && method === "GET") return json(route, entry);
    if (action === undefined && method === "DELETE") {
      entries.delete(entry.id);
      return route.fulfill({ status: 204 });
    }
    if (action === "draft") {
      const body = request.postDataJSON() as { slug?: string; title: string };
      if (body.title.length === 0) return validationError(route, "/title");
      if (body.title.includes("invalid")) return validationError(route, "/title");
      const { slug: _previous, ...rest } = entry.draft;
      entry.draft = {
        ...rest,
        ...(body.slug === undefined ? {} : { slug: body.slug }),
        revision: entry.draft.revision + 1,
        title: body.title,
      };
      return json(route, entry);
    }
    if (action === "publish") {
      entry.published = published(entry.draft);
      version += 1;
      return json(route, {
        build: { status: "queued", targetVersion: version },
        entry,
        publication: "published",
      });
    }
    if (action === "unpublish") {
      delete entry.published;
      version += 1;
      return json(route, {
        build: { status: "queued", targetVersion: version },
        entry,
        unpublication: "unpublished",
      });
    }
    if (action === "revert" && entry.published !== undefined) {
      const revision = entry.draft.revision + 1;
      entry.draft = { ...entry.published, id: entry.draft.id, revision, state: "draft" };
      entry.published = { ...entry.published, revision };
      return json(route, entry);
    }
    if (action === "duplicate") {
      const id = `${entry.id}-copy`;
      const { slug: _slug, ...rest } = entry.draft;
      const copy: StoredEntry = {
        ...entry,
        draft: {
          ...rest,
          entryId: id,
          id: `${id}-draft`,
          revision: 1,
          title: `${entry.draft.title} (copy)`,
        },
        id,
      };
      delete copy.published;
      entries.set(id, copy);
      return json(route, copy, 201);
    }
    return route.fallback();
  });
  return requests;
}

async function openEntryAction(page: Page, name: string) {
  await page.getByRole("button", { name: "Entry actions" }).click();
  await page.getByRole("menuitem", { name }).click();
}

test("an admin saves and publishes in one action and validation stops it", async ({ page }) => {
  const requests = await mockApi(page, "admin");
  await page.goto("/admin/content/posts/notes");
  const title = page.getByRole("textbox", { name: "Title" });
  await expect(title).toHaveValue("Notes");
  await expect(page.getByRole("button", { name: "Publish", exact: true })).toBeEnabled();

  await title.fill("");
  await page.getByRole("button", { name: "Save and publish" }).click();
  await page
    .getByRole("dialog", { name: "Save and publish this entry?" })
    .getByRole("button", { name: "Save and publish" })
    .click();
  await expect(page.getByRole("heading", { name: "There is 1 problem to fix" })).toBeVisible();
  expect(requests).toEqual([]);

  await title.fill("Release notes");
  await page.getByRole("textbox", { name: "Slug" }).fill("release-notes");
  await page.getByRole("button", { name: "Save and publish" }).click();
  await page
    .getByRole("dialog", { name: "Save and publish this entry?" })
    .getByRole("button", { name: "Save and publish" })
    .click();
  const publication = page.getByRole("region", { name: "Publication status" });
  await expect(publication).toContainText("LiveRevision 3");
  await expect(page.getByText("Saved revision 3")).toBeVisible();
  expect(requests).toEqual(["PUT draft", "POST publish"]);
  await expect(
    publication.getByRole("link", {
      name: "Open /posts/release-notes on site (opens in a new tab)",
    }),
  ).toHaveAttribute("href", "https://site.example/blog/posts/release-notes");
});

test("a rejected save publishes nothing", async ({ page }) => {
  const requests = await mockApi(page, "admin");
  await page.goto("/admin/content/posts/notes");
  await page.getByRole("textbox", { name: "Title" }).fill("invalid title");
  await page.getByRole("button", { name: "Save and publish" }).click();
  await page
    .getByRole("dialog", { name: "Save and publish this entry?" })
    .getByRole("button", { name: "Save and publish" })
    .click();
  await expect(page.getByRole("heading", { name: /problem to fix/u })).toBeVisible();
  expect(requests).toEqual(["PUT draft"]);
  await expect(page.getByRole("textbox", { name: "Title" })).toHaveValue("invalid title");
});

test("an admin reverts, unpublishes, and deletes a published entry", async ({ page }) => {
  const requests = await mockApi(page, "admin");
  await page.goto("/admin/content/posts/launch");
  const publication = page.getByRole("region", { name: "Publication status" });
  await expect(publication).toContainText("Changed");
  await expect(publication.getByRole("link", { name: /on site/u })).toHaveAttribute(
    "href",
    "https://site.example/blog/posts/launch",
  );

  await openEntryAction(page, "Revert to published");
  const revert = page.getByRole("dialog", { name: "Revert to published?" });
  await expect(revert).toContainText("The saved draft changes since the last publication");
  await revert.getByRole("button", { name: "Revert to published" }).click();
  await expect(page.getByRole("textbox", { name: "Title" })).toHaveValue("Launch (live)");
  await expect(publication).toContainText("Published");
  await expect(page.getByRole("button", { name: "Entry actions" })).toBeFocused();

  await page.getByRole("textbox", { name: "Title" }).fill("Kept while unpublishing");
  await openEntryAction(page, "Unpublish");
  const unpublish = page.getByRole("dialog", { name: "Unpublish this entry?" });
  await expect(unpublish).toContainText("Its public path /posts/launch stops working");
  await unpublish.getByRole("button", { name: "Unpublish" }).click();
  await expect(publication).toContainText("LiveNot published");
  await expect(publication).toContainText(/Unpublished\. Build for version 6/u);
  await expect(page.getByRole("textbox", { name: "Title" })).toHaveValue("Kept while unpublishing");
  await expect(publication.getByRole("link", { name: /on site/u })).toHaveCount(0);

  await page.getByRole("button", { name: "Save draft" }).click();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await page.getByRole("button", { name: "Confirm publication" }).click();
  await expect(publication).toContainText("Published");

  await openEntryAction(page, "Delete");
  const remove = page.getByRole("dialog", { name: "Delete entry?" });
  await expect(remove).toContainText("disappears from the site after the next build");
  const confirm = remove.getByRole("button", { name: "Delete entry" });
  await expect(confirm).toBeDisabled();
  await remove
    .getByRole("textbox", { name: "Type “Kept while unpublishing” to confirm" })
    .fill("Kept while unpublishing");
  await confirm.click();
  await expect(page).toHaveURL(/\/admin\/content\/posts$/u);
  await expect(page.getByRole("heading", { level: 1, name: "Posts" })).toBeFocused();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Kept while unpublishing" })).toHaveCount(0);
  expect(requests).toEqual([
    "POST revert",
    "POST unpublish",
    "PUT draft",
    "POST publish",
    "DELETE entry",
  ]);
});

test("a page warns that its fixed path will return 404", async ({ page }) => {
  await mockApi(page, "admin");
  await page.goto("/admin/content/about/about-1");
  await page.getByRole("button", { name: "Entry actions" }).click();
  await expect(page.getByRole("menuitem")).toHaveText(["Unpublish"]);
  await page.getByRole("menuitem", { name: "Unpublish" }).click();
  await expect(page.getByRole("dialog", { name: "Unpublish this page?" })).toContainText(
    "The page's fixed path /about will return 404 after the next site build.",
  );
});

test("an editor duplicates from the row menu with the keyboard and cannot unpublish", async ({
  page,
}) => {
  await mockApi(page, "editor");
  await page.goto("/admin/content/posts");
  const actions = page.getByRole("button", { name: "Actions for Launch" });
  await actions.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem")).toHaveText(["Open", "Duplicate"]);
  await page.keyboard.press("Escape");
  await expect(actions).toBeFocused();

  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Duplicate" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/admin\/content\/posts\/launch-copy$/u);
  await expect(page.getByRole("textbox", { name: "Title" })).toHaveValue("Launch (copy)");
  await expect(page.getByRole("textbox", { name: "Slug" })).toHaveValue("");

  await page.getByRole("button", { name: "Entry actions" }).click();
  await expect(page.getByRole("menuitem")).toHaveText(["Duplicate", "Delete"]);
  await page.keyboard.press("Escape");
  await page.getByRole("textbox", { name: "Title" }).fill("Launch follow-up");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Saved revision 2")).toBeVisible();
});

test("an editor creates an entry and lands in its editor", async ({ page }) => {
  await mockApi(page, "editor");
  await page.route(
    (url) => url.pathname === "/api/v1/admin/models/posts/entries",
    async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      await json(
        route,
        {
          draft: snapshot("notes", 2, "Notes"),
          id: "notes",
          model: { key: "posts", kind: "collection", route: "/posts/:slug" },
          updatedBy: { displayName: "Ada Admin", id: "admin-1" },
        },
        201,
      );
    },
  );
  await page.goto("/admin/content/posts");
  await page.getByRole("button", { name: "Create entry" }).click();
  const dialog = page.getByRole("dialog", { name: "Create entry" });
  await dialog.getByRole("textbox", { name: "Title" }).fill("Notes");
  await dialog.getByRole("button", { name: "Create entry" }).click();
  await expect(page).toHaveURL(/\/admin\/content\/posts\/notes$/u);
  await expect(page.getByRole("heading", { name: "Edit Posts" })).toBeVisible();
});

test("viewers get neither the entry menu nor row menus", async ({ page }) => {
  await mockApi(page, "viewer");
  await page.goto("/admin/content/posts");
  await expect(page.getByRole("link", { name: "Launch" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Actions for/u })).toHaveCount(0);
  await page.getByRole("link", { name: "Launch" }).click();
  await expect(page.getByRole("heading", { name: "Edit Posts" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Entry actions" })).toHaveCount(0);
});
