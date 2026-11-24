import { INVITATION_TTL_MS, PASSWORD_RESET_TTL_MS } from "@lacecms/application";
import { unixMilliseconds } from "@lacecms/domain";
import {
  SECURITY_CONTRACT_EPOCH,
  bootstrapped,
  outcome,
  password,
  passwordMatches,
  type SecurityContractCase,
} from "./harness.js";

const now = unixMilliseconds(SECURITY_CONTRACT_EPOCH);
const afterExpiry = unixMilliseconds(SECURITY_CONTRACT_EPOCH + INVITATION_TTL_MS);

export const cases: readonly SecurityContractCase[] = [
  {
    name: "direct creation immediately persists an active normalized user and a first reset verifier",
    async run(runtime, expect) {
      const harness = await runtime.open();
      const { user: admin } = await bootstrapped(harness);
      const input = {
        email: "  New@Lace.test ",
        now,
        requestedBy: admin.id,
        role: "editor",
      } as const;
      const result = await harness.security.createUser(input);
      if (result.status !== "created") throw new Error("expected a new account");
      const user = { disabled: false, email: "new@lace.test", id: result.user.id, role: "editor" };
      expect(result.user).toEqual(user);
      expect((await harness.security.listUsers({ limit: 10 })).items).toContainEqual(user);
      const row = await harness.sql.get(
        `select email_verified, account.password, account.account_id, token_hash, expires_at, requested_by,
          (select count(*) from session where user_id = user.id) as sessions
          from user join account on account.user_id = user.id
          join password_reset_tokens on password_reset_tokens.user_id = user.id where user.id = ?`,
        user.id,
      );
      expect(row).toMatchObject({
        account_id: user.id,
        email_verified: 0,
        expires_at: Number(now) + PASSWORD_RESET_TTL_MS,
        password: null,
        requested_by: admin.id,
        sessions: 0,
        token_hash: expect.stringMatching(/^[a-f0-9]{64}$/u),
      });
      await expect(harness.security.createUser(input)).resolves.toEqual({ status: "conflict" });
      await harness.security.disableUser({ userId: user.id });
      await expect(harness.security.createUser(input)).resolves.toEqual({ status: "conflict" });
      expect(await harness.sql.get("select count(*) as count from password_reset_tokens")).toEqual({
        count: 1,
      });
    },
  },
  {
    name: "direct creation respects active invitations and preserves expired or revoked records",
    async run(runtime, expect) {
      const harness = await runtime.open();
      const { user: admin } = await bootstrapped(harness);
      const input = { email: "new@lace.test", now, requestedBy: admin.id, role: "editor" } as const;
      const invitation = await harness.security.createInvitation({ ...input, invitedBy: admin.id });
      if (invitation.status !== "created") throw new Error("expected an invitation");
      await expect(harness.security.createUser(input)).resolves.toEqual({ status: "conflict" });
      await expect(
        harness.security.inspectInvitation({ now, token: invitation.token }),
      ).resolves.not.toBeNull();
      await expect(
        harness.security.createUser({ ...input, now: afterExpiry }),
      ).resolves.toMatchObject({ status: "created" });
      expect((await harness.security.listInvitations({ limit: 10 })).items).toEqual([
        invitation.invitation,
      ]);
      await expect(
        harness.security.acceptInvitation({ now: afterExpiry, password, token: invitation.token }),
      ).resolves.toEqual({ status: "invalid" });

      const revoked = await harness.security.createInvitation({
        ...input,
        email: "revoked@lace.test",
        invitedBy: admin.id,
      });
      if (revoked.status !== "created") throw new Error("expected an invitation");
      await harness.security.revokeInvitation({ invitationId: revoked.invitation.id, now });
      await expect(
        harness.security.createUser({ ...input, email: "revoked@lace.test" }),
      ).resolves.toMatchObject({ status: "created" });
      await expect(
        harness.security.acceptInvitation({ now, password, token: revoked.token }),
      ).resolves.toEqual({ status: "invalid" });
    },
  },
  {
    name: "competing direct creates and invitation writes cannot claim the same address twice",
    async run(runtime, expect) {
      const harness = await runtime.open();
      const { user: admin } = await bootstrapped(harness);
      const other = await harness.reopenSecurity();
      const input = { email: "new@lace.test", now, requestedBy: admin.id, role: "editor" } as const;
      const results = await Promise.all([
        harness.security.createUser(input),
        other.createUser({ ...input, email: "New@Lace.test" }),
      ]);
      expect(results.map(({ status }) => status).sort()).toEqual(["conflict", "created"]);

      const newAddress = { ...input, email: "race-invite@lace.test" };
      const inserts = await Promise.all([
        other.createInvitation({ ...newAddress, invitedBy: admin.id }),
        harness.security.createUser(newAddress),
      ]);
      expect(inserts.map(({ status }) => status).sort()).toEqual(["conflict", "created"]);

      const staleAddress = { ...input, email: "race-resend@lace.test" };
      const stale = await harness.security.createInvitation({
        ...staleAddress,
        invitedBy: admin.id,
      });
      if (stale.status !== "created") throw new Error("expected an invitation");
      const renewals = await Promise.all([
        other.reissueInvitation({ invitationId: stale.invitation.id, now: afterExpiry }),
        harness.security.createUser({ ...staleAddress, now: afterExpiry }),
      ]);
      expect(renewals.filter(({ status }) => status === "conflict")).toHaveLength(1);

      const openAddress = { ...input, email: "race-accept@lace.test" };
      const open = await harness.security.createInvitation({ ...openAddress, invitedBy: admin.id });
      if (open.status !== "created") throw new Error("expected an invitation");
      const acceptances = await Promise.all([
        harness.security.createUser(openAddress),
        other.acceptInvitation({ now, password, token: open.token }),
      ]);
      expect(acceptances.map(({ status }) => status)).toEqual(["conflict", "accepted"]);
    },
  },
  {
    name: "a failed dependent write rolls back direct creation",
    async run(runtime, expect) {
      const harness = await runtime.open();
      const { user: admin } = await bootstrapped(harness);
      await harness.sql.run(
        `create trigger reject_initial_reset before insert on password_reset_tokens
           begin select raise(abort, 'injected reset write failure'); end`,
      );
      const input = { email: "new@lace.test", now, requestedBy: admin.id, role: "editor" } as const;
      await expect(harness.security.createUser(input)).rejects.toThrow(
        "injected reset write failure",
      );
      expect(await harness.sql.get("select count(*) as count from user")).toEqual({ count: 1 });
      expect(await harness.sql.get("select count(*) as count from account")).toEqual({ count: 1 });
      expect(await harness.sql.get("select count(*) as count from password_reset_tokens")).toEqual({
        count: 0,
      });
      await harness.sql.run("drop trigger reject_initial_reset");
      await expect(harness.security.createUser(input)).resolves.toMatchObject({
        status: "created",
      });
    },
  },
  {
    name: "direct creation reuses password reset expiry, replacement and one-time consumption",
    async run(runtime, expect) {
      const harness = await runtime.open();
      const { user: admin } = await bootstrapped(harness);
      const input = { email: "new@lace.test", now, requestedBy: admin.id, role: "editor" } as const;
      const expired = await harness.security.createUser(input);
      const replaced = await harness.security.createUser({ ...input, email: "replace@lace.test" });
      if (expired.status !== "created" || replaced.status !== "created")
        throw new Error("expected new accounts");
      const expiresAt = unixMilliseconds(Number(now) + PASSWORD_RESET_TTL_MS);
      await expect(
        harness.security.confirmPasswordReset({ now: expiresAt, password, token: expired.token }),
      ).resolves.toEqual({ status: "invalid" });
      expect(await passwordMatches(harness.security, replaced.user.id, password)).toBe(false);
      const replacement = await harness.security.issuePasswordReset({
        now,
        requestedBy: admin.id,
        target: { userId: replaced.user.id },
      });
      if (replacement.status !== "issued") throw new Error("expected a replacement reset");
      await expect(
        harness.security.confirmPasswordReset({ now, password, token: replaced.token }),
      ).resolves.toEqual({ status: "invalid" });
      const request = { now, password, token: replacement.token };
      await expect(harness.security.confirmPasswordReset(request)).resolves.toEqual({
        status: "reset",
        userId: replaced.user.id,
      });
      await expect(harness.security.confirmPasswordReset(request)).resolves.toEqual({
        status: "invalid",
      });
      expect(await passwordMatches(harness.security, replaced.user.id, password)).toBe(true);
      expect(await harness.security.readUserProfile(expired.user.id)).toMatchObject({
        disabled: false,
      });
    },
  },
  {
    name: "administrator guard excludes direct-created users until they have a password",
    async run(runtime, expect) {
      const harness = await runtime.open();
      const { user: admin } = await bootstrapped(harness);
      const input = { email: "new@lace.test", now, requestedBy: admin.id, role: "admin" } as const;
      const second = await harness.security.createUser(input);
      const pending = await harness.security.createUser({ ...input, email: "pending@lace.test" });
      if (second.status !== "created" || pending.status !== "created")
        throw new Error("expected new administrators");
      await expect(
        harness.security.updateUser({ userId: admin.id, role: "editor" }),
      ).rejects.toMatchObject({ code: "LAST_ADMIN_PROTECTED" });
      await expect(harness.security.disableUser({ userId: admin.id })).rejects.toMatchObject({
        code: "LAST_ADMIN_PROTECTED",
      });
      await harness.security.confirmPasswordReset({ now, password, token: second.token });
      const other = await harness.reopenSecurity();
      const attempts = await Promise.allSettled([
        harness.security.disableUser({ userId: admin.id }),
        other.updateUser({ userId: second.user.id, role: "editor" }),
      ]);
      expect(attempts.map(outcome).sort()).toEqual(["LAST_ADMIN_PROTECTED", "fulfilled"]);
      await expect(
        harness.security.disableUser({ userId: pending.user.id }),
      ).resolves.toMatchObject({
        disabled: true,
      });
    },
  },
];
