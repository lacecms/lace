import { DatabaseSync } from "node:sqlite";
import { expect, test } from "vitest";
import { opaqueCursor } from "@lacecms/application";
import { SqlOAuthIssuancePersistence } from "./oauth.js";

test("connection keysets are bound to the owner and include expired and revoked grants", async () => {
  const database = new DatabaseSync(":memory:");
  try {
    database.exec(`
      create table oauth_clients (client_id text primary key, name text);
      create table oauth_grants (
        id text primary key, user_id text, client_id text, resource text, scopes_json text,
        generation integer, user_generation integer, created_at integer, expires_at integer,
        revoked_at integer, last_used_at integer
      );
      create index oauth_grants_user_created_idx on oauth_grants (user_id, created_at, id);
      insert into oauth_clients values ('client','Assistant');
      insert into oauth_grants values
        ('a-2','owner-a','client','/mcp','[]',1,0,1,3,2,null),
        ('b-1','owner-b','client','/mcp','[]',0,0,1,3,null,null),
        ('a-0','owner-a','client','/mcp','[]',0,0,0,1,null,null),
        ('a-1','owner-a','client','/mcp','[]',0,0,1,3,null,null);
    `);
    const storage = new SqlOAuthIssuancePersistence({
      rows: async (sql, values) => database.prepare(sql).all(...values),
      batch: async () => {
        throw new Error("Connection reads must not write");
      },
    });
    const first = await storage.listConnections("owner-a", { limit: 1 });
    expect(first.items).toMatchObject([{ id: "a-0", expiresAt: 1 }]);
    expect(first.nextCursor).toBeDefined();
    const after = first.nextCursor!;
    expect(after).not.toBe("a-0");
    const last = await storage.listConnections("owner-a", { limit: 2, after });
    expect(last.items).toMatchObject([{ id: "a-1" }, { id: "a-2", revokedAt: 2 }]);
    expect(last).not.toHaveProperty("nextCursor");
    for (const [userId, cursor] of [
      ["owner-b", after],
      ["owner-a", opaqueCursor("a-0")],
    ] as const) {
      await expect(
        storage.listConnections(userId, { limit: 2, after: cursor }),
      ).rejects.toMatchObject({
        code: "VALIDATION_FAILED",
        issues: [expect.objectContaining({ path: ["after"] })],
      });
    }
    expect((await storage.listConnections("owner-b", { limit: 100 })).items).toMatchObject([
      { id: "b-1", userId: "owner-b" },
    ]);
  } finally {
    database.close();
  }
});
