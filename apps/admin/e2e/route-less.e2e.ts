import { expect, test, type Page, type Route } from "@playwright/test";
import { sessionPath, sessionSummary } from "./support/session.js";

// Match API calls by pathname prefix so Vite module URLs under /src/shared/api
// are never intercepted.
const isApiRequest = (url: URL) => url.pathname.startsWith("/api/");

const now = "2026-10-01T00:00:00.000Z";
const home = { blocks: [], fields: {}, key: "home", kind: "page", path: "/", version: 1 };
const testimonials = {
  blocks: [],
  fields: { quote: { label: "Quote", required: false, type: "textarea" } },
  key: "testimonials",
  kind: "collection",
  label: "Testimonials",
  listFields: ["quote"],
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

interface StoredEntry {
  draft: Snapshot;
  readonly id: string;
  readonly model: { readonly key: string; readonly kind: string };
  published?: Snapshot;
  readonly updatedBy: { readonly displayName: string; readonly id: string };
}

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ body: JSON.stringify(body), contentType: "application/json", status });
}

function snapshot(entryId: string, title: string, fields: Record<string, unknown> = {}): Snapshot {
  return {
    blocks: [],
    createdAt: now,
    entryId,
    fields,
    id: `${entryId}-draft`,
    revision: 1,
    state: "draft",
    title,
    updatedAt: now,
    updatedBy: { id: "admin-1", role: "admin" },
  };
}

/** A stateful admin API with one route-less collection that holds a published entry. */
async function mockApi(page: Page) {
  const updatedBy = { displayName: "Ada Admin", id: "admin-1" };
  const model = { key: "testimonials", kind: "collection" };
  const first = snapshot("grace", "Grace Hopper", { quote: "It's easier to ask forgiveness." });
  const entries = new Map<string, StoredEntry>([
    [
      "grace",
      {
        draft: first,
        id: "grace",
        model,
        published: { ...first, id: "grace-published", state: "published" },
        updatedBy,
      },
    ],
  ]);
  const requests: string[] = [];
  let version = 5;
  await page.route(isApiRequest, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (path.endsWith("/link-impact"))
      return json(route, {
        mode: "sources",
        sources: [],
        hasPublishedUsages: false,
        receipt: "unreferenced",
      });
    if (path === sessionPath) return json(route, sessionSummary({ id: "admin-1", role: "admin" }));
    if (path === "/api/v1/admin/content-models")
      return json(route, { items: [home, testimonials] });
    if (path === "/api/v1/admin/build-site")
      return json(route, {
        site: { id: "main-site", label: "Main site", url: "https://site.example/" },
      });
    if (path === "/api/v1/admin/site-builds") return json(route, { items: [] });
    if (path === "/api/v1/admin/models/home/entries")
      return json(route, { items: [], totals: { all: 0, changed: 0, draft: 0, published: 0 } });
    if (path === "/api/v1/admin/models/testimonials/entries" && method === "POST") {
      const body = request.postDataJSON() as { slug?: string; title: string };
      requests.push(`POST create title=${body.title} slug=${body.slug ?? "-"}`);
      const created: StoredEntry = {
        draft: snapshot("ada", body.title),
        id: "ada",
        model,
        updatedBy,
      };
      entries.set(created.id, created);
      return json(route, created, 201);
    }
    if (path === "/api/v1/admin/models/testimonials/entries") {
      const items = [...entries.values()].map((entry) => {
        const status = entry.published === undefined ? "draft" : "published";
        return {
          draftRevision: entry.draft.revision,
          id: entry.id,
          listValues: { quote: entry.draft.fields.quote ?? null },
          modelKey: "testimonials",
          ...(entry.published === undefined
            ? {}
            : { publishedAt: now, publishedSnapshotId: entry.published.id }),
          status,
          title: entry.draft.title,
          updatedAt: entry.draft.updatedAt,
          updatedBy: entry.updatedBy,
        };
      });
      const totals = { all: items.length, changed: 0, draft: 0, published: 0 };
      for (const item of items) totals[item.status as "draft" | "published"] += 1;
      return json(route, { items, totals });
    }
    const match = /^\/api\/v1\/admin\/entries\/([^/]+)(?:\/([a-z]+))?$/u.exec(path);
    const entry = match === null ? undefined : entries.get(match[1]!);
    if (match === null || entry === undefined) return route.fallback();
    const action = match[2];
    if (action === undefined && method === "GET") return json(route, entry);
    if (action === "draft") {
      const body = request.postDataJSON() as {
        fields: Record<string, unknown>;
        slug?: string;
        title: string;
      };
      requests.push(`PUT draft title=${body.title} slug=${body.slug ?? "-"}`);
      entry.draft = {
        ...entry.draft,
        fields: body.fields,
        revision: entry.draft.revision + 1,
        title: body.title,
      };
      return json(route, entry);
    }
    if (action === "publish") {
      requests.push("POST publish");
      entry.published = { ...entry.draft, id: `${entry.id}-published`, state: "published" };
      version += 1;
      return json(route, {
        build: { status: "queued", targetVersion: version },
        entry,
        publication: "published",
      });
    }
    if (action === "unpublish") {
      requests.push("POST unpublish");
      delete entry.published;
      version += 1;
      return json(route, {
        build: { status: "queued", targetVersion: version },
        entry,
        unpublication: "unpublished",
      });
    }
    return route.fallback();
  });
  return requests;
}

test("a route-less collection lists, creates, edits and publishes entries without slugs", async ({
  page,
}) => {
  const requests = await mockApi(page);
  await page.goto("/admin/content/testimonials");
  const table = page.getByRole("table", { name: "Testimonials entries" });
  await expect(table.getByRole("link", { name: "Grace Hopper" })).toBeVisible();
  await expect(table).not.toContainText("No slug");

  await page.getByRole("button", { name: "Create entry" }).first().click();
  const create = page.getByRole("dialog", { name: "Create entry" });
  await expect(create.getByRole("textbox", { name: "Slug" })).toHaveCount(0);
  await create.getByRole("textbox", { name: "Title" }).fill("Ada Lovelace");
  await create.getByRole("button", { name: "Create entry" }).click();

  await expect(page.getByRole("heading", { name: "Edit Testimonials" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Slug" })).toHaveCount(0);
  const publication = page.getByRole("region", { name: "Publication status" });
  await expect(publication).not.toContainText("Public URL");
  await page.getByRole("textbox", { name: "Quote" }).fill("The engine weaves patterns.");
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.getByRole("banner").getByRole("status")).toHaveText("Saved revision 2");

  await page.getByRole("button", { name: "Publish", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "Publish this entry?" });
  await expect(confirmation).not.toContainText(" at /");
  await confirmation.getByRole("button", { name: "Confirm publication" }).click();
  await expect(publication).toContainText(/Published\. Build for version 6/u);
  await expect(publication.getByRole("link", { name: /on site/u })).toHaveCount(0);

  await page.getByRole("button", { name: "Entry actions" }).click();
  await page.getByRole("menuitem", { name: "Unpublish" }).click();
  const unpublish = page.getByRole("dialog", { name: "Unpublish this entry?" });
  await expect(unpublish).toContainText(
    "The entry disappears from the pages that list it after the next site build.",
  );
  await unpublish.getByRole("button", { name: "Unpublish" }).click();
  await expect(publication).toContainText("Not published");

  expect(requests).toEqual([
    "POST create title=Ada Lovelace slug=-",
    "PUT draft title=Ada Lovelace slug=-",
    "POST publish",
    "POST unpublish",
  ]);
});
