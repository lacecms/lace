import {
  ACTIVE_INVITATION_SQL,
  INVITATION_COLUMNS_SQL,
  importTokenUserInvalidationSql,
  invitationRecord,
  isUniqueViolation,
  managedUser,
  normalizedEmail,
  oauthUserInvalidationSql,
  securityRole,
  userProfile,
} from "@lacecms/db";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import {
  INVITATION_TTL_MS,
  PASSWORD_RESET_TTL_MS,
  type AcceptInvitationResult,
  type AccountSecurityPort,
  type ChangePasswordResult,
  type CreateInvitationResult,
  type InvitationRecord,
  type IssuePasswordResetResult,
  type ManagedUser,
  type OpaqueTokenSecret,
  type ReissueInvitationResult,
  type SecurityRole,
  type UserProfileReader,
} from "@lacecms/application";
import { InvariantError } from "@lacecms/content";
import {
  AccountError,
  DomainError,
  unixMilliseconds,
  type UnixMilliseconds,
} from "@lacecms/domain";
import type { D1Database } from "../d1/database.js";
import { digest, randomHex, tokenSecret } from "./secrets.js";
import { SETUP_COMPLETED_SQL, bindStatement } from "./statements.js";

const USER_COLUMNS_SQL = "select id, email, role, disabled from user";

/**
 * D1 setup, user, invitation, password-reset and profile commands. Every guarded
 * decision is evaluated by the statement that writes; multi-row changes are one
 * atomic `batch()`.
 */
export class D1AccountSecurity implements UserProfileReader, AccountSecurityPort {
  public constructor(
    private readonly database: D1Database,
    private readonly now: () => UnixMilliseconds,
  ) {}

  public async bootstrap(input: {
    readonly email: string;
    readonly password: string;
    readonly token: OpaqueTokenSecret;
  }): Promise<{ readonly user: ManagedUser }> {
    const now = Number(this.now());
    const email = normalizedEmail(input.email);
    const tokenHash = await digest(input.token);
    const emailHash = await digest(email);
    if (await this.isSetupComplete()) throw new AccountError("NOT_FOUND");
    const claimed = await bindStatement(
      this.database,
      `update setup_tokens set claimed_email_hash = coalesce(claimed_email_hash, ?1), claimed_at = coalesce(claimed_at, ?2) where token_hash = ?3 and expires_at > ?2 and consumed_at is null and (claimed_email_hash is null or claimed_email_hash = ?1) and not ${SETUP_COMPLETED_SQL}`,
      emailHash,
      now,
      tokenHash,
    ).run();
    if (claimed.meta.changes !== 1) throw new AccountError("NOT_FOUND");
    let account = await this.userByEmail(email);
    if (account === undefined) {
      try {
        account = await this.insertUser(email, input.password, "admin", now);
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        account = await this.userByEmail(email);
      }
    }
    if (account === undefined || account.role !== "admin")
      throw new InvariantError("Setup claim user is not an administrator.");
    const [completed] = await this.database.batch([
      bindStatement(
        this.database,
        "update installation_state set setup_completed_at = ?, setup_admin_user_id = ? where singleton_key = 1 and setup_completed_at is null",
        now,
        account.id,
      ),
      bindStatement(
        this.database,
        "update setup_tokens set consumed_at = ?1 where consumed_at is null and exists (select 1 from installation_state where singleton_key = 1 and setup_admin_user_id = ?2 and setup_completed_at = ?1)",
        now,
        account.id,
      ),
    ]);
    if (completed?.meta.changes !== 1) throw new AccountError("NOT_FOUND");
    return Object.freeze({ user: account });
  }

  public async readUserProfile(userId: string): Promise<{
    readonly disabled: boolean;
    readonly email: string;
    readonly name?: string;
  } | null> {
    const row = await bindStatement(
      this.database,
      "select email, name, disabled from user where id = ?",
      userId,
    ).first();
    return row === null ? null : userProfile(row);
  }

  public async listUsers(): Promise<readonly ManagedUser[]> {
    const rows = await bindStatement(this.database, `${USER_COLUMNS_SQL} order by email`).all();
    return rows.results.map((row) => managedUser(row));
  }

  public async updateUser(input: {
    readonly role?: SecurityRole;
    readonly userId: string;
    readonly disabled?: boolean;
  }): Promise<ManagedUser | null> {
    return this.mutateUser(input.userId, input.role, input.disabled);
  }

  public async disableUser(input: { readonly userId: string }): Promise<ManagedUser> {
    const value = await this.mutateUser(input.userId, undefined, true);
    if (value === null) throw new AccountError("NOT_FOUND");
    return value;
  }

  private async loadInvitation(id: string): Promise<InvitationRecord> {
    const row = await bindStatement(
      this.database,
      `${INVITATION_COLUMNS_SQL} where i.id = ?`,
      id,
    ).first();
    if (row === null) throw new InvariantError("Invitation could not be reloaded.");
    return invitationRecord(row);
  }

  public async createInvitation(input: {
    readonly email: string;
    readonly invitedBy: string;
    readonly now: UnixMilliseconds;
    readonly role: SecurityRole;
  }): Promise<CreateInvitationResult> {
    const email = normalizedEmail(input.email);
    const now = Number(input.now);
    const token = tokenSecret();
    const id = randomHex(16);
    let inserted: number | undefined;
    try {
      const [, created] = await this.database.batch([
        // An expired invitation no longer blocks a fresh one for the same address.
        bindStatement(
          this.database,
          `update invitations set revoked_at = ?1 where email = ?2 and ${ACTIVE_INVITATION_SQL} and expires_at <= ?1`,
          now,
          email,
        ),
        bindStatement(
          this.database,
          "insert into invitations (id, email, role, token_hash, invited_by, created_at, expires_at) select ?1, ?2, ?3, ?4, ?5, ?6, ?7 where not exists (select 1 from user where email = ?2)",
          id,
          email,
          securityRole(input.role),
          await digest(token),
          input.invitedBy,
          now,
          now + INVITATION_TTL_MS,
        ),
      ]);
      inserted = created?.meta.changes;
    } catch (error) {
      if (isUniqueViolation(error)) return Object.freeze({ status: "conflict" });
      throw error;
    }
    if (inserted !== 1) return Object.freeze({ status: "conflict" });
    return Object.freeze({ invitation: await this.loadInvitation(id), status: "created", token });
  }

  public async listInvitations(): Promise<readonly InvitationRecord[]> {
    const rows = await bindStatement(
      this.database,
      `${INVITATION_COLUMNS_SQL} where i.accepted_at is null and i.revoked_at is null order by i.created_at desc, i.id desc`,
    ).all();
    return rows.results.map((row) => invitationRecord(row));
  }

  public async inspectInvitation(input: {
    readonly now: UnixMilliseconds;
    readonly token: OpaqueTokenSecret;
  }): Promise<{
    readonly email: string;
    readonly expiresAt: UnixMilliseconds;
    readonly role: SecurityRole;
  } | null> {
    const row = await bindStatement(
      this.database,
      `select email, role, expires_at from invitations where token_hash = ? and ${ACTIVE_INVITATION_SQL} and expires_at > ?`,
      await digest(input.token),
      Number(input.now),
    ).first();
    return row === null
      ? null
      : Object.freeze({
          email: String(row.email),
          expiresAt: unixMilliseconds(Number(row.expires_at)),
          role: securityRole(row.role),
        });
  }

  /**
   * One atomic batch: the user insert is conditional on the active invitation,
   * the credential is selected from that user, and the invitation update repeats
   * the predicate. Concurrent batches serialize, so exactly one acceptance wins.
   */
  public async acceptInvitation(input: {
    readonly displayName?: string;
    readonly now: UnixMilliseconds;
    readonly password: string;
    readonly token: OpaqueTokenSecret;
  }): Promise<AcceptInvitationResult> {
    const now = Number(input.now);
    const tokenHash = await digest(input.token);
    const password = await hashPassword(input.password);
    const id = randomHex(16);
    const active = `token_hash = ?2 and ${ACTIVE_INVITATION_SQL} and expires_at > ?3`;
    let results: Awaited<ReturnType<D1Database["batch"]>>;
    try {
      results = await this.database.batch([
        bindStatement(
          this.database,
          `insert into user (id, name, email, email_verified, role, disabled, created_at, updated_at) select ?1, coalesce(?4, email), email, 0, role, 0, ?3, ?3 from invitations where ${active}`,
          id,
          tokenHash,
          now,
          input.displayName ?? null,
        ),
        bindStatement(
          this.database,
          "insert into account (id, account_id, provider_id, user_id, password, created_at, updated_at) select 'credential-' || id, id, 'credential', id, ?2, ?3, ?3 from user where id = ?1",
          id,
          password,
          now,
        ),
        bindStatement(
          this.database,
          `update invitations set accepted_at = ?3, accepted_user_id = ?1 where ${active} and exists (select 1 from user where id = ?1)`,
          id,
          tokenHash,
          now,
        ),
        bindStatement(this.database, `${USER_COLUMNS_SQL} where id = ?`, id),
      ]);
    } catch (error) {
      if (isUniqueViolation(error)) {
        const valid = await bindStatement(
          this.database,
          `select 1 from invitations where token_hash = ? and ${ACTIVE_INVITATION_SQL} and expires_at > ?`,
          tokenHash,
          now,
        ).first();
        return Object.freeze({ status: valid === null ? "invalid" : "conflict" });
      }
      throw error;
    }
    const created = results[3]?.results[0];
    if (results[0]?.meta.changes !== 1 || created === undefined)
      return Object.freeze({ status: "invalid" });
    return Object.freeze({ status: "accepted", user: managedUser(created) });
  }

  public async reissueInvitation(input: {
    readonly invitationId: string;
    readonly now: UnixMilliseconds;
  }): Promise<ReissueInvitationResult> {
    const token = tokenSecret();
    const [changed, row] = await this.database.batch([
      bindStatement(
        this.database,
        `update invitations set token_hash = ?1, expires_at = ?2 where id = ?3 and ${ACTIVE_INVITATION_SQL} and not exists (select 1 from user where user.email = invitations.email)`,
        await digest(token),
        Number(input.now) + INVITATION_TTL_MS,
        input.invitationId,
      ),
      bindStatement(
        this.database,
        "select accepted_at, revoked_at from invitations where id = ?",
        input.invitationId,
      ),
    ]);
    if (changed?.meta.changes === 1)
      return Object.freeze({
        invitation: await this.loadInvitation(input.invitationId),
        status: "reissued",
        token,
      });
    const value = row?.results[0];
    return Object.freeze({
      status: value === undefined || value.revoked_at !== null ? "not_found" : "conflict",
    });
  }

  public async revokeInvitation(input: {
    readonly invitationId: string;
    readonly now: UnixMilliseconds;
  }): Promise<"conflict" | "not_found" | "revoked"> {
    const [changed, row] = await this.database.batch([
      bindStatement(
        this.database,
        `update invitations set revoked_at = ? where id = ? and ${ACTIVE_INVITATION_SQL}`,
        Number(input.now),
        input.invitationId,
      ),
      bindStatement(
        this.database,
        "select accepted_at from invitations where id = ?",
        input.invitationId,
      ),
    ]);
    if (changed?.meta.changes === 1) return "revoked";
    const value = row?.results[0];
    return value !== undefined && value.accepted_at !== null ? "conflict" : "not_found";
  }

  public async issuePasswordReset(input: {
    readonly now: UnixMilliseconds;
    readonly requestedBy?: string;
    readonly target: { readonly email: string } | { readonly userId: string };
  }): Promise<IssuePasswordResetResult> {
    const now = Number(input.now);
    const row =
      "email" in input.target
        ? await bindStatement(
            this.database,
            "select id, email, disabled from user where email = ?",
            normalizedEmail(input.target.email),
          ).first()
        : await bindStatement(
            this.database,
            "select id, email, disabled from user where id = ?",
            input.target.userId,
          ).first();
    if (row === null) return Object.freeze({ status: "not_found" });
    if (Number(row.disabled) === 1) return Object.freeze({ status: "disabled" });
    const token = tokenSecret();
    const [, issued] = await this.database.batch([
      bindStatement(
        this.database,
        "delete from password_reset_tokens where user_id = ? and consumed_at is null",
        row.id,
      ),
      bindStatement(
        this.database,
        "insert into password_reset_tokens (token_hash, user_id, created_at, expires_at, requested_by) select ?1, id, ?2, ?3, ?4 from user where id = ?5 and disabled = 0",
        await digest(token),
        now,
        now + PASSWORD_RESET_TTL_MS,
        input.requestedBy ?? null,
        row.id,
      ),
    ]);
    if (issued?.meta.changes !== 1) return Object.freeze({ status: "disabled" });
    return Object.freeze({
      email: String(row.email),
      status: "issued",
      token,
      userId: String(row.id),
    });
  }

  /** A batch-unique guard row admits exactly one consumer of a valid token. */
  public async confirmPasswordReset(input: {
    readonly now: UnixMilliseconds;
    readonly password: string;
    readonly token: OpaqueTokenSecret;
  }): Promise<
    { readonly status: "reset"; readonly userId: string } | { readonly status: "invalid" }
  > {
    const now = Number(input.now);
    const tokenHash = await digest(input.token);
    const password = await hashPassword(input.password);
    const guard = randomHex(16);
    const guarded = "exists (select 1 from mutation_guards where token = ?1)";
    const owner = "(select user_id from password_reset_tokens where token_hash = ?2)";
    const [claimed, , , , , , , row] = await this.database.batch([
      bindStatement(
        this.database,
        "insert into mutation_guards (token, created_at) select ?1, ?3 where exists (select 1 from password_reset_tokens t join user u on u.id = t.user_id where t.token_hash = ?2 and t.consumed_at is null and t.expires_at > ?3 and u.disabled = 0)",
        guard,
        tokenHash,
        now,
      ),
      bindStatement(
        this.database,
        `update password_reset_tokens set consumed_at = ?3 where token_hash = ?2 and ${guarded}`,
        guard,
        tokenHash,
        now,
      ),
      bindStatement(
        this.database,
        `update account set password = ?4, updated_at = ?3 where user_id = ${owner} and provider_id = 'credential' and ${guarded}`,
        guard,
        tokenHash,
        now,
        password,
      ),
      bindStatement(
        this.database,
        `delete from session where user_id = ${owner} and ${guarded}`,
        guard,
        tokenHash,
      ),
      bindStatement(
        this.database,
        oauthUserInvalidationSql(
          "id=(select user_id from password_reset_tokens where token_hash=?) and exists(select 1 from mutation_guards where token=?)",
        ),
        now,
        tokenHash,
        guard,
      ),
      bindStatement(
        this.database,
        importTokenUserInvalidationSql(
          "id=(select user_id from password_reset_tokens where token_hash=?) and exists(select 1 from mutation_guards where token=?)",
        ),
        now,
        tokenHash,
        guard,
      ),
      bindStatement(this.database, "delete from mutation_guards where token = ?", guard),
      bindStatement(
        this.database,
        "select user_id from password_reset_tokens where token_hash = ?",
        tokenHash,
      ),
    ]);
    const userId = row?.results[0]?.user_id;
    if (claimed?.meta.changes !== 1 || typeof userId !== "string")
      return Object.freeze({ status: "invalid" });
    return Object.freeze({ status: "reset", userId });
  }

  public async updateDisplayName(input: {
    readonly displayName: string;
    readonly now: UnixMilliseconds;
    readonly userId: string;
  }): Promise<boolean> {
    const result = await bindStatement(
      this.database,
      "update user set name = ?, updated_at = ? where id = ?",
      input.displayName,
      Number(input.now),
      input.userId,
    ).run();
    return result.meta.changes === 1;
  }

  public async changePassword(input: {
    readonly currentPassword: string;
    readonly keepSessionId?: string;
    readonly newPassword: string;
    readonly now: UnixMilliseconds;
    readonly userId: string;
  }): Promise<ChangePasswordResult> {
    const current = await bindStatement(
      this.database,
      "select password from account where user_id = ? and provider_id = 'credential'",
      input.userId,
    ).first<{ password: string | null }>();
    if (
      current === null ||
      current.password === null ||
      !(await verifyPassword({ hash: current.password, password: input.currentPassword }))
    )
      return Object.freeze({ status: "invalid_credentials" });
    const password = await hashPassword(input.newPassword);
    const statements = [
      bindStatement(
        this.database,
        "update account set password = ?1, updated_at = ?2 where user_id = ?3 and provider_id = 'credential' and password = ?4",
        password,
        Number(input.now),
        input.userId,
        current.password,
      ),
    ];
    if (input.keepSessionId !== undefined)
      statements.push(
        // The salted new hash exists only when this batch's update applied.
        bindStatement(
          this.database,
          "delete from session where user_id = ?1 and id <> ?2 and exists (select 1 from account where user_id = ?1 and provider_id = 'credential' and password = ?3)",
          input.userId,
          input.keepSessionId,
          password,
        ),
      );
    if (input.keepSessionId !== undefined)
      statements.push(
        bindStatement(
          this.database,
          oauthUserInvalidationSql(
            "id=? and exists(select 1 from account where user_id=? and provider_id='credential' and password=?)",
          ),
          Number(input.now),
          input.userId,
          input.userId,
          password,
        ),
        bindStatement(
          this.database,
          importTokenUserInvalidationSql(
            "id=? and exists(select 1 from account where user_id=? and provider_id='credential' and password=?)",
          ),
          Number(input.now),
          input.userId,
          input.userId,
          password,
        ),
      );
    const [changed, revoked] = await this.database.batch(statements);
    if (changed?.meta.changes !== 1) return Object.freeze({ status: "invalid_credentials" });
    return Object.freeze({ revoked: revoked?.meta.changes ?? 0, status: "changed" });
  }

  public async isSetupComplete(): Promise<boolean> {
    return (
      (await bindStatement(
        this.database,
        `select 1 as completed where ${SETUP_COMPLETED_SQL}`,
      ).first()) !== null
    );
  }

  private async userByEmail(email: string): Promise<ManagedUser | undefined> {
    const row = await bindStatement(
      this.database,
      `${USER_COLUMNS_SQL} where email = ?`,
      email,
    ).first();
    return row === null ? undefined : managedUser(row);
  }

  private async insertUser(
    email: string,
    password: string,
    nextRole: SecurityRole,
    now: number,
  ): Promise<ManagedUser> {
    const id = randomHex(16);
    const hashed = await hashPassword(password);
    const [, , row] = await this.database.batch([
      bindStatement(
        this.database,
        "insert into user (id, name, email, email_verified, role, disabled, created_at, updated_at) values (?, ?, ?, 0, ?, 0, ?, ?)",
        id,
        email,
        email,
        nextRole,
        now,
        now,
      ),
      bindStatement(
        this.database,
        "insert into account (id, account_id, provider_id, user_id, password, created_at, updated_at) values (?, ?, 'credential', ?, ?, ?, ?)",
        `credential-${id}`,
        id,
        id,
        hashed,
        now,
        now,
      ),
      bindStatement(this.database, `${USER_COLUMNS_SQL} where id = ?`, id),
    ]);
    const value = row?.results[0];
    if (value === undefined) throw new Error("User could not be reloaded.");
    return managedUser(value);
  }

  /** One statement applies the change only while another active administrator remains. */
  private async mutateUser(
    id: string,
    nextRole?: SecurityRole,
    disabled?: boolean,
  ): Promise<ManagedUser | null> {
    const [changed, , , , row] = await this.database.batch([
      bindStatement(
        this.database,
        "update user set role = coalesce(?1, role), disabled = coalesce(?2, disabled), updated_at = ?3 where id = ?4 and not (role = 'admin' and disabled = 0 and (coalesce(?2, 0) = 1 or coalesce(?1, 'admin') <> 'admin') and (select count(*) from user where role = 'admin' and disabled = 0) <= 1)",
        nextRole === undefined ? null : securityRole(nextRole),
        disabled === undefined ? null : Number(disabled),
        Number(this.now()),
        id,
      ),
      // Disabling ends every session in the same batch; a refused change deletes nothing.
      bindStatement(
        this.database,
        "delete from session where user_id = ?1 and ?2 = 1 and exists (select 1 from user where id = ?1 and disabled = 1)",
        id,
        disabled === true ? 1 : 0,
      ),
      bindStatement(
        this.database,
        oauthUserInvalidationSql("id=? and disabled=1 and ?=1"),
        Number(this.now()),
        id,
        disabled === true ? 1 : 0,
      ),
      bindStatement(
        this.database,
        importTokenUserInvalidationSql("id=? and disabled=1 and ?=1"),
        Number(this.now()),
        id,
        disabled === true ? 1 : 0,
      ),
      bindStatement(this.database, `${USER_COLUMNS_SQL} where id = ?`, id),
    ]);
    const value = row?.results[0];
    if (value === undefined) return null;
    if (changed?.meta.changes !== 1)
      throw new DomainError("LAST_ADMIN_PROTECTED", "Last administrator cannot be changed.");
    return managedUser(value);
  }
}
