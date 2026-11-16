import type { SecurityContractRuntime } from "@lacecms/test-utils";
import { contractSql } from "./test-support/contract-sql.js";
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

const cleanups: (() => void | Promise<void>)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

const runtime: SecurityContractRuntime = {
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
        cleanups.push(() => {
          reopened.connection.close();
        });
        return new NodeSecurityService(reopened.connection, () => unixMilliseconds(now));
      },
      security: new NodeSecurityService(connection, () => unixMilliseconds(now)),
      setNow: (value) => {
        now = value;
      },
      sql: contractSql(connection),
    };
  },
};

for (const contract of securityContractCases) {
  test(`Node SQLite security contract: ${contract.name}`, () => contract.run(runtime, expect));
}
