import { unixMilliseconds } from "@lacecms/domain";

import { hour, SECURITY_CONTRACT_EPOCH, type SecurityContractCase } from "./harness.js";

export const cases: readonly SecurityContractCase[] = [
  {
    name: "fixed-window limits count concurrent attempts and store only HMAC keys",
    async run(runtime, expect) {
      const harness = await runtime.open();
      const limiter = harness.limiter("limiter-secret");
      const now = unixMilliseconds(SECURITY_CONTRACT_EPOCH);
      const decisions = await Promise.all(
        Array.from({ length: 6 }, () =>
          limiter.check({ now, operation: "setup", subject: "raw@example.test" }),
        ),
      );
      expect(decisions.filter((value) => value.allowed)).toHaveLength(5);
      expect(decisions.filter((value) => !value.allowed)).toEqual([
        { allowed: false, retryAfterSeconds: 3600 },
      ]);
      await expect(
        limiter.check({ now, operation: "auth", subject: "raw@example.test" }),
      ).resolves.toEqual({ allowed: true, retryAfterSeconds: 900 });
      const resets = [];
      for (let index = 0; index < 4; index += 1)
        resets.push(await limiter.check({ now, operation: "reset", subject: "raw@example.test" }));
      expect(resets.map((value) => value.allowed)).toEqual([true, true, true, false]);
      const invites = [];
      for (let index = 0; index < 21; index += 1)
        invites.push(await limiter.check({ now, operation: "invite", subject: "actor:admin" }));
      expect(invites.filter((value) => value.allowed)).toHaveLength(20);
      expect(invites.at(-1)).toEqual({ allowed: false, retryAfterSeconds: 3600 });
      const rows = await harness.sql.all<{ bucket_key: string }>(
        "select bucket_key from rate_limit_buckets order by bucket_key",
      );
      expect(rows).toHaveLength(4);
      for (const value of rows) {
        expect(value.bucket_key).toMatch(/^[0-9a-f]{64}$/u);
        expect(value.bucket_key).not.toContain("raw@example.test");
      }
      await expect(
        limiter.check({
          now: unixMilliseconds(SECURITY_CONTRACT_EPOCH + hour),
          operation: "setup",
          subject: "raw@example.test",
        }),
      ).resolves.toMatchObject({ allowed: true });
      await expect(
        harness.limiter("other-secret").check({
          now,
          operation: "setup",
          subject: "raw@example.test",
        }),
      ).resolves.toMatchObject({ allowed: true });
    },
  },
  {
    name: "OAuth and MCP fixed windows isolate subjects and reset exactly at expiry",
    async run(runtime, expect) {
      const harness = await runtime.open();
      const limiter = harness.limiter("oauth-limiter-secret");
      const now = unixMilliseconds(SECURITY_CONTRACT_EPOCH);
      for (const [operation, maximum, seconds] of [
        ["mcp", 60, 60],
        ["oauth-register", 10, 900],
        ["oauth-token", 60, 60],
        ["oauth-revoke", 20, 3600],
      ] as const) {
        const decisions = await Promise.all(
          Array.from({ length: maximum + 1 }, () =>
            limiter.check({ operation, subject: "subject-a", now }),
          ),
        );
        expect(decisions.filter((value) => value.allowed)).toHaveLength(maximum);
        expect(decisions.find((value) => !value.allowed)).toEqual({
          allowed: false,
          retryAfterSeconds: seconds,
        });
        expect(await limiter.check({ operation, subject: "subject-b", now })).toEqual({
          allowed: true,
          retryAfterSeconds: seconds,
        });
        expect(
          await limiter.check({
            operation,
            subject: "subject-a",
            now: unixMilliseconds(SECURITY_CONTRACT_EPOCH + seconds * 1000),
          }),
        ).toEqual({ allowed: true, retryAfterSeconds: seconds });
      }
    },
  },
];
