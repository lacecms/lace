import { createRequire } from "node:module";
import { resolve } from "node:path";
import { expect, test, vi } from "vitest";
import { loadBrowser } from "../scripts/acceptance-browser.mjs";
import { openProductRuntime, password } from "./support/cross-runtime-fixture.mjs";
const require = createRequire(new URL("../apps/admin/package.json", import.meta.url));
const { expect: browserExpect } = require("@playwright/test");

for (const kind of ["node", "worker"]) {
  test(`34B ${kind}: persisted provider outcomes and admin retries remain truthful after dispatch faults`, async () => {
    const f = await openProductRuntime(kind);
    let browser;
    try {
      const repo = f.runtime.repository;
      const admin = (await f.runtime.security.listUsers()).find((user) => user.role === "admin");
      const actor = { id: admin.id, role: "admin" };
      const trigger = vi.spyOn(f.runtime.buildDispatcher.options.trigger, "trigger");
      trigger.mockResolvedValue({ status: "succeeded" });
      const homes = await (
        await f.call("/api/v1/admin/models/home/entries", { cookie: f.cookies.admin })
      ).json();
      const id = homes.items[0].id;
      const publish = async (title) => {
        const entry = await (
          await f.call(`/api/v1/admin/entries/${id}`, { cookie: f.cookies.admin })
        ).json();
        const saved = await f.call(`/api/v1/admin/entries/${id}/draft`, {
          cookie: f.cookies.admin,
          method: "PUT",
          json: { expectedRevision: entry.draft.revision, title, fields: {}, blocks: [] },
        });
        expect(saved.status).toBe(200);
        const draft = (await saved.json()).draft;
        const result = await f.call(`/api/v1/admin/entries/${id}/publish`, {
          cookie: f.cookies.admin,
          method: "POST",
          json: { expectedRevision: draft.revision },
        });
        expect(result.status).toBe(200);
      };
      await publish("Previous proven release");
      await f.dispatch();
      const provenVersions = (await repo.listSiteBuilds(50))
        .filter((build) => build.status === "succeeded")
        .map((build) => build.targetVersion);
      expect(provenVersions).toHaveLength(1);
      // The durable publication commits before a transport exception is observed.
      trigger.mockRejectedValue(new Error("private post-commit transport detail"));
      await publish("Committed despite provider failure");
      for (let attempt = 0; attempt < 9; attempt++) await f.dispatch();
      const publicHome = await f.call("/api/v1/public/pages/home");
      expect(publicHome.status).toBe(200);
      expect(JSON.stringify(await publicHome.json())).toContain(
        "Committed despite provider failure",
      );
      expect((await repo.listSiteBuilds(50)).some((build) => build.status === "failed")).toBe(true);
      let now = Date.now() + 10000;
      for (const status of ["accepted", "cancelled", "unknown"]) {
        await repo.requestBuild({ requestedAt: now, requestedBy: actor });
        now += 5000;
        const [lease] = await repo.claimSiteBuilds({ limit: 1, now });
        expect(lease).toBeDefined();
        if (status === "accepted")
          await repo.recordSiteBuildAccepted({ leaseId: lease.id, now: ++now });
        else {
          await repo.recordSiteBuildTracking({
            leaseId: lease.id,
            now: ++now,
            providerBuildId: `deployment-${status}`,
          });
          await repo.completeTrackedSiteBuild({
            buildId: lease.buildId,
            providerBuildId: `deployment-${status}`,
            now: ++now,
            outcome: status,
            reason: status === "unknown" ? "provider_timeout" : "provider_cancelled",
          });
        }
        expect((await repo.getSiteBuild(lease.buildId)).status).toBe(status);
        now += 10000;
      }
      const response = await f.call("/api/v1/admin/site-builds", { cookie: f.cookies.admin });
      expect(response.status).toBe(200);
      const history = (await response.json()).items;
      expect(new Set(history.map((build) => build.status))).toEqual(
        new Set(["succeeded", "failed", "accepted", "cancelled", "unknown"]),
      );
      // Acceptance/deadline never promotes the newer published version.
      expect(
        history.filter((build) => build.status === "succeeded").map((build) => build.targetVersion),
      ).toEqual(provenVersions);
      browser = await loadBrowser(resolve("."));
      const page = await browser.newPage({ baseURL: f.origin });
      page.setDefaultTimeout(15000);
      await page.goto("/admin/");
      await page.getByRole("textbox", { name: "Email", exact: true }).fill("admin@34a.test");
      await page.getByLabel("Password", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await browserExpect(
        page.getByRole("heading", { name: "Content", exact: true }),
      ).toBeVisible();
      await page.goto("/admin/builds");
      const table = page.getByRole("table", { name: "Build history" });
      for (const status of ["Succeeded", "Failed", "Accepted", "Cancelled", "Unknown"]) {
        const row = table
          .getByRole("row")
          .filter({ has: page.getByText(status, { exact: true }) })
          .first();
        await browserExpect(row).toBeVisible();
        await row.getByRole("button", { name: /View build/ }).click();
        const detail = page.getByRole("region", { name: "Build details" });
        await browserExpect(detail.getByText(status, { exact: true })).toBeVisible();
        await browserExpect(
          detail.getByRole("button", { name: "Retry build", exact: true }),
        ).toHaveCount(status === "Succeeded" ? 0 : 1);
      }
      const retry = page.waitForResponse(
        (r) =>
          /\/api\/v1\/admin\/builds\/[^/]+\/retry$/u.test(r.url()) &&
          r.request().method() === "POST",
      );
      await page.getByRole("button", { name: "Retry build", exact: true }).click();
      expect((await retry).status()).toBe(202);
      await browserExpect(page.getByRole("status").filter({ hasText: "queued" })).toBeVisible();
    } finally {
      vi.restoreAllMocks();
      if (browser) await browser.close();
      await f.close();
    }
  }, 120000);
}
