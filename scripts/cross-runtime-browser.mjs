import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { loadBrowser } from "./acceptance-browser.mjs";
import { password, png } from "../tests/support/cross-runtime-fixture.mjs";
import { moveFirstHeroWithKeyboard } from "../apps/admin/e2e/helpers/block-order-keyboard.ts";
import { expectNoAccessibilityViolations } from "../apps/admin/e2e/support/accessibility.ts";
const require = createRequire(new URL("../apps/admin/package.json", import.meta.url));
const { expect } = require("@playwright/test");

export async function browserJourney(f, workspace) {
  const browser = await loadBrowser(workspace);
  const contexts = [];
  const report = (name) => console.info(`34A ${f.kind} browser: ${name}`);
  const login = async (role) => {
    const context = await browser.newContext({ baseURL: f.origin });
    contexts.push(context);
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    await page.goto("/admin/");
    await page.getByRole("textbox", { name: "Email", exact: true }).fill(`${role}@34a.test`);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Content", exact: true })).toBeVisible();
    return page;
  };
  try {
    report("admin sign-in, accessible content and media reuse");
    const page = await login("admin");
    await expectNoAccessibilityViolations(page, `${f.kind} Content`);
    await page.goto("/admin/media");
    await page
      .getByLabel("Upload images")
      .setInputFiles({ name: "browser-cover.png", mimeType: "image/png", buffer: png });
    await expect(
      page
        .getByRole("list", { name: "Media library" })
        .getByRole("button", { name: "browser-cover.png", exact: true }),
    ).toBeVisible();
    await expectNoAccessibilityViolations(page, `${f.kind} Media`);
    const response = await f.call("/api/v1/admin/models/home/entries", { cookie: f.cookies.admin });
    const homeId = (await response.json()).items[0].id;
    const entryPath = `/admin/content/home/${homeId}`;
    await page.goto(entryPath);
    await page.getByRole("textbox", { name: "Title", exact: true }).fill("Browser published home");
    // Clear existing fixture blocks through the editor so ordering has exactly two heroes.
    const cards = page.getByRole("article");
    while (await cards.count()) {
      const remaining = await cards.count();
      await cards
        .first()
        .getByRole("button", { name: /Actions for .* block/u })
        .click();
      await page.getByRole("menuitem", { name: "Remove", exact: true }).click();
      await expect(cards).toHaveCount(remaining - 1);
    }
    for (const heading of ["First browser hero", "Second browser hero"]) {
      await page.getByRole("button", { name: "Add block", exact: true }).click();
      await page
        .getByRole("dialog", { name: "Add block" })
        .getByRole("button", { name: "Hero", exact: true })
        .click();
      await cards.last().getByRole("textbox", { name: "Heading", exact: true }).fill(heading);
    }
    await moveFirstHeroWithKeyboard(page, cards);
    await expect(cards.first().getByRole("textbox", { name: "Heading", exact: true })).toHaveValue(
      "Second browser hero",
    );
    await page.getByRole("button", { name: "Add block", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Add block" })
      .getByRole("button", { name: "Image", exact: true })
      .click();
    await cards.last().getByRole("textbox", { name: "Alt", exact: true }).fill("Browser cover");
    await page.getByRole("button", { name: "Choose media for Media", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Choose media for Media" })
      .getByRole("button", { name: "browser-cover.png", exact: true })
      .click();
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page.getByText(/Saved revision/u)).toBeVisible();
    await page.reload();
    await expect(cards.first().getByRole("textbox", { name: "Heading", exact: true })).toHaveValue(
      "Second browser hero",
    );
    await expectNoAccessibilityViolations(page, `${f.kind} Editor`);
    report("publication success and controlled build failure");
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await page.getByRole("button", { name: "Confirm publication", exact: true }).click();
    await expect(page.getByRole("region", { name: "Publication status" })).toContainText(
      "Published",
    );
    for (let attempt = 0; attempt < 12; attempt++) await f.dispatch();
    await page.goto("/admin/builds");
    await expect(page.getByRole("main").getByText("Failed", { exact: true }).first()).toBeVisible();
    await page
      .getByRole("button", { name: /View build/u })
      .first()
      .click();
    await expect(page.getByRole("button", { name: "Retry build", exact: true })).toBeVisible();
    await expectNoAccessibilityViolations(page, `${f.kind} Builds`);
    report("editor save, viewer read-only and denied backend actions");
    const editor = await login("editor");
    await editor.goto(entryPath);
    await expect(editor.getByRole("button", { name: "Publish", exact: true })).toHaveCount(0);
    await expect(editor.getByRole("link", { name: "Users", exact: true })).toHaveCount(0);
    await editor.getByRole("textbox", { name: "Title", exact: true }).fill("Editor private draft");
    await editor.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(editor.getByText(/Saved revision/u)).toBeVisible();
    const viewer = await login("viewer");
    await viewer.goto(entryPath);
    await expect(viewer.getByRole("button", { name: "Save draft", exact: true })).toHaveCount(0);
    await expect(viewer.getByRole("button", { name: "Publish", exact: true })).toHaveCount(0);
    await viewer.goto("/admin/media");
    await expect(viewer.getByLabel("Upload images")).toHaveCount(0);
    const denied = await f.call(`/api/v1/admin/entries/${homeId}/publish`, {
      cookie: f.cookies.editor,
      method: "POST",
      json: { expectedRevision: 1 },
    });
    assert.equal(denied.status, 403);
    report("two-session stale draft and explicit recovery");
    await page.goto(entryPath);
    const other = await login("admin");
    await other.goto(entryPath);
    await page
      .getByRole("textbox", { name: "Title", exact: true })
      .fill("Retained local authoring");
    await other
      .getByRole("textbox", { name: "Title", exact: true })
      .fill("Concurrent server draft");
    await other.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(other.getByText(/Saved revision/u)).toBeVisible();
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Draft changed elsewhere", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Title", exact: true })).toHaveValue(
      "Retained local authoring",
    );
    await expect(page.getByRole("button", { name: "Copy my JSON", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Reload server draft", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Title", exact: true })).toHaveValue(
      "Concurrent server draft",
    );
    report("backend session expiry and sign-in recovery");
    await f.expireSessions();
    await page
      .getByRole("textbox", { name: "Title", exact: true })
      .fill("Unauthorized expired draft");
    const rejected = page.waitForResponse(
      (r) => r.url().endsWith(`/entries/${homeId}/draft`) && r.request().method() === "PUT",
    );
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    assert.equal((await rejected).status(), 403);
    await page.getByRole("button", { name: "Leave without saving", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
    // Recovery itself uses the real auth endpoint and confirms the mutation never committed.
    await page.getByRole("textbox", { name: "Email", exact: true }).fill("admin@34a.test");
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Content", exact: true })).toBeVisible();
    await page.goto(entryPath);
    await expect(page.getByRole("textbox", { name: "Title", exact: true })).toHaveValue(
      "Concurrent server draft",
    );
  } finally {
    for (const context of contexts.reverse()) await context.close();
    await browser.close();
  }
}
