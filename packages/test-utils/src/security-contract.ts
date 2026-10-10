import type {
  ManagedUser,
  SecurityRole,
  SecurityService,
  SensitiveRateLimiter,
} from "@lacecms/application";
import { INVITATION_TTL_MS, PASSWORD_RESET_TTL_MS } from "@lacecms/application";
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

/**
 * Creates an account the only way the port allows after setup: an invitation
 * that is immediately accepted with the given password.
 */
export async function createUserByInvitation(
  security: SecurityService,
  input: {
    readonly email: string;
    readonly invitedBy: string;
    readonly now?: number;
    readonly password: string;
    readonly role: SecurityRole;
  },
): Promise<ManagedUser> {
  const now = unixMilliseconds(input.now ?? SECURITY_CONTRACT_EPOCH);
  const created = await security.createInvitation({
    email: input.email,
    invitedBy: input.invitedBy,
    now,
    role: input.role,
  });
  if (created.status !== "created")
    throw new Error(`Invitation was not created: ${created.status}.`);
  const accepted = await security.acceptInvitation({
    now,
    password: input.password,
    token: created.token,
  });
  if (accepted.status !== "accepted")
    throw new Error(`Invitation was not accepted: ${accepted.status}.`);
  return accepted.user;
}

/** Verifies a credential through the port without changing which password is current. */
async function passwordMatches(
  security: SecurityService,
  userId: string,
  candidate: string,
): Promise<boolean> {
  const result = await security.changePassword({
    currentPassword: candidate,
    newPassword: candidate,
    now: unixMilliseconds(SECURITY_CONTRACT_EPOCH),
    userId,
  });
  return result.status === "changed";
}

async function insertSession(
  harness: SecurityContractHarness,
  input: {
    readonly id: string;
    readonly userId: string;
    readonly expiresAt?: number;
    readonly updatedAt?: number;
  },
) {
  await harness.sql.run(
    "insert into session (id, expires_at, token, created_at, updated_at, ip_address, user_agent, user_id) values (?, ?, ?, ?, ?, '203.0.113.9', 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0', ?)",
    input.id,
    input.expiresAt ?? SECURITY_CONTRACT_EPOCH + 7 * 24 * hour,
    `token-${input.id}`,
    SECURITY_CONTRACT_EPOCH,
    input.updatedAt ?? SECURITY_CONTRACT_EPOCH,
    input.userId,
  );
}

async function sessionIds(harness: SecurityContractHarness, userId: string): Promise<string[]> {
  const rows = await harness.sql.all<{ id: string }>(
    "select id from session where user_id = ? order by id",
    userId,
  );
  return rows.map((row) => row.id);
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
      const editor = await createUserByInvitation(harness.security, {
        email: "Editor@Lace.test",
        invitedBy: first.id,
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
      const second = await createUserByInvitation(harness.security, {
        email: "second@lace.test",
        invitedBy: first.id,
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
    name: "invitations conflict with accounts and active invitations and are digest-only",
    async run(runtime, expect) {
      const harness = await runtime.open();
      const { user: admin } = await bootstrapped(harness);
      const now = unixMilliseconds(SECURITY_CONTRACT_EPOCH);
      await expect(
        harness.security.createInvitation({
          email: "ADMIN@lace.test",
          invitedBy: admin.id,
          now,
          role: "viewer",
        }),
      ).resolves.toEqual({ status: "conflict" });
      const created = await harness.security.createInvitation({
        email: " New@Lace.test ",
        invitedBy: admin.id,
        now,
        role: "editor",
      });
      if (created.status !== "created") throw new Error("expected an invitation");
      expect(created.token).toMatch(/^[A-Za-z0-9_-]{43}$/u);
      expect(created.invitation).toEqual({
        createdAt: SECURITY_CONTRACT_EPOCH,
        email: "new@lace.test",
        expiresAt: SECURITY_CONTRACT_EPOCH + INVITATION_TTL_MS,
        id: created.invitation.id,
        invitedBy: admin.id,
        invitedByName: "admin@lace.test",
        role: "editor",
      });
      const stored = await harness.sql.get<{ token_hash: string }>(
        "select token_hash from invitations",
      );
      expect(stored!.token_hash).toMatch(/^[0-9a-f]{64}$/u);
      expect(stored!.token_hash).not.toContain(created.token);
      await expect(
        harness.security.createInvitation({
          email: "new@lace.test",
          invitedBy: admin.id,
          now,
          role: "viewer",
        }),
      ).resolves.toEqual({ status: "conflict" });
      expect(await harness.sql.get("select count(*) as count from user")).toEqual({ count: 1 });
      expect(await harness.security.listInvitations()).toEqual([created.invitation]);
      await expect(
        harness.security.inspectInvitation({ now, token: created.token }),
      ).resolves.toEqual({
        email: "new@lace.test",
        expiresAt: SECURITY_CONTRACT_EPOCH + INVITATION_TTL_MS,
        role: "editor",
      });
      const expired = unixMilliseconds(SECURITY_CONTRACT_EPOCH + INVITATION_TTL_MS);
      await expect(
        harness.security.inspectInvitation({ now: expired, token: created.token }),
      ).resolves.toBeNull();
      await expect(
        harness.security.acceptInvitation({ now: expired, password, token: created.token }),
      ).resolves.toEqual({ status: "invalid" });
      expect(await harness.security.listInvitations()).toHaveLength(1);
      const fresh = await harness.security.createInvitation({
        email: "new@lace.test",
        invitedBy: admin.id,
        now: expired,
        role: "viewer",
      });
      expect(fresh.status).toBe("created");
      expect((await harness.security.listInvitations()).map((value) => value.role)).toEqual([
        "viewer",
      ]);
    },
  },
  {
    name: "invitation acceptance creates exactly one account, even concurrently",
    async run(runtime, expect) {
      const harness = await runtime.open();
      const { user: admin } = await bootstrapped(harness);
      const now = unixMilliseconds(SECURITY_CONTRACT_EPOCH + 5);
      const created = await harness.security.createInvitation({
        email: "new@lace.test",
        invitedBy: admin.id,
        now,
        role: "editor",
      });
      if (created.status !== "created") throw new Error("expected an invitation");
      const attempts = await Promise.all([
        harness.security.acceptInvitation({
          displayName: "Ada",
          now,
          password,
          token: created.token,
        }),
        harness.security.acceptInvitation({
          now,
          password: "another long password",
          token: created.token,
        }),
      ]);
      expect(attempts.map((value) => value.status).sort()).toEqual(["accepted", "invalid"]);
      const accepted = attempts.find((value) => value.status === "accepted");
      if (accepted?.status !== "accepted") throw new Error("expected acceptance");
      expect(accepted.user).toMatchObject({
        disabled: false,
        email: "new@lace.test",
        role: "editor",
      });
      expect(
        await harness.sql.get("select count(*) as count from user where email = 'new@lace.test'"),
      ).toEqual({ count: 1 });
      expect(
        await harness.sql.get(
          "select count(*) as count from account where user_id = ? and provider_id = 'credential'",
          accepted.user.id,
        ),
      ).toEqual({ count: 1 });
      expect(
        await harness.sql.get("select accepted_at, accepted_user_id from invitations"),
      ).toEqual({
        accepted_at: SECURITY_CONTRACT_EPOCH + 5,
        accepted_user_id: accepted.user.id,
      });
      expect(await harness.sql.get("select count(*) as count from session")).toEqual({ count: 0 });
      await expect(
        harness.security.acceptInvitation({ now, password, token: created.token }),
      ).resolves.toEqual({ status: "invalid" });
      expect(await harness.security.listInvitations()).toEqual([]);
      const winner = attempts[0]!.status === "accepted" ? password : "another long password";
      expect(await passwordMatches(harness.security, accepted.user.id, winner)).toBe(true);
      expect(await harness.security.readUserProfile(accepted.user.id)).toMatchObject({
        name: attempts[0]!.status === "accepted" ? "Ada" : "new@lace.test",
      });
      const late = await harness.security.createInvitation({
        email: "late@lace.test",
        invitedBy: admin.id,
        now,
        role: "viewer",
      });
      if (late.status !== "created") throw new Error("expected an invitation");
      await createUserByInvitation(harness.security, {
        email: "other@lace.test",
        invitedBy: admin.id,
        password,
        role: "viewer",
      });
      await harness.sql.run(
        "update user set email = 'late@lace.test' where email = 'other@lace.test'",
      );
      await expect(
        harness.security.acceptInvitation({ now, password, token: late.token }),
      ).resolves.toEqual({ status: "conflict" });
      expect(
        await harness.sql.get("select count(*) as count from user where email = 'late@lace.test'"),
      ).toEqual({ count: 1 });
    },
  },
  {
    name: "resend rotates the link and revoked or accepted invitations stay closed",
    async run(runtime, expect) {
      const harness = await runtime.open();
      const { user: admin } = await bootstrapped(harness);
      const now = unixMilliseconds(SECURITY_CONTRACT_EPOCH);
      const created = await harness.security.createInvitation({
        email: "new@lace.test",
        invitedBy: admin.id,
        now,
        role: "viewer",
      });
      if (created.status !== "created") throw new Error("expected an invitation");
      const later = unixMilliseconds(SECURITY_CONTRACT_EPOCH + INVITATION_TTL_MS + 1);
      const resent = await harness.security.reissueInvitation({
        invitationId: created.invitation.id,
        now: later,
      });
      if (resent.status !== "reissued") throw new Error("expected a reissue");
      expect(resent.token).not.toBe(created.token);
      expect(resent.invitation.expiresAt).toBe(Number(later) + INVITATION_TTL_MS);
      await expect(
        harness.security.inspectInvitation({ now: later, token: created.token }),
      ).resolves.toBeNull();
      await expect(
        harness.security.inspectInvitation({ now: later, token: resent.token }),
      ).resolves.not.toBeNull();
      await expect(
        harness.security.revokeInvitation({ invitationId: created.invitation.id, now: later }),
      ).resolves.toBe("revoked");
      await expect(
        harness.security.revokeInvitation({ invitationId: created.invitation.id, now: later }),
      ).resolves.toBe("not_found");
      await expect(
        harness.security.reissueInvitation({ invitationId: created.invitation.id, now: later }),
      ).resolves.toEqual({ status: "not_found" });
      await expect(
        harness.security.acceptInvitation({ now: later, password, token: resent.token }),
      ).resolves.toEqual({ status: "invalid" });
      expect(await harness.sql.get("select count(*) as count from user")).toEqual({ count: 1 });
      expect(await harness.security.listInvitations()).toEqual([]);
      const second = await harness.security.createInvitation({
        email: "new@lace.test",
        invitedBy: admin.id,
        now: later,
        role: "editor",
      });
      if (second.status !== "created") throw new Error("expected an invitation");
      await harness.security.acceptInvitation({ now: later, password, token: second.token });
      await expect(
        harness.security.revokeInvitation({ invitationId: second.invitation.id, now: later }),
      ).resolves.toBe("conflict");
      await expect(
        harness.security.reissueInvitation({ invitationId: second.invitation.id, now: later }),
      ).resolves.toEqual({ status: "conflict" });
      await expect(
        harness.security.revokeInvitation({ invitationId: "missing", now: later }),
      ).resolves.toBe("not_found");
    },
  },
  {
    name: "password resets expire, are superseded, and end every session",
    async run(runtime, expect) {
      const harness = await runtime.open();
      const { user: admin } = await bootstrapped(harness);
      const editor = await createUserByInvitation(harness.security, {
        email: "editor@lace.test",
        invitedBy: admin.id,
        password,
        role: "editor",
      });
      const now = unixMilliseconds(SECURITY_CONTRACT_EPOCH);
      await expect(
        harness.security.issuePasswordReset({ now, target: { email: "nobody@lace.test" } }),
      ).resolves.toEqual({ status: "not_found" });
      const first = await harness.security.issuePasswordReset({
        now,
        target: { email: " Editor@Lace.test" },
      });
      if (first.status !== "issued") throw new Error("expected a reset");
      expect(first).toMatchObject({ email: "editor@lace.test", userId: editor.id });
      const second = await harness.security.issuePasswordReset({
        now,
        requestedBy: admin.id,
        target: { userId: editor.id },
      });
      if (second.status !== "issued") throw new Error("expected a reset");
      const rows = await harness.sql.all<{ token_hash: string; requested_by: string | null }>(
        "select token_hash, requested_by from password_reset_tokens",
      );
      expect(rows).toEqual([
        { requested_by: admin.id, token_hash: expect.stringMatching(/^[0-9a-f]{64}$/u) },
      ]);
      await expect(
        harness.security.confirmPasswordReset({
          now,
          password: "brand new password",
          token: first.token,
        }),
      ).resolves.toEqual({ status: "invalid" });
      const expired = unixMilliseconds(SECURITY_CONTRACT_EPOCH + PASSWORD_RESET_TTL_MS);
      await expect(
        harness.security.confirmPasswordReset({
          now: expired,
          password: "brand new password",
          token: second.token,
        }),
      ).resolves.toEqual({ status: "invalid" });
      expect(await passwordMatches(harness.security, editor.id, password)).toBe(true);
      await insertSession(harness, { id: "editor-a", userId: editor.id });
      await insertSession(harness, { id: "editor-b", userId: editor.id });
      await insertSession(harness, { id: "admin-a", userId: admin.id });
      await expect(
        harness.security.confirmPasswordReset({
          now,
          password: "brand new password",
          token: second.token,
        }),
      ).resolves.toEqual({ status: "reset", userId: editor.id });
      expect(await sessionIds(harness, editor.id)).toEqual([]);
      expect(await sessionIds(harness, admin.id)).toEqual(["admin-a"]);
      expect(await passwordMatches(harness.security, editor.id, password)).toBe(false);
      expect(await passwordMatches(harness.security, editor.id, "brand new password")).toBe(true);
      await expect(
        harness.security.confirmPasswordReset({
          now,
          password: "another new password",
          token: second.token,
        }),
      ).resolves.toEqual({ status: "invalid" });
      const third = await harness.security.issuePasswordReset({
        now,
        target: { userId: editor.id },
      });
      if (third.status !== "issued") throw new Error("expected a reset");
      await harness.security.updateUser({ disabled: true, userId: editor.id });
      await expect(
        harness.security.confirmPasswordReset({
          now,
          password: "another new password",
          token: third.token,
        }),
      ).resolves.toEqual({ status: "invalid" });
      await expect(
        harness.security.issuePasswordReset({ now, target: { email: "editor@lace.test" } }),
      ).resolves.toEqual({ status: "disabled" });
      expect(
        await harness.sql.get(
          "select count(*) as count from password_reset_tokens where consumed_at is null",
        ),
      ).toEqual({ count: 1 });
    },
  },
  {
    name: "password changes require the current password and can keep only one session",
    async run(runtime, expect) {
      const harness = await runtime.open();
      const { user: admin } = await bootstrapped(harness);
      const now = unixMilliseconds(SECURITY_CONTRACT_EPOCH);
      await insertSession(harness, { id: "admin-a", userId: admin.id });
      await insertSession(harness, { id: "admin-b", userId: admin.id });
      await insertSession(harness, { id: "admin-c", userId: admin.id });
      await expect(
        harness.security.changePassword({
          currentPassword: "wrong password!",
          keepSessionId: "admin-a",
          newPassword: "brand new password",
          now,
          userId: admin.id,
        }),
      ).resolves.toEqual({ status: "invalid_credentials" });
      expect(await sessionIds(harness, admin.id)).toEqual(["admin-a", "admin-b", "admin-c"]);
      await expect(
        harness.security.changePassword({
          currentPassword: password,
          keepSessionId: "admin-a",
          newPassword: "brand new password",
          now,
          userId: admin.id,
        }),
      ).resolves.toEqual({ revoked: 2, status: "changed" });
      expect(await sessionIds(harness, admin.id)).toEqual(["admin-a"]);
      await expect(
        harness.security.changePassword({
          currentPassword: "brand new password",
          newPassword: "third long password",
          now,
          userId: admin.id,
        }),
      ).resolves.toEqual({ revoked: 0, status: "changed" });
      expect(await sessionIds(harness, admin.id)).toEqual(["admin-a"]);
      await expect(
        harness.security.changePassword({
          currentPassword: password,
          newPassword: password,
          now,
          userId: "missing",
        }),
      ).resolves.toEqual({ status: "invalid_credentials" });
      await expect(
        harness.security.updateDisplayName({ displayName: "Ada Lovelace", now, userId: admin.id }),
      ).resolves.toBe(true);
      expect(await harness.security.readUserProfile(admin.id)).toMatchObject({
        name: "Ada Lovelace",
      });
      await expect(
        harness.security.updateDisplayName({ displayName: "Nobody", now, userId: "missing" }),
      ).resolves.toBe(false);
    },
  },
  {
    name: "sessions are listed per user without tokens and foreign identifiers are not found",
    async run(runtime, expect) {
      const harness = await runtime.open();
      const { user: admin } = await bootstrapped(harness);
      const editor = await createUserByInvitation(harness.security, {
        email: "editor@lace.test",
        invitedBy: admin.id,
        password,
        role: "editor",
      });
      const now = unixMilliseconds(SECURITY_CONTRACT_EPOCH + 10);
      await insertSession(harness, {
        id: "admin-a",
        updatedAt: SECURITY_CONTRACT_EPOCH + 1,
        userId: admin.id,
      });
      await insertSession(harness, {
        id: "admin-b",
        updatedAt: SECURITY_CONTRACT_EPOCH + 2,
        userId: admin.id,
      });
      await insertSession(harness, {
        expiresAt: SECURITY_CONTRACT_EPOCH + 5,
        id: "admin-old",
        userId: admin.id,
      });
      await insertSession(harness, { id: "editor-a", userId: editor.id });
      const listed = await harness.security.listSessions({ now, userId: admin.id });
      expect(listed).toEqual([
        {
          createdAt: SECURITY_CONTRACT_EPOCH,
          id: "admin-b",
          lastActiveAt: SECURITY_CONTRACT_EPOCH + 2,
          userAgent: "Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0",
        },
        {
          createdAt: SECURITY_CONTRACT_EPOCH,
          id: "admin-a",
          lastActiveAt: SECURITY_CONTRACT_EPOCH + 1,
          userAgent: "Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0",
        },
      ]);
      expect(JSON.stringify(listed)).not.toMatch(/token-|203\.0\.113/u);
      await expect(
        harness.security.deleteSession({ sessionId: "editor-a", userId: admin.id }),
      ).resolves.toBe(false);
      expect(await sessionIds(harness, editor.id)).toEqual(["editor-a"]);
      await expect(
        harness.security.deleteSession({ sessionId: "admin-b", userId: admin.id }),
      ).resolves.toBe(true);
      await expect(
        harness.security.deleteOtherSessions({ keepSessionId: "admin-a", userId: admin.id }),
      ).resolves.toBe(1);
      expect(await sessionIds(harness, admin.id)).toEqual(["admin-a"]);
      await expect(harness.security.deleteUserSessions({ userId: editor.id })).resolves.toBe(1);
      await expect(harness.security.deleteUserSessions({ userId: "missing" })).resolves.toBeNull();
      expect(await sessionIds(harness, editor.id)).toEqual([]);
    },
  },
  {
    name: "disabling a user deletes its sessions and a refused disable keeps them",
    async run(runtime, expect) {
      const harness = await runtime.open();
      const { user: admin } = await bootstrapped(harness);
      const editor = await createUserByInvitation(harness.security, {
        email: "editor@lace.test",
        invitedBy: admin.id,
        password,
        role: "editor",
      });
      await insertSession(harness, { id: "editor-a", userId: editor.id });
      await insertSession(harness, { id: "admin-a", userId: admin.id });
      await harness.security.updateUser({ role: "viewer", userId: editor.id });
      expect(await sessionIds(harness, editor.id)).toEqual(["editor-a"]);
      await expect(harness.security.disableUser({ userId: admin.id })).rejects.toMatchObject({
        code: "LAST_ADMIN_PROTECTED",
      });
      expect(await sessionIds(harness, admin.id)).toEqual(["admin-a"]);
      await harness.security.updateUser({ disabled: true, userId: editor.id });
      expect(await sessionIds(harness, editor.id)).toEqual([]);
      await harness.security.updateUser({ disabled: false, userId: editor.id });
      expect(await sessionIds(harness, editor.id)).toEqual([]);
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
]);
