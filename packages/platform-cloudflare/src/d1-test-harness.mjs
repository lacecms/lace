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
export async function openLocalCloudflare() {
  const miniflare = new Miniflare(
    convertV4MiniflareOptions({
      compatibilityDate: "2026-09-01",
      d1Databases: ["DB"],
      kvNamespaces: ["CACHE"],
      modules: true,
      r2Buckets: ["MEDIA"],
      script: "export default { fetch() { return new Response(null, { status: 404 }); } };",
    }),
  );
  const database = await miniflare.getD1Database("DB");
  const statements = await migrationStatements();
  await database.batch(statements.map((statement) => database.prepare(statement)));
  await database
    .prepare("create table d1_migrations (id integer primary key, name text not null)")
    .run();
  const files = (await readdir(migrationsDirectory)).filter((file) => file.endsWith(".sql")).sort();
  for (const [index, name] of files.entries())
    await database
      .prepare("insert into d1_migrations (id, name) values (?, ?)")
      .bind(index + 1, name)
      .run();
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
  const stats = { maxParameters: 0, queries: 0 };
  const wrap = (statement, parameters = 0) => ({
    all: () => {
      stats.queries += 1;
      return statement.all();
    },
    bind: (...values) => {
      stats.maxParameters = Math.max(stats.maxParameters, values.length);
      return wrap(statement.bind(...values), values.length);
    },
    first: () => {
      stats.queries += 1;
      return statement.first();
    },
    inner: statement,
    parameters,
    run: () => {
      stats.queries += 1;
      return statement.run();
    },
  });
  return {
    binding: {
      batch: (statements) => {
        stats.queries += statements.length;
        return database.batch(statements.map((statement) => statement.inner));
      },
      prepare: (sql) => wrap(database.prepare(sql)),
    },
    stats,
  };
}
