// @ts-nocheck
// TODO(rf2): Type legacy SQLite/product harnesses, branded values and partial runtime adapters.
import { afterEach, expect, test } from "vitest";
import { NODE_LIST_QUERY_LIMITS } from "@lacecms/content";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { contentRepositoryContractCases } from "@lacecms/test-utils";
import { openSqliteFixture } from "@lacecms/test-utils/sqlite";
import { NodeContentRepository, migrateNodeDatabase, openNodeDatabase } from "./index.js";

const cleanups = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

function sqlOver(connection) {
  return {
    all: async (sql, ...params) => connection.prepare(sql).all(...params),
    get: async (sql, ...params) => connection.prepare(sql).get(...params),
    run: async (sql, ...params) => {
      connection.prepare(sql).run(...params);
    },
  };
}

function trackGuards(connection) {
  cleanups.push(async () => {
    expect(connection.prepare("select count(*) as count from mutation_guards").get()).toEqual({
      count: 0,
    });
  });
}

function observedConnection(connection) {
  const statements = [];
  return {
    reads: {
      reset: () => {
        statements.length = 0;
      },
      snapshot: () => ({ statements: statements.length, sql: [...statements] }),
    },
    connection: new Proxy(connection, {
      get(target, property) {
        if (property === "prepare")
          return (sql) => {
            const statement = target.prepare(sql);
            return new Proxy(statement, {
              get(value, key) {
                if (key === "all" || key === "get")
                  return (...args) => {
                    statements.push(sql);
                    return value[key](...args);
                  };
                return typeof value[key] === "function" ? value[key].bind(value) : value[key];
              },
            });
          };
        return typeof target[property] === "function"
          ? target[property].bind(target)
          : target[property];
      },
    }),
  };
}

const runtimes = {
  "file-backed SQLite": {
    listQueryLimits: NODE_LIST_QUERY_LIMITS,
    recordEvidence: (value) => console.log("Collection query SQLite file", JSON.stringify(value)),
    async open(options) {
      const directory = await mkdtemp(join(tmpdir(), "lace-contract-"));
      const databasePath = join(directory, "lace.sqlite");
      migrateNodeDatabase(databasePath);
      const connections = [];
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
      const observed = observedConnection(connection);
      return {
        reads: observed.reads,
        reopen: (overrides = {}) =>
          new NodeContentRepository(connect(), options.resolveModel, { ...options, ...overrides }),
        repository: new NodeContentRepository(observed.connection, options.resolveModel, options),
        sql: sqlOver(connection),
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
      const observed = observedConnection(connection);
      return {
        reads: observed.reads,
        reopen: (overrides = {}) =>
          new NodeContentRepository(connection, options.resolveModel, {
            ...options,
            ...overrides,
          }),
        repository: new NodeContentRepository(observed.connection, options.resolveModel, options),
        sql: sqlOver(connection),
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
  const repository = new NodeContentRepository(
    {
      prepare() {
        statements++;
        throw new Error("SQL reached");
      },
    },
    () => undefined,
  );
  const input = {
    modelKey: "posts",
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
