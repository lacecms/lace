import { expect, test, type Page } from "@playwright/test";
import { expectNoAccessibilityViolations } from "./support/accessibility.js";
import { sessionPath, sessionSummary } from "./support/session.js";

type Role = "admin" | "editor" | "viewer";
const models = [
  { key: "home", kind: "page", label: "Home", path: "/", blocks: [], fields: {}, version: 1 },
  {
    key: "posts",
    kind: "collection",
    label: "Posts",
    route: "/posts/:slug",
    blocks: [],
    fields: {},
    version: 1,
  },
];
async function mock(page: Page, identity: { role: Role; id: string; signedIn?: boolean }) {
  const mutations: string[] = [];
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (request.method() !== "GET") mutations.push(url.pathname);
      let data: unknown;
      if (url.pathname === sessionPath)
        data =
          identity.signedIn === false
            ? null
            : sessionSummary({ displayName: "Tour User", id: identity.id, role: identity.role });
      else if (url.pathname === "/api/v1/setup/state") data = { setupComplete: true };
      else if (url.pathname === "/api/v1/admin/content-models") data = { items: models };
      else if (url.pathname === "/api/v1/admin/entries/entry-1")
        data = {
          id: "entry-1",
          updatedBy: { id: identity.id, displayName: "Tour User" },
          model: { key: "posts", kind: "collection", route: "/posts/:slug" },
          draft: {
            id: "snapshot-1",
            entryId: "entry-1",
            title: "First post",
            slug: "first-post",
            revision: 1,
            state: "draft",
            fields: {},
            blocks: [],
            createdAt: "2026-10-01T10:00:00.000Z",
            updatedAt: "2026-10-01T10:00:00.000Z",
            updatedBy: { id: identity.id, role: identity.role },
          },
        };
      else if (url.pathname.endsWith("/entries"))
        data = { items: [], totals: { all: 0, draft: 0, published: 0, changed: 0 } };
      else data = { items: [] };
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(data) });
    },
  );
  return mutations;
}
async function replay(page: Page, mobile = false) {
  if (mobile) await page.getByRole("button", { name: "Open navigation" }).click();
  const root = mobile
    ? page.getByRole("dialog", { name: "Navigation" })
    : page.getByRole("complementary", { name: "Admin navigation" });
  await root.getByRole("button", { name: /account menu/ }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("menuitem", { name: "Introduction" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: /Content/ })).toBeVisible();
}
for (const role of ["admin", "editor", "viewer"] as const) {
  test(`${role} gets permitted steps, persists completion, and replays`, async ({ page }) => {
    const identity = { role, id: `${role}-tour` };
    const mutations = await mock(page, identity);
    await page.goto("/admin/content");
    await expect(page.getByRole("button", { name: "Start tour" })).toBeVisible();
    await expectNoAccessibilityViolations(page, `${role} invitation`);
    await page.getByRole("button", { name: "Start tour" }).click();
    const titles = [
      "Content",
      "Pages",
      "Collections",
      "Media",
      "Builds",
      ...(role === "admin" ? ["Users", "Settings"] : []),
    ];
    for (let i = 0; i < titles.length; i++) {
      const dialog = page.getByRole("dialog");
      await expect(dialog).toHaveAccessibleName(`${titles[i]}, Step ${i + 1} of ${titles.length}`);
      await expect(dialog.getByRole("heading")).toBeFocused();
      const body = await dialog.innerText();
      if (role !== "admin")
        expect(body).not.toMatch(
          /Publish a saved|Request a build|retry a failed|Create a named build token/,
        );
      if (role === "viewer") expect(body).not.toMatch(/Save to keep|Upload supported/);
      await expectNoAccessibilityViolations(page, `${role} ${titles[i]}`);
      await dialog
        .getByRole("button", { name: i === titles.length - 1 ? "Finish" : "Next" })
        .click();
    }
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Content", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Start tour" })).toHaveCount(0);
    await replay(page);
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("complementary").getByRole("button", { name: /account menu/ }),
    ).toBeFocused();
    expect(mutations).toEqual([]);
    identity.id = `${role}-other`;
    await page.reload();
    await expect(page.getByRole("button", { name: "Start tour" })).toBeVisible();
    await page.getByRole("button", { name: "Skip", exact: true }).click();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Content", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Start tour" })).toHaveCount(0);
  });
}

test("mobile keyboard replay hands focus from sheet to tour and back; reduced motion fits every step", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 740 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mock(page, { role: "admin", id: "mobile-tour" });
  await page.goto("/admin/content");
  await page.getByRole("button", { name: "Skip", exact: true }).click();
  await replay(page, true);
  await expect(page.getByRole("dialog", { name: "Navigation" })).toHaveCount(0);
  for (let i = 0; i < 7; i++) {
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading")).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      375,
    );
    await expectNoAccessibilityViolations(page, `mobile step ${i + 1}`);
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null),
    ).toBe(true);
    const focused = await page.evaluate(() => {
      const css = getComputedStyle(document.activeElement!);
      return css.outlineStyle !== "none" && css.outlineWidth !== "0px";
    });
    expect(focused).toBe(true);
    if (i < 6) {
      await dialog.getByRole("button", { name: "Next" }).focus();
      await page.keyboard.press("Enter");
    }
  }
  await page.getByRole("button", { name: "Back" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toHaveAccessibleName("Users, Step 6 of 7");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Open navigation" })).toBeFocused();
});

test("replay preserves an unsaved entry and never sends mutations", async ({ page }) => {
  const mutations = await mock(page, { role: "editor", id: "unsaved-tour" });
  await page.goto("/admin/content/posts/entry-1?source=tour");
  await page.getByRole("textbox", { name: "Title" }).fill("Unsaved title");
  const url = page.url();
  await replay(page);
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Back" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("textbox", { name: "Title" })).toHaveValue("Unsaved title");
  expect(page.url()).toBe(url);
  expect(mutations).toEqual([]);
});

test("denied browser storage suppresses repeat invitations within the document and permits replay", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new Error("Storage denied");
      },
    }),
  );
  await mock(page, { role: "viewer", id: "denied-tour" });
  await page.goto("/admin/content");
  await page.getByRole("button", { name: "Skip", exact: true }).click();
  await page.getByRole("complementary").getByRole("link", { name: "Media", exact: true }).click();
  await expect(page.getByRole("button", { name: "Start tour" })).toHaveCount(0);
  await replay(page);
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.getByRole("button", { name: "Start tour" })).toBeVisible();
});

test("anonymous visitors receive no invitation or replay", async ({ page }) => {
  await mock(page, { role: "viewer", id: "anon", signedIn: false });
  await page.goto("/admin/content");
  await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start tour" })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "Introduction" })).toHaveCount(0);
});
