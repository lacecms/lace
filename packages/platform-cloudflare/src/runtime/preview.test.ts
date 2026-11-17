import { afterEach, expect, test, vi } from "vitest";
import { createHash } from "node:crypto";
import { assertPreviewHandoff, draftPreviewOrigin, seedReadyPreview } from "@lacecms/test-utils";
import {
  assertPreviewPackage,
  assertPreviewResourceGuards,
  claimPreviewFixture,
  openPreviewSession,
} from "@lacecms/test-utils";
import { unixMilliseconds } from "@lacecms/domain";
import { createWorkerFixture, origin } from "../test-support/worker-harness.js";
import { createCloudflareWorker, PREVIEW_MAINTENANCE_CRON } from "./worker.js";
import { CloudflarePreviewBlobStorage } from "../media/preview-r2.js";
import { countingD1 } from "../test-support/d1-test-harness.js";
import { assertPreviewCleanup } from "@lacecms/test-utils";

const cleanups: Array<() => unknown> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

test("Worker maintenance retries private namespace deletion and stays within D1 budgets", async () => {
  const fixture = await createWorkerFixture(createCloudflareWorker, cleanups, {
    previewOrigin: new URL(draftPreviewOrigin),
  });
  await fixture.signIn();
  const { database, bucket } = fixture.local;
  const run = (sql: string, values: readonly unknown[]) =>
    database
      .prepare(sql)
      .bind(...values)
      .run();
  const claim = await claimPreviewFixture(fixture.runtime.repository.preview, run, fixture.now());
  const { binding, stats } = countingD1(database);
  const env = { ...fixture.env, DB: binding };
  const deletes = vi.spyOn(CloudflarePreviewBlobStorage.prototype, "delete");
  cleanups.push(() => deletes.mockRestore());
  await assertPreviewCleanup({
    packages: fixture.runtime.previewPackages!,
    claim,
    parentCookie: fixture.cookie!,
    run,
    fetch: (request) => fixture.worker.fetch(request, fixture.env, fixture.ctx),
    count: async (sql) => (await database.prepare(sql).first<{ tally: number }>())!.tally,
    put: (key) => bucket.put(key, new Uint8Array([1])),
    head: (key) => bucket.head(key),
    sweep: async () => {
      const before = stats.queries;
      await fixture.worker.scheduled({ cron: PREVIEW_MAINTENANCE_CRON }, env, fixture.ctx);
      expect(stats.queries - before).toBeLessThanOrEqual(50);
      expect(stats.maxParameters).toBeLessThanOrEqual(100);
    },
    failNextDeletion: () => {
      deletes.mockRejectedValueOnce(new Error("fixture storage offline"));
    },
  });
  expect(fixture.logs).toContainEqual({ component: "preview", reason: "cleanup_failed" });
  expect(fixture.triggers).toHaveLength(0);
});

test("R2 verifies and seals a private preview package, and the Worker streams only listed files", async () => {
  const fixture = await createWorkerFixture(createCloudflareWorker, cleanups, {
    previewOrigin: new URL(draftPreviewOrigin),
  });
  await fixture.signIn();
  const fetch = (request: Request) => fixture.worker.fetch(request, fixture.env, fixture.ctx);
  const run = (sql: string, values: readonly unknown[]) =>
    fixture.local.database
      .prepare(sql)
      .bind(...values)
      .run();
  const claim = await claimPreviewFixture(fixture.runtime.repository.preview, run, fixture.now());
  const { htmlBody, css } = await assertPreviewPackage(fixture.runtime.previewPackages!, claim);
  const cookie = await openPreviewSession(fetch, fixture.cookie!, claim.id);
  const response = await fetch(
    new Request(`${draftPreviewOrigin}/p/${claim.id}/`, { headers: { cookie } }),
  );
  expect(response.status).toBe(200);
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(htmlBody);
  for (const path of [
    `/p/another/${css.path}`,
    `/p/${claim.id}/_astro%2fpage.css`,
    `/p/${claim.id}/.env`,
    `/p/${claim.id}/main.js.map`,
  ]) {
    expect(
      (await fetch(new Request(draftPreviewOrigin + path, { headers: { cookie } }))).status,
    ).toBe(404);
  }
  await assertPreviewResourceGuards({
    fetch,
    run,
    parentCookie: fixture.cookie!,
    generationId: claim.id,
    logout: async () => {
      expect(
        (await fixture.call("/api/auth/sign-out", { method: "POST", headers: { origin } })).response
          .status,
      ).toBe(200);
    },
  });
});

test("local D1 exchanges one-use preview handoffs against real Better Auth sessions", async () => {
  const fixture = await createWorkerFixture(createCloudflareWorker, cleanups, {
    previewOrigin: new URL(draftPreviewOrigin),
    env: { LACE_MCP_ENABLED: "true" },
  });
  await fixture.signIn();
  for (const id of ["one", "two"])
    await seedReadyPreview(
      (sql, values) =>
        fixture.local.database
          .prepare(sql)
          .bind(...values)
          .run(),
      id,
      fixture.now(),
    );
  const user = await fixture.local.database.prepare("select id from user").first<{ id: string }>();
  const now = unixMilliseconds(fixture.now());
  const build = await fixture.runtime.security.createBuildToken({ name: "builder", now });
  const importer = await fixture.runtime.security.createImportToken({
    name: "importer",
    now,
    createdBy: user!.id,
    expiresAt: unixMilliseconds(now + 86_400_000),
    capabilities: ["content:import"],
  });
  await assertPreviewHandoff({
    adminOrigin: origin,
    fetch: (request) => fixture.worker.fetch(request, fixture.env, fixture.ctx),
    parentCookie: fixture.cookie!,
    otherCredentials: [build.token, importer.token, "mcp-only-bearer"],
    expire: async (operation) => {
      fixture.advance(61_000);
      try {
        await operation();
      } finally {
        fixture.advance(-61_000);
      }
    },
    logout: async () => {
      const { response } = await fixture.call("/api/auth/sign-out", {
        method: "POST",
        headers: { origin },
      });
      expect(response.status).toBe(200);
    },
    session: (token, id) =>
      fixture.runtime.repository.preview.access.previewDelivery(
        createHash("sha256").update(token).digest("hex"),
        draftPreviewOrigin,
        id,
        unixMilliseconds(fixture.now()),
      ),
  });
});
