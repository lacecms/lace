// @ts-nocheck
// TODO(rf2): Type legacy SQLite/product harnesses, branded values and partial runtime adapters.
import { afterEach, expect, test } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SECURITY_CONTRACT_EPOCH, securityContractCases } from "@lacecms/test-utils";
import { unixMilliseconds } from "@lacecms/domain";
import {
  NodeFixedWindowRateLimiter,
  NodeSecurityService,
  migrateNodeDatabase,
  openNodeDatabase,
} from "./index.js";

const cleanups = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

const runtime = {
  async open() {
    const directory = await mkdtemp(join(tmpdir(), "lace-security-contract-"));
    const databasePath = join(directory, "lace.sqlite");
    migrateNodeDatabase(databasePath);
    const { connection } = openNodeDatabase(databasePath);
    cleanups.push(async () => {
      connection.close();
      await rm(directory, { force: true, recursive: true });
    });
    let now = SECURITY_CONTRACT_EPOCH;
    return {
      limiter: (secret) => new NodeFixedWindowRateLimiter(connection, secret),
      reopenSecurity: async () => {
        const reopened = openNodeDatabase(databasePath);
        cleanups.push(async () => reopened.connection.close());
        return new NodeSecurityService(reopened.connection, () => unixMilliseconds(now));
      },
      security: new NodeSecurityService(connection, () => unixMilliseconds(now)),
      setNow: (value) => {
        now = value;
      },
      sql: {
        all: async (sql, ...params) => connection.prepare(sql).all(...params),
        get: async (sql, ...params) => connection.prepare(sql).get(...params),
        run: async (sql, ...params) => {
          connection.prepare(sql).run(...params);
        },
      },
    };
  },
};

for (const contract of securityContractCases) {
  test(`Node SQLite security contract: ${contract.name}`, () => contract.run(runtime, expect));
}
