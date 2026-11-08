// @ts-nocheck
// TODO(rf2): Type legacy SQLite rows, branded snapshot fixtures and malformed projection inputs.
import { expect, test } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { BUILD_TOKEN_KIND_SQL, importTokenUserInvalidationSql } from "./api-tokens.js";

test("import-token invalidation revokes only the selected user's import tokens", () => {
  const database = new DatabaseSync(":memory:");
  database.exec(`create table user (id text primary key);
    create table api_tokens (id text primary key, capabilities_json text not null,
      created_by text, revoked_at integer);
    insert into user values ('u1'), ('u2');
    insert into api_tokens values
      ('build', '["content:build:read"]', null, null),
      ('import', '["content:import"]', 'u1', null),
      ('publish', '["content:import","content:publish"]', 'u1', null),
      ('earlier', '["content:import"]', 'u1', 5),
      ('other', '["content:import"]', 'u2', null);`);
  database.prepare(importTokenUserInvalidationSql()).run(9, "u1");
  expect(database.prepare("select id, revoked_at from api_tokens order by id").all()).toEqual([
    { id: "build", revoked_at: null },
    { id: "earlier", revoked_at: 5 },
    { id: "import", revoked_at: 9 },
    { id: "other", revoked_at: null },
    { id: "publish", revoked_at: 9 },
  ]);
  expect(database.prepare(`select id from api_tokens where ${BUILD_TOKEN_KIND_SQL}`).all()).toEqual(
    [{ id: "build" }],
  );
});
