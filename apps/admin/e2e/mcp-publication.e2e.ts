import { expect, test, type Page } from "@playwright/test";
import { sessionPath, sessionSummary } from "./support/session.js";
import { expectNoAccessibilityViolations } from "./support/accessibility.js";

async function backend(page: Page, canPublish = true) {
  const decisions: unknown[] = [];
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    async (route) => {
      const path = new URL(route.request().url()).pathname;
      const json = (body: unknown) =>
        route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
      if (path === sessionPath) return json(sessionSummary({ id: "admin", role: "admin" }));
      if (path === "/api/v1/setup/state") return json({ setupComplete: true });
      if (path === "/api/v1/admin/content-models")
        return json({ items: [], listQueryLimits: { maxSearchLength: 200 } });
      if (path === "/api/v1/admin/settings/status")
        return json({
          configuredModels: 1,
          engineVersion: "test",
          ready: true,
          email: { provider: "none" },
          mcp: { enabled: true, endpoint: "https://cms.test:54321/mcp" },
        });
      if (path === "/api/auth/oauth2/authorize")
        return json({
          transaction: "transaction",
          clientName: "Assistant",
          callbackHostname: "client.test",
          scopes: ["content:read", "content:write", "content:publish", "offline_access"],
          canWrite: true,
          canPublish,
        });
      if (path === "/api/auth/oauth2/consent") {
        decisions.push(route.request().postDataJSON());
        return json({ redirect: true, url: "http://127.0.0.1:4173/admin/settings" });
      }
      return json({ items: [] });
    },
  );
  return decisions;
}

test("publication consent at 320px has separate accessible radios and keyboard approval", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  const decisions = await backend(page);
  await page.goto("/admin/mcp/consent?mcpTransaction=transaction");
  const read = page.getByRole("radio", { name: /^Read content/ });
  await expect(read).toBeChecked();
  await expect(page.getByRole("radio", { name: /^Read and edit drafts/ })).toBeVisible();
  const publish = page.getByRole("radio", { name: /^Read, edit and publish/ });
  await expect(publish).toBeVisible();
  await read.focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(publish).toBeChecked();
  await expect(page.getByText(/Unpublishing, deleting content/)).toBeVisible();
  await expectNoAccessibilityViolations(page, "MCP publication consent at 320px");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole("button", { name: "Allow access" }).focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => decisions.length).toBe(1);
  expect(decisions[0]).toMatchObject({
    accept: true,
    scope: "content:read content:write content:publish offline_access",
  });
});

test("editor sees disabled publication with narrower consent available", async ({ page }) => {
  await backend(page, false);
  await page.goto("/admin/mcp/consent?mcpTransaction=transaction");
  await expect(page.getByRole("radio", { name: /^Read, edit and publish/ })).toBeDisabled();
  await expect(page.getByRole("radio", { name: /^Read and edit drafts/ })).toBeEnabled();
});

test("Settings publishing choice survives client switching and keyboard use at 320px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await backend(page);
  await page.goto("/admin/settings");
  const card = page.getByRole("region", { name: "MCP", exact: true });
  const read = card.getByRole("radio", { name: "Read only", exact: true });
  await expect(read).toBeChecked();
  await read.focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(card.getByRole("radio", { name: "Publishing", exact: true })).toBeChecked();
  for (const name of ["Codex CLI", "Codex TOML", "Claude Code", "Gemini CLI", "Other clients"]) {
    const tab = card.getByRole("tab", { name, exact: true });
    await tab.focus();
    await page.keyboard.press("Enter");
    await expect(card.getByRole("tabpanel", { name, exact: true })).toContainText(
      "content:publish",
    );
    await expect(card.getByRole("radio", { name: "Publishing", exact: true })).toBeChecked();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  await expectNoAccessibilityViolations(page, "MCP Settings publication at 320px");
});
