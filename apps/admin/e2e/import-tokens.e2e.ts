import { expect, test, type Page } from "@playwright/test";
import { sessionPath, sessionSummary } from "./support/session.js";
import { expectNoAccessibilityViolations } from "./support/accessibility.js";

const expired = {
  capabilities: ["content:import"],
  createdAt: "2026-10-20T10:00:00.000Z",
  createdBy: { displayName: "Ada Admin", email: "admin@lace.test", id: "admin" },
  expiresAt: "2026-10-21T10:00:00.000Z",
  id: "expired",
  lastUsedAt: "2026-10-20T11:00:00.000Z",
  name: "Old import",
  tokenPrefix: "oldoldol",
};

async function backend(page: Page) {
  const tokens: Record<string, unknown>[] = [expired];
  const requests: unknown[] = [];
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const json = (body: unknown, status = 200) =>
        route.fulfill({ contentType: "application/json", body: JSON.stringify(body), status });
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
          mcp: { enabled: false, endpoint: "https://cms.test/mcp" },
        });
      if (path === "/api/v1/admin/import-tokens" && request.method() === "POST") {
        const body = request.postDataJSON() as {
          allowPublish: boolean;
          expiresInDays: number;
          name: string;
        };
        requests.push(body);
        const created = {
          capabilities: body.allowPublish
            ? ["content:import", "content:publish"]
            : ["content:import"],
          createdAt: new Date().toISOString(),
          createdBy: { displayName: "Ada Admin", email: "admin@lace.test", id: "admin" },
          expiresAt: new Date(Date.now() + body.expiresInDays * 86_400_000).toISOString(),
          id: "created",
          name: body.name,
          tokenPrefix: "newnewne",
        };
        tokens.unshift(created);
        return json({ ...created, token: "import-once-shown-secret" }, 201);
      }
      if (path === "/api/v1/admin/import-tokens") return json({ items: tokens });
      if (path === "/api/v1/admin/import-tokens/created" && request.method() === "DELETE") {
        tokens[0] = { ...tokens[0], revokedAt: new Date().toISOString() };
        return json(tokens[0]);
      }
      return json({ items: [] });
    },
  );
  return requests;
}

test("an administrator issues, copies and revokes an import token by keyboard at 320 px", async ({
  context,
  page,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.setViewportSize({ width: 320, height: 800 });
  const requests = await backend(page);
  await page.goto("/admin/settings");
  const section = page.getByRole("region", { name: "Import tokens" });
  const table = page.getByRole("table", { name: "Import tokens" });
  await expect(table.getByRole("row", { name: /Old import/u })).toContainText("Expired");
  await expect(table.getByRole("button", { name: "Revoke Old import" })).toHaveCount(0);
  await expectNoAccessibilityViolations(page, "settings with import tokens at 320 px");

  await section.getByRole("button", { name: "Create import token" }).focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Create import token" });
  await expect(dialog).toBeVisible();
  await page.keyboard.type("Framer import");
  await expectNoAccessibilityViolations(page, "import-token dialog at 320 px");
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("combobox", { name: "Expires after" })).toBeFocused();
  await page.keyboard.press("Enter");
  await page.getByRole("option", { name: "7 days" }).press("Enter");
  // Radix returns focus to the trigger once the listbox has closed.
  const expiry = dialog.getByRole("combobox", { name: "Expires after" });
  await expect(expiry).toHaveText("7 days");
  await expect(expiry).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("checkbox", { name: "Allow publishing" })).toBeFocused();
  await page.keyboard.press("Space");
  await dialog.getByRole("textbox", { name: "Token name" }).press("Enter");

  const shown = page.getByRole("dialog", { name: "Copy your import token" });
  await expect(shown.getByTestId("issued-import-token")).toHaveText("import-once-shown-secret");
  expect(requests).toEqual([{ allowPublish: true, expiresInDays: 7, name: "Framer import" }]);
  await expectNoAccessibilityViolations(page, "once-shown import token at 320 px");
  await shown.getByRole("button", { name: "Copy token" }).press("Enter");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "import-once-shown-secret",
  );
  await shown.getByRole("button", { name: "Done" }).press("Enter");
  await expect(page.getByText("import-once-shown-secret")).toHaveCount(0);

  const row = table.getByRole("row", { name: /Framer import/u });
  await expect(row).toContainText("Active");
  await expect(row).toContainText("Drafts, media, publish");
  await row.getByRole("button", { name: "Revoke Framer import" }).press("Enter");
  const confirm = page.getByRole("dialog", { name: "Revoke import token?" });
  await expect(confirm).toContainText("Framer import");
  await confirm.getByRole("button", { name: "Revoke token" }).press("Enter");
  await expect(row).toContainText("Revoked");
  await expect(row.getByRole("button", { name: "Revoke Framer import" })).toHaveCount(0);
});
