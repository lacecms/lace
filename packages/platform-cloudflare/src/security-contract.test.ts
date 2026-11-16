import type { SecurityContractRuntime } from "@lacecms/test-utils";
import { contractSql } from "./test-support/contract-sql.js";
import { afterEach, expect, test } from "vitest";
import { SECURITY_CONTRACT_EPOCH, securityContractCases } from "@lacecms/test-utils";
import { unixMilliseconds } from "@lacecms/domain";
import { D1FixedWindowRateLimiter, D1SecurityService } from "./index.js";
import { openLocalD1 } from "./test-support/d1-test-harness.js";

const cleanups: (() => void | Promise<void>)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

const runtime: SecurityContractRuntime = {
  async open() {
    const { database, dispose } = await openLocalD1();
    cleanups.push(dispose);
    let now = SECURITY_CONTRACT_EPOCH;
    return {
      limiter: (secret) => new D1FixedWindowRateLimiter(database, secret),
      reopenSecurity: async () => new D1SecurityService(database, () => unixMilliseconds(now)),
      security: new D1SecurityService(database, () => unixMilliseconds(now)),
      setNow: (value) => {
        now = value;
      },
      sql: contractSql(database),
    };
  },
};

for (const contract of securityContractCases) {
  test(`local D1 security contract: ${contract.name}`, () => contract.run(runtime, expect), 60_000);
}
