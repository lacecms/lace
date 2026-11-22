import Database from "better-sqlite3";
import { contentModelKey } from "@lacecms/domain";
import type { ListContentEntriesInput } from "@lacecms/application";
import type { ContractRepositoryOptions, RepositoryContractRuntime } from "@lacecms/test-utils";
import { contractSql } from "./test-support/contract-sql.js";
import { afterEach, expect, test } from "vitest";
import { NODE_LIST_QUERY_LIMITS } from "@lacecms/content";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { contentRepositoryContractCases } from "@lacecms/test-utils";
import { openSqliteFixture } from "@lacecms/test-utils/sqlite";
import { NodeContentRepository, migrateNodeDatabase, openNodeDatabase } from "./index.js";

const cleanups: (() => void | Promise<void>)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

function trackGuards(connection: Database.Database) {
  cleanups.push(async () => {
    expect(connection.prepare("select count(*) as count from mutation_guards").get()).toEqual({
      count: 0,
    });
  });
}

function observedConnection(
  connection: Database.Database,
  { beforePrepare, afterRead, afterWrite }: Partial<ContractRepositoryOptions>,
) {
  const statements: string[] = [];
  let maxParameters = 0;
  return {
    reads: {
      reset: () => {
        statements.length = 0;
        maxParameters = 0;
      },
      snapshot: () => ({ statements: statements.length, sql: [...statements], maxParameters }),
    },
    connection: new Proxy(connection, {
      get(target, property) {
        if (property === "transaction" && afterWrite !== undefined)
          return (body: Parameters<Database.Database["transaction"]>[0]) => {
            const transaction = target.transaction(body);
            return Object.assign(() => transaction(), {
              immediate() {
                const result = transaction.immediate();
                afterWrite();
                return result;
              },
            });
          };
        if (property === "prepare")
          return (sql: string) => {
            beforePrepare?.(sql);
            const statement = target.prepare(sql);
            return new Proxy(statement, {
              get(value, key) {
                if (key === "all" || key === "get")
                  return (...args: unknown[]) => {
                    statements.push(sql);
                    maxParameters = Math.max(maxParameters, args.length);
                    const result: unknown = value[key](...args);
                    afterRead?.(
                      key === "all" ? (result as unknown[]) : [result],
                      target.inTransaction,
                    );
                    return result;
                  };
                const member: unknown = Reflect.get(value, key);
                return typeof member === "function" ? member.bind(value) : member;
              },
            });
          };
        const member: unknown = Reflect.get(target, property);
        return typeof member === "function" ? member.bind(target) : member;
      },
    }),
  };
}

const runtimes: Record<string, RepositoryContractRuntime> = {
  "file-backed SQLite": {
    listQueryLimits: NODE_LIST_QUERY_LIMITS,
    publicReadOverlap: "wal",
    recordEvidence: (value) => console.log("Collection query SQLite file", JSON.stringify(value)),
    async open(options) {
      const directory = await mkdtemp(join(tmpdir(), "lace-contract-"));
      const databasePath = join(directory, "lace.sqlite");
      migrateNodeDatabase(databasePath);
      const connections: Database.Database[] = [];
      const connect = () => {
        const { connection } = openNodeDatabase(databasePath);
        connections.push(connection);
        return connection;
      };
      const connection = connect();
      cleanups.push(async () => {
        for (const value of connections) value.close();
        await rm(directory, { force: true, recursive: true });
      });
      trackGuards(connection);
      const observed = observedConnection(connection, options);
      return {
        reads: observed.reads,
        reopen: (overrides = {}) =>
          new NodeContentRepository(
            observedConnection(connect(), overrides).connection,
            options.resolveModel,
            {
              ...options,
              ...overrides,
            },
          ),
        repository: new NodeContentRepository(observed.connection, options.resolveModel, options),
        sql: contractSql(connection),
      };
    },
  },
  "in-memory SQLite": {
    listQueryLimits: NODE_LIST_QUERY_LIMITS,
    recordEvidence: (value) => console.log("Collection query SQLite memory", JSON.stringify(value)),
    async open(options) {
      const { connection, close } = openSqliteFixture(options.resolveModel, options);
      cleanups.push(close);
      trackGuards(connection);
      const observed = observedConnection(connection, options);
      return {
        reads: observed.reads,
        reopen: (overrides = {}) =>
          new NodeContentRepository(connection, options.resolveModel, {
            ...options,
            ...overrides,
          }),
        repository: new NodeContentRepository(observed.connection, options.resolveModel, options),
        sql: contractSql(connection),
      };
    },
  },
};

for (const [runtimeName, runtime] of Object.entries(runtimes)) {
  for (const contract of contentRepositoryContractCases) {
    test(`${runtimeName} contract: ${contract.name}`, () => contract.run(runtime, expect));
  }
}

test("direct Node list reads retain their own policy and reject excess before SQL", async () => {
  let statements = 0;
  const connection = new Database(":memory:");
  cleanups.push(() => {
    connection.close();
  });
  const observed = new Proxy(connection, {
    get(target, property) {
      if (property === "prepare")
        return () => {
          statements++;
          throw new Error("SQL reached");
        };
      const member: unknown = Reflect.get(target, property);
      return typeof member === "function" ? member.bind(target) : member;
    },
  });
  const repository = new NodeContentRepository(observed, () => undefined);
  const input: ListContentEntriesInput = {
    modelKey: contentModelKey("posts"),
    listFields: [],
    limit: 5,
    sort: "title",
    listQueryLimits: { maxSearchLength: 48, maxLikePatternBytes: 50 },
  };
  await expect(repository.list({ ...input, q: "a".repeat(201) })).rejects.toMatchObject({
    pointer: "/q",
  });
  expect(statements).toBe(0);
  await expect(repository.list({ ...input, q: "я".repeat(200) })).rejects.toThrow("SQL reached");
  expect(statements).toBe(1);
});
