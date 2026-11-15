import { contentModelRoute } from "@lacecms/application";
import type { NormalizedContentModel } from "@lacecms/config";
import { NodeContentRepository } from "@lacecms/db/node";
import type { ContentModelResolver, NodeRepositoryOptions } from "@lacecms/db/node";
import type { MediaMetadata, Role } from "@lacecms/domain";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { fileURLToPath } from "node:url";

const migrationsFolder = fileURLToPath(new URL("../../../db/drizzle/", import.meta.url));

export interface SqliteFixture {
  readonly connection: Database.Database;
  readonly repository: NodeContentRepository;
  close(): void;
}

/** Each call owns one migrated native connection. The caller closes it after the test. */
export function openSqliteFixture(
  resolveModel: ContentModelResolver,
  options?: NodeRepositoryOptions,
): SqliteFixture {
  const connection = new Database(":memory:");
  try {
    // As in the Node migrator, permit table rebuilds on this connection and
    // verify integrity before enforcing foreign keys for repository writes.
    connection.pragma("foreign_keys = OFF");
    migrate(drizzle(connection), { migrationsFolder });
    const violations = connection.pragma("foreign_key_check") as readonly unknown[];
    if (violations.length > 0)
      throw new Error("SQLite fixture migrations left foreign-key violations.");
    connection.pragma("foreign_keys = ON");
    return {
      connection,
      repository: new NodeContentRepository(connection, resolveModel, options),
      close: () => {
        connection.close();
      },
    };
  } catch (error) {
    connection.close();
    throw error;
  }
}

/** Seed model rows for tests that create their own entries through the application. */
export function openConfiguredSqliteFixture(
  models: readonly NormalizedContentModel[],
  options?: NodeRepositoryOptions,
): SqliteFixture {
  const routes = new Map(models.map((model) => [String(model.key), contentModelRoute(model)]));
  const fixture = openSqliteFixture((key) => routes.get(key), options);
  try {
    const insert = fixture.connection.prepare(`insert into content_models
      (key, kind, label, config_version, structure_hash, projection_hash, public_projection_hash,
       public_projection_source_hash, structure_json, structure_json_hash, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1)`);
    fixture.connection.transaction(() => {
      for (const model of models) {
        insert.run(
          model.key,
          model.kind,
          model.label ?? model.key,
          model.version,
          model.structureHash,
          model.projectionHash,
          model.publicProjectionHash,
          model.projectionHash,
          model.structure === undefined ? null : JSON.stringify(model.structure),
          model.structure === undefined ? null : model.structureHash,
        );
      }
    })();
    return fixture;
  } catch (error) {
    fixture.close();
    throw error;
  }
}

export function seedSqliteActorProfile(
  connection: Database.Database,
  id: string,
  displayName: string,
  role: Role,
): void {
  connection
    .prepare(`insert into content_actor_profiles (actor_id, display_name, role) values (?, ?, ?)
    on conflict (actor_id) do update set display_name = excluded.display_name, role = excluded.role`)
    .run(id, displayName, role);
}

/** Seed metadata states that a media lifecycle test needs as its starting point. */
export function seedSqliteMedia(connection: Database.Database, media: MediaMetadata): void {
  connection.transaction(() => {
    connection
      .prepare(`insert into media
      (id, storage_key, filename, mime_type, size, width, height, metadata_json, status, created_by,
       created_at, updated_at, alt, caption, focal_x, focal_y, sha256)
      values (?, ?, ?, ?, ?, ?, ?, '{}', ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        media.id,
        media.storageKey,
        media.filename,
        media.mimeType,
        media.size,
        media.width ?? null,
        media.height ?? null,
        media.status,
        media.createdBy,
        media.createdAt,
        media.updatedAt,
        media.alt ?? null,
        media.caption ?? null,
        media.focalPoint?.x ?? null,
        media.focalPoint?.y ?? null,
        media.sha256 ?? null,
      );
    const insertTag = connection.prepare("insert into media_tags (media_id, tag) values (?, ?)");
    for (const tag of media.tags) insertTag.run(media.id, tag);
  })();
}
