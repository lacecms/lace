import type { RepositoryContractRuntime } from "@lacecms/test-utils";
import { contractSql } from "./test-support/contract-sql.js";
import { afterEach, expect, test } from "vitest";
import { contentRepositoryContractCases } from "@lacecms/test-utils";
import { CLOUDFLARE_LIST_QUERY_LIMITS } from "@lacecms/content";
import { D1ContentRepository } from "./index.js";
import { openLocalD1, countingD1 } from "./test-support/d1-test-harness.js";

const cleanups: (() => void | Promise<void>)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

const runtime: RepositoryContractRuntime = {
  listQueryLimits: CLOUDFLARE_LIST_QUERY_LIMITS,
  publicReadOverlap: "batch",
  recordEvidence: (value) => console.log("Collection query local D1", JSON.stringify(value)),
  async open(options) {
    const { database, dispose } = await openLocalD1();
    cleanups.push(async () => {
      try {
        expect(
          await database.prepare("select count(*) as count from mutation_guards").first(),
        ).toEqual({ count: 0 });
      } finally {
        await dispose();
      }
    });
    const measured = countingD1(database, options.afterRead);
    const statements: string[] = [];
    const binding = {
      ...measured.binding,
      async batch(statements: Parameters<typeof measured.binding.batch>[0]) {
        if (options.beforeReadBatch !== undefined) await options.beforeReadBatch();
        const results = await measured.binding.batch(statements);
        if (options.afterRead !== undefined)
          for (const { results: rows } of results) options.afterRead(rows);
        if (options.afterReadBatch !== undefined) await options.afterReadBatch();
        if (options.afterWrite !== undefined && results.some(({ meta }) => meta.changes > 0)) {
          options.afterWrite();
        }
        return results;
      },
      prepare: (sql: string) => {
        options.beforePrepare?.(sql);
        statements.push(sql);
        return measured.binding.prepare(sql);
      },
    };
    return {
      reads: {
        reset: () => {
          statements.length = 0;
          measured.stats.queries = 0;
          measured.stats.rowsRead = 0;
          measured.stats.batches = 0;
          measured.stats.maxParameters = 0;
        },
        snapshot: () => ({
          statements: measured.stats.queries,
          rowsRead: measured.stats.rowsRead,
          batches: measured.stats.batches,
          maxParameters: measured.stats.maxParameters,
          sql: [...statements],
        }),
      },
      reopen: (overrides = {}) =>
        new D1ContentRepository(database, options.resolveModel, { ...options, ...overrides }),
      repository: new D1ContentRepository(binding, options.resolveModel, options),
      sql: contractSql(database),
    };
  },
};

for (const contract of contentRepositoryContractCases) {
  test(`local D1 contract: ${contract.name}`, () => contract.run(runtime, expect), 60_000);
}
