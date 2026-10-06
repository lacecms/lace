import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { expect, test } from "vitest";
import { migrationStatements } from "./d1-test-harness.mjs";

const OUTCOMES = "0003_site_build_outcomes.sql";

test("site-build outcome migration reclassifies unproven D1 hook outcomes as accepted", async () => {
  const miniflare = new Miniflare(
    convertV4MiniflareOptions({
      compatibilityDate: "2026-09-01",
      d1Databases: ["DB"],
      modules: true,
      script: "export default { fetch() { return new Response(null, { status: 404 }); } };",
    }),
  );
  try {
    const database = await miniflare.getD1Database("DB");
    const apply = async (statements) =>
      database.batch(statements.map((statement) => database.prepare(statement)));
    await apply(await migrationStatements((file) => file < OUTCOMES));
    const insert = database.prepare(
      "insert into site_builds (id, reason, status, target_version, provider_build_id, requested_by, requested_at, started_at, completed_at, error) values (?, 'publication', ?, 1, ?, 'admin', 10, ?, ?, ?)",
    );
    await database.batch([
      insert.bind("hook-no-id", "succeeded", null, 11, 11, null),
      insert.bind("hook-with-id", "running", "dep-1", 11, null, null),
      insert.bind("tracked", "succeeded", "dep-2", 11, 15, null),
      insert.bind("failed", "failed", null, 11, 12, "provider_failed"),
      insert.bind("queued", "pending", null, null, null, "trigger_unavailable"),
    ]);
    await apply(await migrationStatements((file) => file === OUTCOMES));
    const { results } = await database
      .prepare(
        "select id, status, provider_build_id, started_at, completed_at, error from site_builds order by id",
      )
      .all();
    expect(results).toEqual([
      {
        id: "failed",
        status: "failed",
        provider_build_id: null,
        started_at: 11,
        completed_at: 12,
        error: "provider_failed",
      },
      {
        id: "hook-no-id",
        status: "accepted",
        provider_build_id: null,
        started_at: 11,
        completed_at: 11,
        error: null,
      },
      {
        id: "hook-with-id",
        status: "accepted",
        provider_build_id: "dep-1",
        started_at: 11,
        completed_at: 11,
        error: null,
      },
      {
        id: "queued",
        status: "pending",
        provider_build_id: null,
        started_at: null,
        completed_at: null,
        error: "trigger_unavailable",
      },
      {
        id: "tracked",
        status: "succeeded",
        provider_build_id: "dep-2",
        started_at: 11,
        completed_at: 15,
        error: null,
      },
    ]);
    await expect(
      database.prepare("update site_builds set status = 'deployed' where id = 'failed'").run(),
    ).rejects.toThrow(/CHECK constraint/u);
  } finally {
    await miniflare.dispose();
  }
});
