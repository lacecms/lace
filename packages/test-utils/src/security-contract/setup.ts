import {
  password,
  hour,
  bootstrapped,
  SECURITY_CONTRACT_EPOCH,
  type SecurityContractCase,
} from "./harness.js";

/** Every setup outcome is the same typed not-found failure, so the API answers one 404. */
const setupNotFound = { code: "NOT_FOUND", name: "AccountError" };

export const cases: readonly SecurityContractCase[] = [
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
      await expect(harness.security.createSetupToken()).rejects.toMatchObject(setupNotFound);
      await expect(
        harness.security.bootstrap({ email: "admin@lace.test", password, token: setup.token }),
      ).rejects.toMatchObject(setupNotFound);
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
      ).rejects.toMatchObject(setupNotFound);
      await harness.security.bootstrap({ email: "admin@lace.test", password, token: setup.token });
      await harness.sql.run(
        "update installation_state set setup_completed_at = null, setup_admin_user_id = null",
      );
      await harness.sql.run("update setup_tokens set consumed_at = null");
      await expect(
        harness.security.bootstrap({ email: "other@lace.test", password, token: setup.token }),
      ).rejects.toMatchObject(setupNotFound);
      const fresh = await harness.security.createSetupToken();
      harness.setNow(SECURITY_CONTRACT_EPOCH + hour);
      await expect(
        harness.security.bootstrap({ email: "late@lace.test", password, token: fresh.token }),
      ).rejects.toMatchObject(setupNotFound);
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
];
