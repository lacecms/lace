import type { SecurityService, SensitiveRateLimiter } from "@lacecms/application";
import { unixMilliseconds } from "@lacecms/domain";
import type { ExpectStatic } from "vitest";
import type { ContractSql } from "./repository-contract.js";

/** A freshly migrated database with a controllable clock shared by the security adapters. */
export interface SecurityContractHarness {
  limiter(secret: string): SensitiveRateLimiter;
  readonly security: SecurityService;
  reopenSecurity(): Promise<SecurityService>;
  setNow(value: number): void;
  readonly sql: ContractSql;
}

export interface SecurityContractRuntime {
  open(): Promise<SecurityContractHarness>;
}

export interface SecurityContractCase {
  readonly name: string;
  run(runtime: SecurityContractRuntime, expect: ExpectStatic): Promise<void>;
}

export const SECURITY_CONTRACT_EPOCH = 1_800_000_000_000;
const password = "correct horse battery staple";
const hour = 60 * 60 * 1000;

async function bootstrapped(harness: SecurityContractHarness) {
  const setup = await harness.security.createSetupToken();
  const { user } = await harness.security.bootstrap({
    email: "Admin@Lace.test",
    password,
    token: setup.token,
  });
  return { setup, user };
}

function outcome(result: PromiseSettledResult<unknown>): string {
  if (result.status === "fulfilled") return "fulfilled";
  const reason = result.reason as { readonly code?: unknown };
  return typeof reason?.code === "string" ? reason.code : "rejected";
}

/** Security behavior every runtime's durable security adapter must implement identically. */
export const securityContractCases: readonly SecurityContractCase[] = Object.freeze([
  {
    name: "setup state reads only the durable completion marker without writes",
    async run(runtime, expect) {
      const harness = await runtime.open();
      await harness.sql.run("delete from installation_state");
      expect(await harness.security.isSetupComplete()).toBe(false);
      expect(await harness.sql.get("select count(*) as count from installation_state")).toEqual({
        count: 0,
      });
      expect(await harness.sql.get("select count(*) as count from setup_tokens")).toEqual({
        count: 0,
      });
      const token = await harness.security.createSetupToken();
      expect(await harness.security.isSetupComplete()).toBe(false);
      await harness.security.bootstrap({ email: "admin@lace.test", password, token: token.token });
      expect(await harness.security.isSetupComplete()).toBe(true);
      expect(await (await harness.reopenSecurity()).isSetupComplete()).toBe(true);
      await harness.sql.run(
        "update installation_state set setup_completed_at = null, setup_admin_user_id = null",
      );
      expect(await harness.security.isSetupComplete()).toBe(false);
      expect(await harness.sql.get("select count(*) as count from user")).toEqual({ count: 1 });
    },
  },
  {
    name: "setup credential completes bootstrap once and is stored only as a digest",
    async run(runtime, expect) {
      const harness = await runtime.open();
      const setup = await harness.security.createSetupToken();
      expect(setup.expiresAt).toBe(SECURITY_CONTRACT_EPOCH + hour);
      expect(setup.token).toMatch(/^[A-Za-z0-9_-]{43}$/u);
      const stored = await harness.sql.all<{ token_hash: string }>(
        "select token_hash from setup_tokens",
      );
      expect(stored).toHaveLength(1);
      expect(stored[0]!.token_hash).not.toContain(setup.token);
      expect(stored[0]!.token_hash).toMatch(/^[0-9a-f]{64}$/u);
      const { user } = await harness.security.bootstrap({
        email: " Admin@Lace.test ",
        password,
        token: setup.token,
      });
      expect(user).toMatchObject({ disabled: false, email: "admin@lace.test", role: "admin" });
      expect(
        await harness.sql.get(
          "select setup_completed_at, setup_admin_user_id from installation_state",
        ),
      ).toEqual({ setup_admin_user_id: user.id, setup_completed_at: SECURITY_CONTRACT_EPOCH });
      expect(
        await harness.sql.get(
          "select count(*) as count from setup_tokens where consumed_at is null",
        ),
      ).toEqual({ count: 0 });
      await expect(harness.security.createSetupToken()).rejects.toThrow();
      await expect(
        harness.security.bootstrap({ email: "admin@lace.test", password, token: setup.token }),
      ).rejects.toThrow();
      expect(await harness.security.listUsers()).toEqual([user]);
      expect(await harness.security.readUserProfile(user.id)).toEqual({
        disabled: false,
        email: "admin@lace.test",
        name: "admin@lace.test",
      });
      expect(await harness.security.readUserProfile("missing-user")).toBeNull();
      await harness.sql.run("update user set name = ?, disabled = 1 where id = ?", "  ", user.id);
      expect(await harness.security.readUserProfile(user.id)).toEqual({
        disabled: true,
        email: "admin@lace.test",
      });
    },
  },
  {
    name: "unknown, expired, and foreign-email setup credentials change nothing",
    async run(runtime, expect) {
      const harness = await runtime.open();
      const setup = await harness.security.createSetupToken();
      await expect(
        harness.security.bootstrap({
          email: "admin@lace.test",
          password,
          token: "A".repeat(43) as never,
        }),
      ).rejects.toThrow();
      await harness.security.bootstrap({ email: "admin@lace.test", password, token: setup.token });
      await harness.sql.run(
        "update installation_state set setup_completed_at = null, setup_admin_user_id = null",
      );
      await harness.sql.run("update setup_tokens set consumed_at = null");
      await expect(
        harness.security.bootstrap({ email: "other@lace.test", password, token: setup.token }),
      ).rejects.toThrow();
      const fresh = await harness.security.createSetupToken();
      harness.setNow(SECURITY_CONTRACT_EPOCH + hour);
      await expect(
        harness.security.bootstrap({ email: "late@lace.test", password, token: fresh.token }),
      ).rejects.toThrow();
      expect((await harness.security.listUsers()).map((value) => value.email)).toEqual([
        "admin@lace.test",
      ]);
      expect(
        await harness.sql.get(
          "select claimed_email_hash from setup_tokens where claimed_email_hash is not null and claimed_email_hash like '%@%'",
        ),
      ).toBeUndefined();
    },
  },
  {
    name: "an interrupted bootstrap resumes for the same email without a second administrator",
    async run(runtime, expect) {
      const harness = await runtime.open();
      const { setup, user } = await bootstrapped(harness);
      await harness.sql.run(
        "update installation_state set setup_completed_at = null, setup_admin_user_id = null",
      );
      await harness.sql.run("update setup_tokens set consumed_at = null");
      const resumed = await harness.security.bootstrap({
        email: "admin@lace.test",
        password,
        token: setup.token,
      });
      expect(resumed.user).toEqual(user);
      expect(await harness.sql.get("select count(*) as count from user")).toEqual({ count: 1 });
      expect(await harness.sql.get("select setup_admin_user_id from installation_state")).toEqual({
        setup_admin_user_id: user.id,
      });
    },
  },
  {
    name: "user management keeps one active administrator under concurrency",
    async run(runtime, expect) {
      const harness = await runtime.open();
      const { user: first } = await bootstrapped(harness);
      await expect(harness.security.disableUser({ userId: first.id })).rejects.toMatchObject({
        code: "LAST_ADMIN_PROTECTED",
      });
      await expect(
        harness.security.updateUser({ role: "editor", userId: first.id }),
      ).rejects.toMatchObject({ code: "LAST_ADMIN_PROTECTED" });
      const editor = await harness.security.createUser({
        email: "Editor@Lace.test",
        password,
        role: "editor",
      });
      expect(editor).toMatchObject({ disabled: false, email: "editor@lace.test", role: "editor" });
      expect(await harness.security.updateUser({ role: "viewer", userId: editor.id })).toEqual({
        ...editor,
        role: "viewer",
      });
      expect(await harness.security.updateUser({ userId: "missing", disabled: true })).toBeNull();
      await expect(harness.security.disableUser({ userId: "missing" })).rejects.toThrow();
      const second = await harness.security.createUser({
        email: "second@lace.test",
        password,
        role: "admin",
      });
      const results = await Promise.allSettled([
        harness.security.disableUser({ userId: first.id }),
        harness.security.updateUser({ role: "editor", userId: second.id }),
      ]);
      expect(results.map(outcome).sort()).toEqual(["LAST_ADMIN_PROTECTED", "fulfilled"]);
      expect(
        await harness.sql.get(
          "select count(*) as count from user where role = 'admin' and disabled = 0",
        ),
      ).toEqual({ count: 1 });
      expect((await harness.security.listUsers()).map((value) => value.email)).toEqual([
        "admin@lace.test",
        "editor@lace.test",
        "second@lace.test",
      ]);
    },
  },
  {
    name: "build credentials are digest-only, verified, and revocable",
    async run(runtime, expect) {
      const harness = await runtime.open();
      const now = unixMilliseconds(SECURITY_CONTRACT_EPOCH);
      const issued = await harness.security.createBuildToken({ name: "builder", now });
      expect(issued).toMatchObject({
        capabilities: ["content:build:read"],
        createdAt: now,
        name: "builder",
        tokenPrefix: issued.token.slice(0, 8),
      });
      expect(issued.token).toMatch(/^[A-Za-z0-9_-]{43}$/u);
      const row = await harness.sql.get<{ token_hash: string }>(
        "select token_hash from api_tokens",
      );
      expect(row!.token_hash).toMatch(/^[0-9a-f]{64}$/u);
      expect(row!.token_hash).not.toContain(issued.token);
      const [listed] = await harness.security.listBuildTokens();
      expect(listed).not.toHaveProperty("token");
      expect(listed).not.toHaveProperty("lastUsedAt");
      await expect(
        harness.security.verifyBuildToken({ now, token: "B".repeat(43) as never }),
      ).resolves.toBe(false);
      await expect(
        harness.security.verifyBuildToken({
          now: unixMilliseconds(SECURITY_CONTRACT_EPOCH + 5),
          token: issued.token,
        }),
      ).resolves.toBe(true);
      expect((await harness.security.listBuildTokens())[0]).toMatchObject({
        lastUsedAt: SECURITY_CONTRACT_EPOCH + 5,
      });
      const revoked = await harness.security.revokeBuildToken({
        now: unixMilliseconds(SECURITY_CONTRACT_EPOCH + 10),
        tokenId: issued.id,
      });
      expect(revoked).toMatchObject({ revokedAt: SECURITY_CONTRACT_EPOCH + 10 });
      expect(
        await harness.security.revokeBuildToken({
          now: unixMilliseconds(SECURITY_CONTRACT_EPOCH + 20),
          tokenId: issued.id,
        }),
      ).toMatchObject({ revokedAt: SECURITY_CONTRACT_EPOCH + 10 });
      expect(await harness.security.revokeBuildToken({ now, tokenId: "missing" })).toBeNull();
      await expect(
        harness.security.verifyBuildToken({
          now: unixMilliseconds(SECURITY_CONTRACT_EPOCH + 30),
          token: issued.token,
        }),
      ).resolves.toBe(false);
      expect((await harness.security.listBuildTokens())[0]).toMatchObject({
        lastUsedAt: SECURITY_CONTRACT_EPOCH + 5,
      });
    },
  },
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
      const rows = await harness.sql.all<{ bucket_key: string }>(
        "select bucket_key from rate_limit_buckets order by bucket_key",
      );
      expect(rows).toHaveLength(2);
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
]);
