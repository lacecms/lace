import { contentModelRoute } from "@lacecms/application";
import type { NormalizedContentModel } from "@lacecms/config";
import type { ContentModelRoute } from "@lacecms/domain";
import type { Database } from "better-sqlite3";
import { onTestFinished } from "vitest";
import { DeterministicIdGenerator } from "../adapters/fakes.js";
import { openConfiguredSqliteFixture, openSqliteFixture } from "./sqlite.js";
import type { SqliteFixture } from "./sqlite.js";

interface ApplicationFixture extends Pick<SqliteFixture, "connection"> {
  readonly store: SqliteFixture["repository"];
}

function useFixture(fixture: SqliteFixture): ApplicationFixture {
  onTestFinished(() => {
    fixture.close();
  });
  const statement = fixture.connection.prepare(
    "insert into content_actor_profiles values (?, '', ?)",
  );
  for (const role of ["admin", "editor", "viewer"]) statement.run(role, role);
  return { connection: fixture.connection, store: fixture.repository };
}

/** With empty model rows, tests exercise configuration synchronization from scratch. */
export function applicationSqlite(
  models: readonly NormalizedContentModel[],
  seedModels = true,
): ApplicationFixture {
  const ids = new DeterministicIdGenerator("outbox");
  const options = { nextId: () => ids.next() };
  if (seedModels) return useFixture(openConfiguredSqliteFixture(models, options));
  const routes = new Map(models.map((model) => [String(model.key), contentModelRoute(model)]));
  return useFixture(openSqliteFixture((key) => routes.get(key), options));
}

/** Low-level application tests can seed just the persisted model and route. */
export function repositorySqlite(...routes: readonly ContentModelRoute[]): ApplicationFixture {
  const models = new Map(routes.map((route) => [String(route.key), route]));
  const fixture = useFixture(openSqliteFixture((key) => models.get(key)));
  const insert = fixture.connection.prepare(`insert into content_models
    (key, kind, label, config_version, structure_hash, projection_hash, created_at, updated_at)
    values (?, ?, ?, 1, 'structure', 'projection', 1, 1)`);
  for (const route of routes) insert.run(route.key, route.kind, route.key);
  return fixture;
}

export function persistedMediaReferences(connection: Database, snapshotId: string) {
  return connection
    .prepare(`select field_path as fieldPath, media_id as mediaId, source_key as sourceKey
    from content_media_references where snapshot_id = ? order by rowid`)
    .all(snapshotId);
}

export function pendingBuildVersions(connection: Database, reason: string) {
  return connection
    .prepare(`select json_extract(payload_json, '$.targetVersion') from outbox_events
    where type = 'site.build.requested' and processed_at is null and json_extract(payload_json, '$.reason') = ?`)
    .pluck()
    .all(reason);
}

export function requestedMediaDeletions(connection: Database) {
  return connection
    .prepare(`select json_extract(payload_json, '$.mediaId') from outbox_events
    where type = 'media.delete.requested' order by rowid`)
    .pluck()
    .all();
}
