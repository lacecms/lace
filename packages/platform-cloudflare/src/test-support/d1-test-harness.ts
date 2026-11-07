// Plain Node scripts load this module through type stripping: erasable
// syntax only, and sibling modules are imported for types only.
import { readdir, readFile } from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import type { KVNamespace } from "../cache.js";
import type { D1Database, D1PreparedStatement } from "../d1.js";
import type { R2Bucket } from "../r2-storage.js";

const migrationsDirectory = new URL("../../../db/drizzle/", import.meta.url);

/** Checked-in forward migrations split into D1-executable statements. */
export async function migrationStatements(
  include: (file: string) => boolean = () => true,
): Promise<string[]> {
  const files = (await readdir(migrationsDirectory))
    .filter((file) => file.endsWith(".sql") && include(file))
    .sort();
  const statements: string[] = [];
  for (const file of files) {
    const sql = await readFile(new URL(file, migrationsDirectory), "utf8");
    statements.push(
      ...sql
        .split("--> statement-breakpoint")
        .map((statement) => statement.trim())
        .filter(Boolean),
    );
  }
  return statements;
}

export interface LocalCloudflare {
  readonly bucket: R2Bucket;
  readonly database: D1Database;
  readonly dispose: () => Promise<void>;
  readonly kv: KVNamespace;
}

/** Starts isolated in-memory local D1 (migrated), R2, and KV bindings. */
export async function openLocalCloudflare(
  options: { readonly migrate?: boolean; readonly persistTo?: string } = {},
): Promise<LocalCloudflare> {
  const miniflare = new Miniflare(
    convertV4MiniflareOptions({
      compatibilityDate: "2026-09-01",
      d1Databases: ["DB"],
      ...(options.persistTo ? { resourcePersistencePath: options.persistTo } : {}),
      kvNamespaces: ["CACHE"],
      modules: true,
      r2Buckets: ["MEDIA"],
      script: "export default { fetch() { return new Response(null, { status: 404 }); } };",
    }),
  );
  const database: D1Database = await miniflare.getD1Database("DB");
  if (options.migrate !== false) {
    const statements = await migrationStatements();
    await database.batch(statements.map((statement) => database.prepare(statement)));
    await database
      .prepare("create table d1_migrations (id integer primary key, name text not null)")
      .run();
    const files = (await readdir(migrationsDirectory))
      .filter((file) => file.endsWith(".sql"))
      .sort();
    for (const [index, name] of files.entries())
      await database
        .prepare("insert into d1_migrations (id, name) values (?, ?)")
        .bind(index + 1, name)
        .run();
  }
  // Miniflare's declared binding types do not name the Workers interfaces
  // Lace's adapters accept; the bindings implement them at runtime.
  const bucket = (await miniflare.getR2Bucket("MEDIA")) as unknown as R2Bucket;
  const kv = (await miniflare.getKVNamespace("CACHE")) as unknown as KVNamespace;
  return { bucket, database, dispose: () => miniflare.dispose(), kv };
}

/** Starts an isolated in-memory local D1 database with every migration applied. */
export async function openLocalD1(): Promise<Pick<LocalCloudflare, "database" | "dispose">> {
  const { database, dispose } = await openLocalCloudflare();
  return { database, dispose };
}

export interface D1Counts {
  batches: number;
  maxParameters: number;
  maxBatchStatements: number;
  queries: number;
  rowsRead: number;
  rowsWritten: number;
}

/** Binding methods third-party adapters (better-auth) call beyond Lace's port. */
interface RawStatement {
  raw(...args: unknown[]): Promise<unknown>;
}

interface CountedStatement extends D1PreparedStatement, RawStatement {
  first<Row = Record<string, unknown>>(column?: string): Promise<Row | null>;
  readonly inner: D1PreparedStatement;
  readonly parameters: number;
}

interface RowsMeta {
  readonly meta?: { readonly rows_read?: number; readonly rows_written?: number };
}

/** Counts queries and bound parameters issued through a D1 binding. */
export function countingD1(database: D1Database): { binding: D1Database; stats: D1Counts } {
  const stats: D1Counts = {
    batches: 0,
    maxParameters: 0,
    maxBatchStatements: 0,
    queries: 0,
    rowsRead: 0,
    rowsWritten: 0,
  };
  const measure = async <Result>(pending: Promise<Result>): Promise<Result> => {
    const result = await pending;
    const items: readonly RowsMeta[] = Array.isArray(result) ? result : [result as RowsMeta];
    for (const item of items) {
      stats.rowsRead += Number(item.meta?.rows_read ?? 0);
      stats.rowsWritten += Number(item.meta?.rows_written ?? 0);
    }
    return result;
  };
  const wrap = (statement: D1PreparedStatement, parameters = 0): CountedStatement => ({
    all: <Row>() => {
      stats.queries += 1;
      return measure(statement.all<Row>());
    },
    bind: (...values: unknown[]) => {
      stats.maxParameters = Math.max(stats.maxParameters, values.length);
      return wrap(statement.bind(...values), values.length);
    },
    first: async <Row>(column?: string): Promise<Row | null> => {
      stats.queries += 1;
      const result = await measure(statement.all<Record<string, unknown>>());
      const row = result.results[0];
      if (row === undefined) return null;
      return (column === undefined ? row : (row[column] ?? null)) as Row | null;
    },
    raw: (...args: unknown[]) => {
      stats.queries += 1;
      return (statement as D1PreparedStatement & RawStatement).raw(...args);
    },
    inner: statement,
    parameters,
    run: () => {
      stats.queries += 1;
      return measure(statement.run());
    },
  });
  const inner = (statement: D1PreparedStatement): D1PreparedStatement =>
    "inner" in statement ? (statement as CountedStatement).inner : statement;
  return {
    binding: {
      batch: (statements) => {
        stats.batches += 1;
        stats.maxBatchStatements = Math.max(stats.maxBatchStatements, statements.length);
        stats.queries += statements.length;
        return measure(database.batch(statements.map(inner)));
      },
      prepare: (sql) => wrap(database.prepare(sql)),
    },
    stats,
  };
}
