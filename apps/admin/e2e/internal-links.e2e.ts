import { expect, test, type Page } from "@playwright/test";
import { builtInBlocks, field, toBlockMetadata } from "@lacecms/content";
import { sessionPath, sessionSummary } from "./support/session.js";
import { expectNoAccessibilityViolations } from "./support/accessibility.js";

async function mock(page: Page, role: "admin" | "viewer" = "admin") {
  const fields = {
    website: field.url({ label: "Website" }),
    nested: field.group({ fields: { url: field.url({ label: "Nested URL" }) } }),
  };
  const model = {
    key: "posts",
    kind: "collection",
    label: "Posts",
    route: "/posts/:slug",
    version: 1,
    fields,
    layout: {
      mode: "tabs",
      groups: [
        { key: "main", label: "Main", fields: ["website"] },
        { key: "nested", label: "Nested", fields: ["nested"] },
      ],
    },
    blocks: ["hero", "link", "cta"],
    blockDefinitions: [builtInBlocks.hero, builtInBlocks.link, builtInBlocks.cta].map(
      toBlockMetadata,
    ),
  };
  const snapshot = {
    blocks: ["button", "text"].map((appearance, i) => ({
      type: "link",
      key: `01ARZ3NDEKTSV4RRFFQ69G5FA${i}`,
      schemaVersion: 1,
      position: 1000 * (i + 1),
      data: { label: `${appearance} link`, url: "entry:target" },
      settings: { appearance, newTab: false },
    })),
    id: "draft",
    entryId: "entry-1",
    state: "draft",
    revision: 1,
    title: "Source",
    slug: "source",
    fields: { website: "entry:missing", nested: { url: "entry:target" } },
    createdAt: "2026-10-23T00:00:00.000Z",
    updatedAt: "2026-10-23T00:00:00.000Z",
    updatedBy: { id: "admin-1", role: "admin" },
  };
  let current = {
    id: "entry-1",
    model: { key: "posts", kind: "collection", route: "/posts/:slug" },
    draft: snapshot,
    published: { ...snapshot, id: "published", state: "published" },
    updatedBy: { id: "admin-1", displayName: "Admin" },
  };
  const state = {
    saves: [] as Record<string, unknown>[],
    statuses: [] as string[][],
    searches: [] as string[],
    impacts: 0,
    stale: true,
    removals: [] as Record<string, unknown>[],
  };
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      const send = (body: unknown, status = 200) =>
        route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
      if (path === sessionPath) return send(sessionSummary({ id: `${role}-1`, role }));
      if (path.endsWith("/content-models")) return send({ items: [model] });
      if (path.endsWith("/build-site")) return send({ site: null });
      if (path.endsWith("/site-builds")) return send({ items: [] });
      if (path.endsWith("/entries/entry-1") && request.method() === "GET") return send(current);
      if (path.endsWith("/models/posts/entries"))
        return send({ items: [], totals: { all: 0, draft: 0, changed: 0, published: 0 } });
      if (path.endsWith("/link-targets/resolve")) {
        const ids = request.postDataJSON().ids as string[];
        state.statuses.push(ids);
        return send(
          Object.fromEntries(
            ids.map((id) => [
              id,
              id === "missing"
                ? { id, state: "missing" }
                : {
                    id,
                    state: "published",
                    modelKey: "posts",
                    modelKind: "collection",
                    title: "Target",
                    path: "/target",
                  },
            ]),
          ),
        );
      }
      if (path.endsWith("/link-targets")) {
        state.searches.push(url.searchParams.get("search") ?? "");
        return send({
          items: [
            {
              id: "target",
              state: "published",
              modelKey: "posts",
              modelKind: "collection",
              title: "Target",
              path: "/target",
            },
          ],
          ...(url.searchParams.has("after") ? {} : { nextCursor: "more" }),
        });
      }
      if (path.endsWith("/draft")) {
        const { expectedRevision: _revision, ...body } = request.postDataJSON();
        state.saves.push(body);
        current = {
          ...current,
          draft: { ...current.draft, ...body, revision: current.draft.revision + 1 },
        };
        return send(current);
      }
      if (path.endsWith("/publish"))
        return send(
          {
            error: {
              code: "VALIDATION_FAILED",
              message: "Invalid links",
              details: {
                issues: [
                  {
                    code: "internal_link_unavailable",
                    message: "Destination is unavailable",
                    path: "/fields/nested/url",
                  },
                ],
              },
            },
          },
          422,
        );
      if (path.endsWith("/link-impact")) {
        state.impacts += 1;
        const common = { hasPublishedUsages: true, receipt: state.stale ? "old" : "fresh" };
        if (url.searchParams.has("locationsAfter"))
          return send({
            ...common,
            mode: "locations",
            sourceEntryId: "source",
            snapshotId: "source-published",
            locations: [
              { sourceKey: "$fields", area: "fields", pointer: "/next", delivered: true },
            ],
          });
        return send({
          ...common,
          mode: "sources",
          sources: [
            {
              entryId: "source",
              snapshotId: "source-published",
              modelKey: "posts",
              title: "Linked source",
              phase: "published",
              locations: [
                { sourceKey: "$fields", area: "fields", pointer: "/url", delivered: true },
              ],
              ...(url.searchParams.has("after") ? {} : { nextLocationsCursor: "locations" }),
            },
          ],
          ...(url.searchParams.has("after") ? {} : { nextCursor: "sources" }),
        });
      }
      if (path.endsWith("/unpublish")) {
        const body = request.postDataJSON();
        state.removals.push(body);
        if (state.stale) {
          state.stale = false;
          return send(
            { error: { code: "CONTENT_LINK_IMPACT_CHANGED", message: "Incoming links changed" } },
            409,
          );
        }
        const { published: _published, ...entry } = current;
        return send({ entry, build: { status: "not-dispatched" }, unpublication: "unpublished" });
      }
      return send({ error: { code: "NOT_FOUND", message: "Not mocked" } }, 404);
    },
  );
  return state;
}

test("URL mode selection, nested error reveal and both Link appearances work in the editor", async ({
  page,
}) => {
  const state = await mock(page);
  await page.goto("/admin/content/posts/entry-1");
  await expect(page.getByText(/Missing destination \(missing\)/)).toBeVisible();
  expect(state.statuses).toEqual([["missing", "target"]]);
  const website = page.getByRole("button", { name: "Website", exact: true });
  await website.click();
  const picker = page.getByRole("dialog", { name: "Choose Website destination" });
  await picker.getByRole("searchbox").fill("Tar");
  await expect.poll(() => state.searches.includes("Tar")).toBe(true);
  expect(state.searches).not.toContain("Ta");
  await expect(picker.getByRole("button", { name: "Target posts · /target" })).toBeVisible();
  await picker.getByRole("button", { name: "More destinations" }).click();
  await picker.getByRole("button", { name: "Target posts · /target" }).first().click();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect.poll(() => state.saves.length).toBe(1);
  expect((state.saves[0]!.fields as Record<string, unknown>).website).toBe("entry:target");
  expect(
    (state.saves[0]!.blocks as { settings: { appearance: string } }[]).map(
      (block) => block.settings.appearance,
    ),
  ).toEqual(["button", "text"]);
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await page.getByRole("button", { name: "Confirm publication" }).click();
  await page.getByRole("link", { name: /Nested URL/ }).click();
  await expect(page.getByRole("tab", { name: /^Nested/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: "Nested URL", exact: true })).toBeFocused();
  await expect(page.getByText("Destination is unavailable", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("article", { name: "Link" })).toHaveCount(2);
  await expectNoAccessibilityViolations(page, "internal URL fields and nested publication error");
});

test("impact pagination, stale receipt refresh and unpublish preserve unsaved editor values", async ({
  page,
}) => {
  const state = await mock(page);
  await page.goto("/admin/content/posts/entry-1");
  await page.getByRole("textbox", { name: "Title", exact: true }).fill("Unsaved title");
  await page.getByRole("button", { name: "Entry actions" }).click();
  await page.getByRole("menuitem", { name: "Unpublish", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Unpublish this entry?" });
  const submit = dialog.getByRole("button", { name: "Unpublish", exact: true });
  await expect(submit).toBeDisabled();
  await dialog.getByRole("button", { name: "More locations in Linked source" }).click();
  await expect(dialog.getByText(/fields\/next/)).toBeVisible();
  await dialog.getByRole("checkbox").check();
  await submit.click();
  await expect(
    dialog.getByText("Incoming links changed. Review the current impact again."),
  ).toBeVisible();
  await expect(dialog.getByRole("checkbox")).not.toBeChecked();
  await expect(submit).toBeDisabled();
  await expectNoAccessibilityViolations(page, "incoming link impact review");
  await dialog.getByRole("checkbox").check();
  await submit.click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("textbox", { name: "Title", exact: true })).toHaveValue(
    "Unsaved title",
  );
  expect(state.removals.map((body) => (body.linkImpact as { receipt: string }).receipt)).toEqual([
    "old",
    "fresh",
  ]);
});

test("a viewer sees target availability and cannot edit link modes", async ({ page }) => {
  await mock(page, "viewer");
  await page.goto("/admin/content/posts/entry-1");
  await expect(page.getByText(/Missing destination \(missing\)/)).toBeVisible();
  for (const button of await page.getByRole("button", { name: "CMS entry", exact: true }).all())
    await expect(button).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save draft", exact: true })).toHaveCount(0);
  await expectNoAccessibilityViolations(page, "view-only internal links");
});
