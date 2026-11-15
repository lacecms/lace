import { checkedInMigrations } from "@lacecms/db";
import { NodeContentRepository } from "@lacecms/db/node";
import { expect, test } from "vitest";
import { openSqliteFixture } from "./sqlite.js";

test("SQLite fixtures migrate isolated databases and close their connections", async () => {
  const resolveModel = () => undefined;
  const first = openSqliteFixture(resolveModel);
  const second = openSqliteFixture(resolveModel);
  try {
    expect(
      first.connection
        .prepare("select created_at from __drizzle_migrations order by id")
        .pluck()
        .all(),
    ).toEqual(checkedInMigrations.map(({ createdAt }) => createdAt));
    expect(first.connection.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(first.connection.pragma("foreign_key_check")).toEqual([]);
    expect(() =>
      first.connection
        .prepare("insert into published_routes values ('/', 'missing', 'missing', 1)")
        .run(),
    ).toThrow(/foreign key/iu);
    first.connection
      .prepare("insert into published_state (singleton_key, version, updated_at) values (1, 4, 1)")
      .run();
    const reopened = new NodeContentRepository(first.connection, resolveModel);
    await expect(first.repository.publishedContentVersion()).resolves.toBe(4);
    await expect(reopened.publishedContentVersion()).resolves.toBe(4);
    await expect(second.repository.publishedContentVersion()).resolves.toBe(0);
  } finally {
    first.close();
    second.close();
  }
  expect(first.connection.open).toBe(false);
  expect(second.connection.open).toBe(false);
});
