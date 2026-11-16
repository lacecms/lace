import type {
  SiteBuildRequest,
  DispatcherLeasePort,
  MediaDeletionDispatchPort,
  ObjectStorage,
} from "@lacecms/application";
import type { JsonObject } from "@lacecms/content";
import { expect, test } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  migrateNodeDatabase,
  NodeMediaDeletionDispatcher,
  NodeSiteBuildDispatcher,
  NodeContentRepository,
  openNodeDatabase,
} from "./index.js";

import { actorId, mediaId, unixMilliseconds } from "@lacecms/domain";
import { dispatcherEventId, dispatcherLeaseId } from "@lacecms/application";

test("site-build dispatcher bounds failures at eight attempts and handles trigger outcomes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lace-build-dispatch-"));
  const databasePath = join(directory, "lace.sqlite");
  try {
    migrateNodeDatabase(databasePath);
    const database = openNodeDatabase(databasePath);
    try {
      const repository = new NodeContentRepository(database.connection, () => undefined);
      const requestedBy = { id: actorId("admin"), role: "admin" as const };
      let now = 1;
      let outcome = "failed";
      const calls: SiteBuildRequest[] = [];
      const dispatcher = new NodeSiteBuildDispatcher({
        clock: { now: () => unixMilliseconds(now) },
        logger: { error: () => undefined },
        random: () => 0,
        trigger: {
          trigger: async (input) => {
            calls.push(input);
            expect(
              database.connection
                .prepare("select status from site_builds where id = ?")
                .get(input.buildId),
            ).toEqual({ status: "running" });
            return outcome === "accepted"
              ? { status: "accepted", providerBuildId: "provider-1" }
              : outcome === "succeeded"
                ? { status: "succeeded" }
                : { status: "failed", reason: "secret=hidden" };
          },
        },
        work: repository,
      });
      const failed = await repository.requestBuild({
        requestedAt: unixMilliseconds(now),
        requestedBy,
      });
      now = 5_001;
      for (let attempt = 1; attempt <= 8; attempt += 1) {
        await dispatcher.runOnce();
        expect(
          database.connection
            .prepare("select attempts from outbox_events where id = ?")
            .get(failed.eventId),
        ).toEqual({ attempts: attempt });
      }
      expect(calls).toHaveLength(8);
      expect(
        database.connection
          .prepare("select status, error from site_builds where id = ?")
          .get(failed.eventId),
      ).toEqual({ status: "failed", error: "provider_failed" });
      await dispatcher.runOnce();
      expect(calls).toHaveLength(8);

      now = 10_000;
      outcome = "succeeded";
      const success = await repository.requestBuild({
        requestedAt: unixMilliseconds(now),
        requestedBy,
      });
      now += 5_000;
      await dispatcher.runOnce();
      expect(
        database.connection
          .prepare("select status, completed_at from site_builds where id = ?")
          .get(success.eventId),
      ).toEqual({ status: "succeeded", completed_at: now });

      now = 20_000;
      outcome = "accepted";
      const accepted = await repository.requestBuild({
        requestedAt: unixMilliseconds(now),
        requestedBy,
      });
      now += 5_000;
      await dispatcher.runOnce();
      expect(
        database.connection
          .prepare("select status, provider_build_id from site_builds where id = ?")
          .get(accepted.eventId),
      ).toEqual({ status: "accepted", provider_build_id: "provider-1" });

      now = 30_000;
      const thrown = await repository.requestBuild({
        requestedAt: unixMilliseconds(now),
        requestedBy,
      });
      const throwingDispatcher = new NodeSiteBuildDispatcher({
        clock: { now: () => unixMilliseconds(now) },
        logger: { error: () => undefined },
        random: () => 0,
        trigger: {
          trigger: async () => {
            throw new Error("secret build URL");
          },
        },
        work: repository,
      });
      now += 5_000;
      await throwingDispatcher.runOnce();
      expect(
        database.connection
          .prepare("select last_error from outbox_events where id = ?")
          .get(thrown.eventId),
      ).toEqual({ last_error: "trigger_unavailable" });

      database.connection
        .prepare("update outbox_events set processed_at = ? where id = ?")
        .run(now, thrown.eventId);
      database.connection
        .prepare(
          "insert into outbox_events (id, type, payload_json, available_at, created_at) values ('bad-build', 'site.build.requested', '{}', ?, ?)",
        )
        .run(now, now);
      await throwingDispatcher.runOnce();
      expect(
        database.connection
          .prepare("select last_error, processed_at from outbox_events where id = 'bad-build'")
          .get(),
      ).toEqual({ last_error: "invalid_build_event", processed_at: now });
    } finally {
      database.connection.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("dispatches media deletion with retry, terminal, and malformed-event boundaries", async () => {
  const completed: unknown[] = [];
  const failed: unknown[] = [];
  const deleted: string[] = [];
  let now = unixMilliseconds(1_000);
  const lease = (payload: JsonObject, attempts = 0) => ({
    event: {
      attempts,
      availableAt: now,
      id: dispatcherEventId(`event-${attempts}`),
      payload,
      type: "media.delete.requested",
    },
    expiresAt: unixMilliseconds(now + 60_000),
    id: dispatcherLeaseId(`lease-${attempts}`),
  });
  const work: DispatcherLeasePort & MediaDeletionDispatchPort = {
    claim: async () => [lease({ mediaId: "media-1" })],
    complete: async (input) => {
      completed.push(input);
    },
    completeMediaDeletion: async (input) => {
      completed.push(input);
    },
    failMediaDeletion: async (input) => {
      failed.push(input);
    },
    loadDeletingMedia: async () => ({
      createdAt: now,
      createdBy: actorId("admin"),
      filename: "image.png",
      id: mediaId("media-1"),
      mimeType: "image/png",
      size: 1,
      status: "deleting",
      storageKey: "media/media-1",
      tags: [],
      updatedAt: now,
    }),
    retry: async () => {},
  };
  const storage: ObjectStorage = {
    createReadUrl: async () => "memory://object",
    delete: async (key) => {
      deleted.push(key);
    },
    get: async () => null,
    put: async () => ({ contentType: "image/png", key: "unused", size: 0 }),
  };
  const dispatcher = new NodeMediaDeletionDispatcher({
    clock: { now: () => now },
    logger: { error: () => {} },
    random: () => 0.5,
    storage,
    work,
  });
  await dispatcher.runOnce();
  expect(deleted).toEqual(["media/media-1"]);
  expect(completed).toHaveLength(1);

  work.claim = async () => [lease({ mediaId: "media-1" }, 7)];
  storage.delete = async () => {
    throw new Error("private storage detail");
  };
  await dispatcher.runOnce();
  expect(failed).toMatchObject([{ sanitizedError: "storage_unavailable", terminal: true }]);

  work.claim = async () => [lease({}, 0)];
  await dispatcher.runOnce();
  expect(completed).toHaveLength(2);
});
