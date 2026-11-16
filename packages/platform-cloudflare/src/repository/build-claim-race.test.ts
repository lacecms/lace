import { expect, test } from "vitest";
import { actorId, unixMilliseconds } from "@lacecms/domain";
import type { D1Database } from "../d1/database.js";
import { openLocalD1 } from "../test-support/d1-test-harness.js";
import { D1ContentRepository } from "./repository.js";

test("a coalesce before the claim batch invalidates the observed payload and deadline", async () => {
  const { database, dispose } = await openLocalD1();
  try {
    const actor = { id: actorId("admin"), role: "admin" as const };
    const repository = new D1ContentRepository(database, () => undefined);
    const first = await repository.requestBuild({
      requestedAt: unixMilliseconds(1),
      requestedBy: actor,
    });
    let racing = false;
    const wrapped: D1Database = {
      prepare(sql) {
        if (sql.startsWith("update outbox_events set locked_at = ?")) racing = true;
        return database.prepare(sql);
      },
      async batch(statements) {
        if (racing) {
          racing = false;
          await repository.requestBuild({
            requestedAt: unixMilliseconds(5_002),
            requestedBy: actor,
          });
        }
        return database.batch(statements);
      },
    };
    const claimant = new D1ContentRepository(wrapped, () => undefined);
    expect(await claimant.claimSiteBuilds({ limit: 1, now: unixMilliseconds(5_001) })).toEqual([]);
    const event = await database
      .prepare("select id, payload_json, available_at, locked_at from outbox_events")
      .first<{
        id: string;
        payload_json: string;
        available_at: number;
        locked_at: number | null;
      }>();
    expect(event).toMatchObject({ id: first.eventId, available_at: 10_002, locked_at: null });
    expect(JSON.parse(event!.payload_json).requestedAt).toBe(5_002);
    expect(await database.prepare("select count(*) as count from site_builds").first()).toEqual({
      count: 0,
    });
  } finally {
    await dispose();
  }
}, 60_000);
