import { afterEach, expect, test, vi } from "vitest";
import { createCloudflareWorker } from "./index.js";
import { countingD1 } from "./test-support/d1-test-harness.js";
import { createWorkerFixture } from "./test-support/worker-harness.js";

const cleanups: Array<() => unknown> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  vi.unstubAllGlobals();
});

test.each([false, true])(
  "a mixed scheduled run stays within D1 budgets (invalid media: %s)",
  async (hasInvalidMedia) => {
    vi.stubGlobal("fetch", async (target: RequestInfo | URL) => {
      const url = String(target);
      if (url.includes("deploy_hooks"))
        return Response.json({ success: true, result: { id: "new-provider" } });
      const id = url.split("/").at(-1);
      return Response.json({
        success: true,
        result: { id, is_skipped: false, latest_stage: { name: "deploy", status: "success" } },
      });
    });
    const fixture = await createWorkerFixture(createCloudflareWorker, cleanups, {
      buildTrigger: undefined,
      env: {
        LACE_DEPLOY_HOOK_URL:
          "https://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/hook",
        LACE_PAGES_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
        LACE_PAGES_API_TOKEN: "pages-token",
        LACE_PAGES_PROJECT_NAME: "my-site",
      },
    });
    const db = fixture.local.database;
    await db.prepare("delete from outbox_events").run();
    const now = fixture.now();
    for (let i = 0; i < 5; i += 1) {
      const id = `tracked-${i}`;
      await db
        .prepare(
          "insert into outbox_events (id,type,payload_json,attempts,available_at,processed_at,created_at) values (?, 'site.build.requested', '{}', 0, ?, ?, ?)",
        )
        .bind(id, now - 20_000, now - 19_000, now - 20_000)
        .run();
      await db
        .prepare(
          "insert into site_builds (id,reason,status,target_version,provider_build_id,requested_by,requested_at,started_at,provider_check_after) values (?, 'manual','running',0,?,'admin',?,?,?)",
        )
        .bind(id, `provider-${i}`, now - 20_000, now - 19_000, now - 1)
        .run();
      const media = `budget-media-${i}`;
      await db
        .prepare(
          "insert into media (id,storage_key,filename,mime_type,size,width,height,metadata_json,status,created_by,created_at,updated_at) values (?,?,'x.png','image/png',1,1,1,'{}','deleting','admin',1,1)",
        )
        .bind(media, `media/${media}`)
        .run();
      await db
        .prepare(
          "insert into outbox_events (id,type,payload_json,attempts,available_at,created_at) values (?, 'media.delete.requested', ?, 0, ?, ?)",
        )
        .bind(
          `delete-${i}`,
          JSON.stringify(
            i === 0 && hasInvalidMedia ? { mediaId: media, requestedBy: 3 } : { mediaId: media },
          ),
          now - 1,
          now - 1,
        )
        .run();
    }
    await db
      .prepare(
        "insert into outbox_events (id,type,payload_json,attempts,available_at,created_at) values ('pending-build','site.build.requested',?,0,?,?)",
      )
      .bind(
        JSON.stringify({
          publishedSnapshotId: null,
          reason: "manual",
          requestedAt: now - 10_000,
          requestedBy: "admin",
          targetVersion: 0,
        }),
        now - 1,
        now - 10_000,
      )
      .run();
    if (hasInvalidMedia)
      await fixture.local.bucket.put("media/budget-media-0", new Uint8Array([1]));
    await db
      .prepare(
        "insert into outbox_events (id,type,payload_json,attempts,available_at,created_at) values ('custom','custom.event','{}',0,1,1)",
      )
      .run();
    const counted = countingD1(db);
    await fixture.worker.scheduled({}, { ...fixture.env, DB: counted.binding }, fixture.ctx);
    expect(counted.stats.queries).toBeLessThanOrEqual(50);
    expect(counted.stats.maxParameters).toBeLessThanOrEqual(100);
    expect(counted.stats.maxBatchStatements).toBeLessThanOrEqual(40);
    expect(
      await db.prepare("select count(*) as n from media where id like 'budget-media-%'").first(),
    ).toEqual({ n: hasInvalidMedia ? 1 : 0 });
    if (hasInvalidMedia) {
      expect(
        await db.prepare("select status from media where id = 'budget-media-0'").first(),
      ).toEqual({
        status: "deleting",
      });
      expect(await fixture.local.bucket.head("media/budget-media-0")).not.toBeNull();
      expect(
        await db
          .prepare(
            "select attempts, last_error, processed_at is not null as done from outbox_events where id = 'delete-0'",
          )
          .first(),
      ).toEqual({
        attempts: 1,
        last_error: "invalid_media_deletion_event",
        done: 1,
      });
    }
    expect(
      await db
        .prepare("select locked_at, processed_at from outbox_events where id = 'custom'")
        .first(),
    ).toEqual({
      locked_at: null,
      processed_at: null,
    });
    expect(
      await db
        .prepare(
          "select count(*) as n from site_builds where id like 'tracked-%' and status = 'succeeded'",
        )
        .first(),
    ).toEqual({ n: 5 });
    expect(
      await db.prepare("select status from site_builds where id = 'pending-build'").first(),
    ).toEqual({ status: "running" });
    expect(
      await db
        .prepare("select provider_build_id from site_builds where id = 'pending-build'")
        .first(),
    ).toEqual({ provider_build_id: "new-provider" });
    expect(
      await db
        .prepare(
          "select processed_at is not null as done from outbox_events where id = 'pending-build'",
        )
        .first(),
    ).toEqual({ done: 1 });
  },
);
