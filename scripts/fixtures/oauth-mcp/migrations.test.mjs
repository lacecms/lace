import { createRequire } from "node:module";
import { afterEach, expect, test } from "vitest";
import { oauthProvider } from "@better-auth/oauth-provider";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { betterAuthSchema, checkedInMigrations } from "@lacecms/db";
import {
  migrationStatements,
  openLocalCloudflare,
} from "../../../packages/platform-cloudflare/src/d1-test-harness.mjs";
const authRequire = createRequire(new URL("../../../packages/auth/package.json", import.meta.url));
const closes = [];
afterEach(async () => {
  for (const close of closes.splice(0).reverse()) await close();
});
const migration = "0012_oauth_mcp.sql";

async function open(runtime) {
  if (runtime === "D1") {
    const d1 = await openLocalCloudflare({ migrate: false });
    closes.push(d1.dispose);
    return {
      apply: (sql) => d1.database.batch(sql.map((s) => d1.database.prepare(s))),
      run: (sql, ...values) =>
        d1.database
          .prepare(sql)
          .bind(...values)
          .run(),
      rows: async (sql) => (await d1.database.prepare(sql).all()).results,
    };
  }
  const Sqlite = authRequire("better-sqlite3");
  const db = new Sqlite(":memory:");
  closes.push(() => db.close());
  return {
    apply: async (sql) => {
      db.transaction(() => {
        for (const s of sql) db.exec(s);
      })();
    },
    run: async (sql, ...values) => db.prepare(sql).run(...values),
    rows: async (sql) => db.prepare(sql).all(),
  };
}

const seed = [
  "insert into user(id,name,email,email_verified,role,disabled,created_at,updated_at) values ('u','Existing','existing@lace.test',1,'admin',0,1,1)",
  "insert into account(id,account_id,provider_id,user_id,password,created_at,updated_at) values ('a','u','credential','u','existing-password-verifier',1,1)",
  "insert into session(id,token,user_id,expires_at,created_at,updated_at) values ('s','existing-session-verifier','u',9999999999999,1,1)",
  "insert into api_tokens(id,name,token_prefix,token_hash,capabilities_json,created_at) values ('b','Existing build','prefix','existing-build-verifier','[\"content:build:read\"]',1)",
  "insert into content_models(key,kind,label,config_version,structure_hash,projection_hash,created_at,updated_at) values ('posts','collection','Posts',1,'structure','projection',1,1)",
  "insert into content_entries(id,model_key,created_by,created_at,updated_at) values ('e','posts','u',1,1)",
  "insert into content_snapshots(id,entry_id,revision,title,fields_json,schema_version,created_at,updated_at,updated_by) values ('snap','e',1,'Existing draft','{}',1,1,1,'u')",
  "update content_entries set draft_snapshot_id='snap' where id='e'",
];
for (const runtime of ["SQLite", "D1"]) {
  test(`${runtime}: fresh OAuth migration includes all provider and lifecycle tables`, async () => {
    const db = await open(runtime);
    await db.apply(await migrationStatements());
    const tables = (
      await db.rows(
        "select name from sqlite_master where type='table' and name like 'oauth_%' order by name",
      )
    ).map((r) => r.name);
    expect(tables).toEqual([
      "oauth_access_tokens",
      "oauth_client_assertions",
      "oauth_client_resources",
      "oauth_clients",
      "oauth_consents",
      "oauth_grants",
      "oauth_issuances",
      "oauth_refresh_tokens",
      "oauth_resources",
      "oauth_token_bindings",
      "oauth_user_authority",
    ]);
    expect(await db.rows("pragma foreign_key_check")).toEqual([]);
    const indexes = (
      await db.rows(
        "select name from sqlite_master where type='index' and name like 'oauth_%' order by name",
      )
    ).map((r) => r.name);
    for (const required of [
      "oauth_issuances_input_idx",
      "oauth_issuances_pending_idx",
      "oauth_token_bindings_hash_idx",
      "oauth_grants_user_created_idx",
      "oauth_grants_expiry_idx",
      "oauth_refresh_tokens_expiry_idx",
      "oauth_access_tokens_expiry_idx",
      "oauth_client_assertions_expiry_idx",
    ])
      expect(indexes).toContain(required);
  }, 30000);

  test(`${runtime}: additive OAuth migration preserves populated accounts, sessions, content and build credentials`, async () => {
    const db = await open(runtime);
    await db.apply(await migrationStatements((file) => file < migration));
    await db.apply(seed);
    const existing = [
      "user",
      "account",
      "session",
      "api_tokens",
      "content_models",
      "content_entries",
      "content_snapshots",
      "published_state",
      "outbox_events",
    ];
    const before = await Promise.all(existing.map((name) => db.rows(`select * from ${name}`)));
    await db.apply(await migrationStatements((file) => file === migration));
    expect(await Promise.all(existing.map((name) => db.rows(`select * from ${name}`)))).toEqual(
      before,
    );
    expect(await db.rows("pragma foreign_key_check")).toEqual([]);
    await db.run(
      "insert into oauth_clients (id,client_id,redirect_uris) values ('c','client','[\"http://127.0.0.1/callback\"]')",
    );
    await db.run(
      "insert into oauth_user_authority (user_id,generation,updated_at) values ('u',3,1)",
    );
    await db.run(
      "insert into oauth_grants (id,user_id,client_id,resource,scopes_json,user_generation,created_at,expires_at) values ('g','u','client','https://cms.lace.test/mcp','[\"content:read\"]',3,1,10)",
    );
    const insert =
      "insert into oauth_issuances(id,grant_id,kind,input_hash,family_generation,user_generation,state,created_at,pending_expires_at,retain_until) values (?, 'g','refresh','consumed-input',0,3,'pending',1,2,10)";
    await db.run(insert, "i");
    await expect(db.run(insert, "duplicate")).rejects.toThrow(/unique/iu);
    await expect(
      db.run("update oauth_issuances set state='committed' where id='i'"),
    ).rejects.toThrow(/check/iu);
    await db.run("update oauth_issuances set state='committed', committed_at=2 where id='i'");
    await db.run(
      "insert into oauth_token_bindings(kind,provider_id,token_hash,grant_id,issuance_id,family_generation,user_generation,expires_at) values ('refresh','provider-row','hashed-only','g','i',0,3,10)",
    );
    await db.run("update oauth_grants set revoked_at=3,generation=generation+1 where id='g'");
    // Lifecycle rows remain durable across fresh persistence queries; no isolate
    // state or signing key generation participates in their authority.
    expect(await db.rows("select generation,revoked_at from oauth_grants where id='g'")).toEqual([
      { generation: 1, revoked_at: 3 },
    ]);
    expect(await db.rows("select input_hash from oauth_issuances where id='i'")).toEqual([
      { input_hash: "consumed-input" },
    ]);
    expect(await db.rows("pragma foreign_key_check")).toEqual([]);
  }, 30000);
}

test("checked-in provider schema matches pinned model/field/required/reference definitions", () => {
  const plugin = oauthProvider({
    loginPage: "/admin/sign-in",
    consentPage: "/admin/mcp/consent",
    disableJwtPlugin: true,
  });
  for (const [name, definition] of Object.entries(plugin.schema)) {
    const table = betterAuthSchema[name];
    expect(table).toBeDefined();
    const actual = getTableConfig(table);
    expect(actual.columns.map((column) => column.name).sort()).toEqual(
      [
        "id",
        ...Object.keys(definition.fields)
          .filter((key) => key !== "id")
          .map((key) => key.replace(/[A-Z]/gu, (c) => `_${c.toLowerCase()}`)),
      ].sort(),
    );
    for (const [key, field] of Object.entries(definition.fields)) {
      expect(table[key]).toBeDefined();
      if (field.required) expect(table[key].notNull).toBe(true);
      if (field.unique) expect(table[key].isUnique || table[key].primary).toBe(true);
      if (field.references)
        expect(actual.foreignKeys.some((fk) => fk.reference().columns.includes(table[key]))).toBe(
          true,
        );
    }
  }
  expect(checkedInMigrations.some((entry) => entry.name === migration)).toBe(true);
});
