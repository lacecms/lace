// @ts-nocheck
// TODO(rf2): Type legacy D1/Worker harnesses, binding fakes and recorded adapter calls.
import { afterEach, expect, test } from "vitest";
import { SECURITY_CONTRACT_EPOCH, securityContractCases } from "@lacecms/test-utils";
import { unixMilliseconds } from "@lacecms/domain";
import { D1FixedWindowRateLimiter, D1SecurityService } from "./index.js";
import { openLocalD1 } from "./d1-test-harness.mjs";

const cleanups = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

const runtime = {
  async open() {
    const { database, dispose } = await openLocalD1();
    cleanups.push(dispose);
    let now = SECURITY_CONTRACT_EPOCH;
    const bindAll = (sql, params) =>
      params.length === 0 ? database.prepare(sql) : database.prepare(sql).bind(...params);
    return {
      limiter: (secret) => new D1FixedWindowRateLimiter(database, secret),
      reopenSecurity: async () => new D1SecurityService(database, () => unixMilliseconds(now)),
      security: new D1SecurityService(database, () => unixMilliseconds(now)),
      setNow: (value) => {
        now = value;
      },
      sql: {
        all: async (sql, ...params) => (await bindAll(sql, params).all()).results,
        get: async (sql, ...params) => (await bindAll(sql, params).first()) ?? undefined,
        run: async (sql, ...params) => {
          await bindAll(sql, params).run();
        },
      },
    };
  },
};

for (const contract of securityContractCases) {
  test(`local D1 security contract: ${contract.name}`, () => contract.run(runtime, expect), 60_000);
}
