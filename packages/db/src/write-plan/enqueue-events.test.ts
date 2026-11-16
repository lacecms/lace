import Database from "better-sqlite3";
import { expect, test } from "vitest";
import { MEDIA_DELETE_REQUESTED, SITE_BUILD_REQUESTED } from "@lacecms/contracts/outbox";
import { executeWritePlanGroup } from "../node-repository/write-plan.js";
import { publicStateIncrementStatement } from "./build-enqueue.js";
import { bindEventRequest, enqueueEvents } from "./enqueue-events.js";

test("bound requests validate and use the version committed by the plan", () => {
  const db = new Database(":memory:");
  const guard = { sql: "1", params: [] };
  try {
    db.exec(`create table published_state (singleton_key integer primary key, version integer, updated_at integer);
      create table outbox_events (id text primary key, type text, payload_json text, attempts integer, available_at integer, created_at integer, processed_at integer, locked_at integer);
      create unique index pending_build on outbox_events(type) where type = 'site.build.requested' and processed_at is null and locked_at is null`);
    const increment = publicStateIncrementStatement(guard, 10);
    expect(increment.outbox).toBeUndefined();
    expect(executeWritePlanGroup(db, { statements: [increment] })).toMatchObject({
      committedOutboxWork: false,
    });
    expect(db.prepare("select count(*) as count from outbox_events").get()).toEqual({ count: 0 });
    const build = bindEventRequest(
      {
        type: SITE_BUILD_REQUESTED,
        requestedAt: 10,
        payload: {
          reason: "manual",
          requestedAt: 10,
          requestedBy: "actor",
          publishedSnapshotId: null,
        },
      },
      "build",
      guard,
    );
    const media = bindEventRequest(
      {
        type: MEDIA_DELETE_REQUESTED,
        requestedAt: 11,
        payload: { mediaId: "media", requestedBy: "actor" },
      },
      "media-event",
      guard,
    );
    const receipt = executeWritePlanGroup(db, {
      statements: [increment, ...enqueueEvents([build, media])],
    });
    expect(receipt).toMatchObject({
      committedOutboxWork: true,
      changes: [1, 1, 0, 0, 1],
      slots: { queue: [{ event_id: "build", pending_id: "build", version: 2 }] },
    });
    const rows = db
      .prepare("select type, payload_json, available_at from outbox_events order by type")
      .all() as { type: string; payload_json: string; available_at: number }[];
    expect(rows).toHaveLength(2);
    expect(JSON.parse(rows[1]!.payload_json)).toMatchObject({
      targetVersion: 2,
      requestedBy: "actor",
    });
    expect(rows[0]!.available_at).toBe(11);
    expect(() =>
      enqueueEvents([
        bindEventRequest(
          {
            type: MEDIA_DELETE_REQUESTED,
            requestedAt: 12,
            payload: { mediaId: "", requestedBy: "actor" },
          },
          "invalid",
          guard,
        ),
      ]),
    ).toThrow();
    expect(db.prepare("select count(*) as count from outbox_events").get()).toEqual({ count: 2 });
  } finally {
    db.close();
  }
});
