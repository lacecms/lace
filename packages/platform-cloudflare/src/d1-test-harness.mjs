import { readdir, readFile } from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

const migrationsDirectory = new URL("../../db/drizzle/", import.meta.url);

/** Checked-in forward migrations split into D1-executable statements. */
export async function migrationStatements(include = () => true) {
  const files = (await readdir(migrationsDirectory))
    .filter((file) => file.endsWith(".sql") && include(file))
    .sort();
  const statements = [];
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

/** Starts isolated in-memory local D1 (migrated), R2, and KV bindings. */
export async function openLocalCloudflare(options = {}) {
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
  const database = await miniflare.getD1Database("DB");
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
  return {
    bucket: await miniflare.getR2Bucket("MEDIA"),
    database,
    dispose: () => miniflare.dispose(),
    kv: await miniflare.getKVNamespace("CACHE"),
  };
}

/** Starts an isolated in-memory local D1 database with every migration applied. */
export async function openLocalD1() {
  const { database, dispose } = await openLocalCloudflare();
  return { database, dispose };
}

/** Counts queries and bound parameters issued through a D1 binding. */
export function countingD1(database) {
  const stats = {
    batches: 0,
    maxParameters: 0,
    maxBatchStatements: 0,
    queries: 0,
    rowsRead: 0,
    rowsWritten: 0,
  };
  const measure = async (pending) => {
    const result = await pending;
    for (const item of Array.isArray(result) ? result : [result]) {
      stats.rowsRead += Number(item?.meta?.rows_read ?? 0);
      stats.rowsWritten += Number(item?.meta?.rows_written ?? 0);
    }
    return result;
  };
  const wrap = (statement, parameters = 0) => ({
    all: () => {
      stats.queries += 1;
      return measure(statement.all());
    },
    bind: (...values) => {
      stats.maxParameters = Math.max(stats.maxParameters, values.length);
      return wrap(statement.bind(...values), values.length);
    },
    first: async (column) => {
      stats.queries += 1;
      const result = await measure(statement.all());
      const row = result.results[0];
      return column === undefined ? (row ?? null) : (row?.[column] ?? null);
    },
    raw: (...args) => {
      stats.queries += 1;
      return statement.raw(...args);
    },
    inner: statement,
    parameters,
    run: () => {
      stats.queries += 1;
      return measure(statement.run());
    },
  });
  return {
    binding: {
      batch: (statements) => {
        stats.batches += 1;
        stats.maxBatchStatements = Math.max(stats.maxBatchStatements, statements.length);
        stats.queries += statements.length;
        return measure(database.batch(statements.map((statement) => statement.inner)));
      },
      prepare: (sql) => wrap(database.prepare(sql)),
    },
    stats,
  };
}
