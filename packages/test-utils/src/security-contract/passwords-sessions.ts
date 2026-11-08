import { PASSWORD_RESET_TTL_MS } from "@lacecms/application";
import { unixMilliseconds } from "@lacecms/domain";

import {
  password,
  bootstrapped,
  createUserByInvitation,
  passwordMatches,
  insertSession,
  sessionIds,
  SECURITY_CONTRACT_EPOCH,
  type SecurityContractCase,
} from "./harness.js";

export const cases: readonly SecurityContractCase[] = [
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
];
