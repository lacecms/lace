import type { OpaqueTokenSecret } from "@lacecms/application";

import { unixMilliseconds } from "@lacecms/domain";

import {
  password,
  hour,
  bootstrapped,
  createUserByInvitation,
  insertSession,
  SECURITY_CONTRACT_EPOCH,
  type SecurityContractCase,
} from "./harness.js";

export const cases: readonly SecurityContractCase[] = [
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
    name: "import credentials expire, record throttled use and stay apart from build credentials",
    async run(runtime, expect) {
      const harness = await runtime.open();
      const { user: admin } = await bootstrapped(harness);
      const now = unixMilliseconds(SECURITY_CONTRACT_EPOCH);
      const expiresAt = unixMilliseconds(SECURITY_CONTRACT_EPOCH + 7 * 24 * hour);
      const issued = await harness.security.createImportToken({
        capabilities: ["content:import", "content:publish"],
        createdBy: admin.id,
        expiresAt,
        name: "Framer",
        now,
      });
      expect(issued).toMatchObject({
        capabilities: ["content:import", "content:publish"],
        createdAt: now,
        createdBy: { email: "admin@lace.test", id: admin.id },
        expiresAt,
        name: "Framer",
        tokenPrefix: issued.token.slice(0, 8),
      });
      expect(issued.token).toMatch(/^[A-Za-z0-9_-]{43}$/u);
      const stored = await harness.sql.get<{ token_hash: string }>(
        "select token_hash from api_tokens where id = ?",
        issued.id,
      );
      expect(stored!.token_hash).toMatch(/^[0-9a-f]{64}$/u);
      const build = await harness.security.createBuildToken({ name: "builder", now });

      // Kinds never authenticate each other's surfaces or appear in each other's lists.
      await expect(harness.security.verifyBuildToken({ now, token: issued.token })).resolves.toBe(
        false,
      );
      await expect(
        harness.security.resolveImportToken({ now, token: build.token }),
      ).resolves.toBeNull();
      expect((await harness.security.listBuildTokens()).map((value) => value.id)).toEqual([
        build.id,
      ]);
      const [listed] = await harness.security.listImportTokens();
      expect(listed).toMatchObject({ id: issued.id });
      expect(listed).not.toHaveProperty("token");
      expect(listed).not.toHaveProperty("lastUsedAt");
      expect(await harness.security.revokeBuildToken({ now, tokenId: issued.id })).toBeNull();
      expect(await harness.security.revokeImportToken({ now, tokenId: build.id })).toBeNull();

      // Use is recorded at most once per minute.
      const first = await harness.security.resolveImportToken({
        now: unixMilliseconds(SECURITY_CONTRACT_EPOCH + 5),
        token: issued.token,
      });
      expect(first).toMatchObject({
        creator: { id: admin.id, role: "admin" },
        token: { id: issued.id, lastUsedAt: SECURITY_CONTRACT_EPOCH + 5 },
      });
      await harness.security.resolveImportToken({
        now: unixMilliseconds(SECURITY_CONTRACT_EPOCH + 30_000),
        token: issued.token,
      });
      expect((await harness.security.listImportTokens())[0]).toMatchObject({
        lastUsedAt: SECURITY_CONTRACT_EPOCH + 5,
      });
      await harness.security.resolveImportToken({
        now: unixMilliseconds(SECURITY_CONTRACT_EPOCH + 60_005),
        token: issued.token,
      });
      expect((await harness.security.listImportTokens())[0]).toMatchObject({
        lastUsedAt: SECURITY_CONTRACT_EPOCH + 60_005,
      });

      // Expiry is exclusive and an expired use records nothing.
      await expect(
        harness.security.resolveImportToken({
          now: unixMilliseconds(Number(expiresAt) - 1),
          token: issued.token,
        }),
      ).resolves.not.toBeNull();
      await expect(
        harness.security.resolveImportToken({ now: expiresAt, token: issued.token }),
      ).resolves.toBeNull();
      expect((await harness.security.listImportTokens())[0]).toMatchObject({
        lastUsedAt: Number(expiresAt) - 1,
      });
      await expect(
        harness.security.resolveImportToken({ now, token: "B".repeat(43) as never }),
      ).resolves.toBeNull();

      // Revocation is idempotent and keeps the record listed.
      const revoked = await harness.security.revokeImportToken({
        now: unixMilliseconds(SECURITY_CONTRACT_EPOCH + 10),
        tokenId: issued.id,
      });
      expect(revoked).toMatchObject({ revokedAt: SECURITY_CONTRACT_EPOCH + 10 });
      expect(
        await harness.security.revokeImportToken({
          now: unixMilliseconds(SECURITY_CONTRACT_EPOCH + 20),
          tokenId: issued.id,
        }),
      ).toMatchObject({ revokedAt: SECURITY_CONTRACT_EPOCH + 10 });
      await expect(
        harness.security.resolveImportToken({ now, token: issued.token }),
      ).resolves.toBeNull();
      expect(await harness.security.revokeImportToken({ now, tokenId: "missing" })).toBeNull();
      await expect(harness.security.verifyBuildToken({ now, token: build.token })).resolves.toBe(
        true,
      );
    },
  },
  {
    name: "account security events revoke only the creator's import credentials",
    async run(runtime, expect) {
      const harness = await runtime.open();
      const { user: admin } = await bootstrapped(harness);
      const now = unixMilliseconds(SECURITY_CONTRACT_EPOCH);
      const expiresAt = unixMilliseconds(SECURITY_CONTRACT_EPOCH + 24 * hour);
      const editor = await createUserByInvitation(harness.security, {
        email: "editor@lace.test",
        invitedBy: admin.id,
        password,
        role: "editor",
      });
      const issue = (createdBy: string, name: string) =>
        harness.security.createImportToken({
          capabilities: ["content:import"],
          createdBy,
          expiresAt,
          name,
          now,
        });
      const active = async (value: { readonly token: OpaqueTokenSecret }) =>
        (await harness.security.resolveImportToken({ now, token: value.token })) !== null;
      const build = await harness.security.createBuildToken({ name: "builder", now });

      // Ordinary sign-out and role changes keep credentials; the creator's role is re-read.
      const kept = await issue(editor.id, "kept");
      await insertSession(harness, { id: "s1", userId: editor.id });
      await harness.security.deleteSession({ sessionId: "s1", userId: editor.id });
      await harness.security.updateUser({ role: "viewer", userId: editor.id });
      expect(await harness.security.resolveImportToken({ now, token: kept.token })).toMatchObject({
        creator: { role: "viewer" },
      });
      await harness.security.updateUser({ role: "editor", userId: editor.id });

      // Disable revokes; re-enabling does not restore; other users keep theirs.
      const adminToken = await issue(admin.id, "admin");
      await harness.security.disableUser({ userId: editor.id });
      expect(await active(kept)).toBe(false);
      await harness.security.updateUser({ disabled: false, userId: editor.id });
      expect(await active(kept)).toBe(false);
      expect(
        (await harness.security.listImportTokens()).find((value) => value.id === kept.id),
      ).toMatchObject({ revokedAt: expect.any(Number) });
      expect(await active(adminToken)).toBe(true);

      // Administrator sign-out-everywhere.
      const everywhere = await issue(editor.id, "everywhere");
      await harness.security.deleteUserSessions({ userId: editor.id });
      expect(await active(everywhere)).toBe(false);

      // Password change keeps credentials unless it ends other sessions.
      const changed = await issue(editor.id, "changed");
      await harness.security.changePassword({
        currentPassword: password,
        newPassword: password,
        now,
        userId: editor.id,
      });
      expect(await active(changed)).toBe(true);
      await harness.security.changePassword({
        currentPassword: password,
        keepSessionId: "none",
        newPassword: password,
        now,
        userId: editor.id,
      });
      expect(await active(changed)).toBe(false);

      // Other-session sign-out.
      const others = await issue(editor.id, "others");
      await harness.security.deleteOtherSessions({ keepSessionId: "none", userId: editor.id });
      expect(await active(others)).toBe(false);

      // Password reset confirmation.
      const reset = await issue(editor.id, "reset");
      const issued = await harness.security.issuePasswordReset({
        now,
        target: { userId: editor.id },
      });
      if (issued.status !== "issued") throw new Error("expected a reset");
      await harness.security.confirmPasswordReset({
        now,
        password: "brand new password",
        token: issued.token,
      });
      expect(await active(reset)).toBe(false);

      expect(await active(adminToken)).toBe(true);
      await expect(harness.security.verifyBuildToken({ now, token: build.token })).resolves.toBe(
        true,
      );
    },
  },
];
