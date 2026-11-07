import { INVITATION_TTL_MS } from "@lacecms/application";
import { unixMilliseconds } from "@lacecms/domain";

import {
  password,
  bootstrapped,
  createUserByInvitation,
  passwordMatches,
  outcome,
  SECURITY_CONTRACT_EPOCH,
  type SecurityContractCase,
} from "./harness.js";

export const cases: readonly SecurityContractCase[] = [
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
];
