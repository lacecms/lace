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
import { randomBytes } from "node:crypto";
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
import type Database from "better-sqlite3";
import { digest, tokenSecret } from "./secrets.js";

/** SQLite setup, user, invitation, password-reset and profile commands. */
export class NodeAccountSecurity implements UserProfileReader, AccountSecurityPort {
  public constructor(
    private readonly connection: Database.Database,
    private readonly now: () => UnixMilliseconds,
  ) {}

  public async isSetupComplete(): Promise<boolean> {
    const state = this.connection
      .prepare("select setup_completed_at from installation_state where singleton_key = 1")
      .get() as { setup_completed_at: number | null } | undefined;
    return state !== undefined && state.setup_completed_at !== null;
  }

  public async bootstrap(input: {
    readonly email: string;
    readonly password: string;
    readonly token: OpaqueTokenSecret;
  }): Promise<{ readonly user: ManagedUser }> {
    const now = this.now();
    const email = normalizedEmail(input.email);
    const tokenHash = digest(input.token);
    const emailHash = digest(email);
    this.connection.transaction(() => {
      const state = this.connection
        .prepare("select setup_completed_at from installation_state where singleton_key = 1")
        .get() as { setup_completed_at: number | null } | undefined;
      if (state?.setup_completed_at !== null && state !== undefined)
        throw new AccountError("NOT_FOUND");
      const setup = this.connection
        .prepare(
          "select expires_at, consumed_at, claimed_email_hash from setup_tokens where token_hash = ?",
        )
        .get(tokenHash) as
        | { expires_at: number; consumed_at: number | null; claimed_email_hash: string | null }
        | undefined;
      if (
        setup === undefined ||
        setup.expires_at <= Number(now) ||
        setup.consumed_at !== null ||
        (setup.claimed_email_hash !== null && setup.claimed_email_hash !== emailHash)
      )
        throw new AccountError("NOT_FOUND");
      this.connection
        .prepare(
          "update setup_tokens set claimed_email_hash = ?, claimed_at = ? where token_hash = ? and claimed_email_hash is null",
        )
        .run(emailHash, Number(now), tokenHash);
    })();
    let account = this.connection
      .prepare("select id, email, role, disabled from user where email = ?")
      .get(email) as Record<string, unknown> | undefined;
    if (account === undefined) {
      const id = randomBytes(16).toString("hex");
      const password = await hashPassword(input.password);
      this.connection.transaction(() => {
        this.connection
          .prepare(
            "insert into user (id, name, email, email_verified, role, disabled, created_at, updated_at) values (?, ?, ?, 0, 'admin', 0, ?, ?)",
          )
          .run(id, email, email, Number(now), Number(now));
        this.connection
          .prepare(
            "insert into account (id, account_id, provider_id, user_id, password, created_at, updated_at) values (?, ?, 'credential', ?, ?, ?, ?)",
          )
          .run(`credential-${id}`, id, id, password, Number(now), Number(now));
      })();
      account = this.connection
        .prepare("select id, email, role, disabled from user where id = ?")
        .get(id) as Record<string, unknown>;
    }
    if (account.role !== "admin")
      throw new InvariantError("Setup claim user is not an administrator.");
    this.connection.transaction(() => {
      const completed = this.connection
        .prepare(
          "update installation_state set setup_completed_at = ?, setup_admin_user_id = ? where singleton_key = 1 and setup_completed_at is null",
        )
        .run(Number(now), account!.id);
      if (completed.changes === 0) throw new AccountError("NOT_FOUND");
      this.connection
        .prepare("update setup_tokens set consumed_at = ? where consumed_at is null")
        .run(Number(now));
    })();
    return Object.freeze({ user: managedUser(account) });
  }

  public async readUserProfile(userId: string): Promise<{
    readonly disabled: boolean;
    readonly email: string;
    readonly name?: string;
  } | null> {
    const row = this.connection
      .prepare("select email, name, disabled from user where id = ?")
      .get(userId) as Record<string, unknown> | undefined;
    return row === undefined ? null : userProfile(row);
  }

  public async listUsers(): Promise<readonly ManagedUser[]> {
    return this.connection
      .prepare("select id, email, role, disabled from user order by email")
      .all()
      .map((row) => managedUser(row as Record<string, unknown>));
  }

  public async updateUser(input: {
    readonly role?: SecurityRole;
    readonly userId: string;
    readonly disabled?: boolean;
  }): Promise<ManagedUser | null> {
    return this.mutateUser(input.userId, input.role, input.disabled);
  }
  public async disableUser(input: { readonly userId: string }): Promise<ManagedUser> {
    const value = this.mutateUser(input.userId, undefined, true);
    if (value === null) throw new AccountError("NOT_FOUND");
    return value;
  }
  private mutateUser(id: string, nextRole?: SecurityRole, disabled?: boolean): ManagedUser | null {
    const result = this.connection.transaction(() => {
      const current = this.connection
        .prepare("select id, email, role, disabled from user where id = ?")
        .get(id) as Record<string, unknown> | undefined;
      if (current === undefined) return null;
      const becomesInactiveAdmin =
        current.role === "admin" &&
        current.disabled === 0 &&
        (disabled === true || (nextRole !== undefined && nextRole !== "admin"));
      if (becomesInactiveAdmin) {
        const count = this.connection
          .prepare("select count(*) as count from user where role = 'admin' and disabled = 0")
          .get() as { count: number };
        if (count.count <= 1)
          throw new DomainError("LAST_ADMIN_PROTECTED", "Last administrator cannot be changed.");
      }
      this.connection
        .prepare(
          "update user set role = coalesce(?, role), disabled = coalesce(?, disabled), updated_at = ? where id = ?",
        )
        .run(nextRole ?? null, disabled === undefined ? null : Number(disabled), Date.now(), id);
      if (disabled === true) {
        this.connection.prepare(oauthUserInvalidationSql()).run(Number(this.now()), id);
        this.connection.prepare(importTokenUserInvalidationSql()).run(Number(this.now()), id);
        this.connection.prepare("delete from session where user_id = ?").run(id);
      }
      return managedUser(
        this.connection
          .prepare("select id, email, role, disabled from user where id = ?")
          .get(id) as Record<string, unknown>,
      );
    })();
    return result;
  }

  private loadInvitation(id: string): InvitationRecord {
    return invitationRecord(
      this.connection.prepare(`${INVITATION_COLUMNS_SQL} where i.id = ?`).get(id) as Record<
        string,
        unknown
      >,
    );
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
    const id = randomBytes(16).toString("hex");
    try {
      const created = this.connection.transaction(() => {
        if (this.connection.prepare("select 1 from user where email = ?").get(email) !== undefined)
          return false;
        // An expired invitation no longer blocks a fresh one for the same address.
        this.connection
          .prepare(
            `update invitations set revoked_at = ? where email = ? and ${ACTIVE_INVITATION_SQL} and expires_at <= ?`,
          )
          .run(now, email, now);
        this.connection
          .prepare(
            "insert into invitations (id, email, role, token_hash, invited_by, created_at, expires_at) values (?, ?, ?, ?, ?, ?, ?)",
          )
          .run(
            id,
            email,
            securityRole(input.role),
            digest(token),
            input.invitedBy,
            now,
            now + INVITATION_TTL_MS,
          );
        return true;
      })();
      if (!created) return Object.freeze({ status: "conflict" });
    } catch (error) {
      if (isUniqueViolation(error)) return Object.freeze({ status: "conflict" });
      throw error;
    }
    return Object.freeze({ invitation: this.loadInvitation(id), status: "created", token });
  }

  public async listInvitations(): Promise<readonly InvitationRecord[]> {
    return this.connection
      .prepare(
        `${INVITATION_COLUMNS_SQL} where i.accepted_at is null and i.revoked_at is null order by i.created_at desc, i.id desc`,
      )
      .all()
      .map((row) => invitationRecord(row as Record<string, unknown>));
  }

  public async inspectInvitation(input: {
    readonly now: UnixMilliseconds;
    readonly token: OpaqueTokenSecret;
  }): Promise<{
    readonly email: string;
    readonly expiresAt: UnixMilliseconds;
    readonly role: SecurityRole;
  } | null> {
    const row = this.connection
      .prepare(
        `select email, role, expires_at from invitations where token_hash = ? and ${ACTIVE_INVITATION_SQL} and expires_at > ?`,
      )
      .get(digest(input.token), Number(input.now)) as Record<string, unknown> | undefined;
    return row === undefined
      ? null
      : Object.freeze({
          email: String(row.email),
          expiresAt: unixMilliseconds(Number(row.expires_at)),
          role: securityRole(row.role),
        });
  }

  public async acceptInvitation(input: {
    readonly displayName?: string;
    readonly now: UnixMilliseconds;
    readonly password: string;
    readonly token: OpaqueTokenSecret;
  }): Promise<AcceptInvitationResult> {
    const now = Number(input.now);
    const tokenHash = digest(input.token);
    const password = await hashPassword(input.password);
    const id = randomBytes(16).toString("hex");
    return this.connection.transaction((): AcceptInvitationResult => {
      const found = this.connection
        .prepare(
          `select id, email, role from invitations where token_hash = ? and ${ACTIVE_INVITATION_SQL} and expires_at > ?`,
        )
        .get(tokenHash, now) as Record<string, unknown> | undefined;
      if (found === undefined) return Object.freeze({ status: "invalid" });
      const email = String(found.email);
      if (this.connection.prepare("select 1 from user where email = ?").get(email) !== undefined)
        return Object.freeze({ status: "conflict" });
      this.connection
        .prepare(
          "insert into user (id, name, email, email_verified, role, disabled, created_at, updated_at) values (?, ?, ?, 0, ?, 0, ?, ?)",
        )
        .run(id, input.displayName ?? email, email, securityRole(found.role), now, now);
      this.connection
        .prepare(
          "insert into account (id, account_id, provider_id, user_id, password, created_at, updated_at) values (?, ?, 'credential', ?, ?, ?, ?)",
        )
        .run(`credential-${id}`, id, id, password, now, now);
      this.connection
        .prepare(
          "update invitations set accepted_at = ?, accepted_user_id = ? where id = ? and accepted_at is null",
        )
        .run(now, id, found.id);
      return Object.freeze({
        status: "accepted",
        user: managedUser(
          this.connection
            .prepare("select id, email, role, disabled from user where id = ?")
            .get(id) as Record<string, unknown>,
        ),
      });
    })();
  }

  public async reissueInvitation(input: {
    readonly invitationId: string;
    readonly now: UnixMilliseconds;
  }): Promise<ReissueInvitationResult> {
    const now = Number(input.now);
    const token = tokenSecret();
    const outcome = this.connection.transaction((): "conflict" | "not_found" | "reissued" => {
      const row = this.connection
        .prepare("select email, accepted_at, revoked_at from invitations where id = ?")
        .get(input.invitationId) as Record<string, unknown> | undefined;
      if (row === undefined || row.revoked_at !== null) return "not_found";
      if (row.accepted_at !== null) return "conflict";
      if (
        this.connection.prepare("select 1 from user where email = ?").get(row.email) !== undefined
      )
        return "conflict";
      this.connection
        .prepare("update invitations set token_hash = ?, expires_at = ? where id = ?")
        .run(digest(token), now + INVITATION_TTL_MS, input.invitationId);
      return "reissued";
    })();
    return outcome === "reissued"
      ? Object.freeze({
          invitation: this.loadInvitation(input.invitationId),
          status: outcome,
          token,
        })
      : Object.freeze({ status: outcome });
  }

  public async revokeInvitation(input: {
    readonly invitationId: string;
    readonly now: UnixMilliseconds;
  }): Promise<"conflict" | "not_found" | "revoked"> {
    return this.connection.transaction(() => {
      const revoked = this.connection
        .prepare(`update invitations set revoked_at = ? where id = ? and ${ACTIVE_INVITATION_SQL}`)
        .run(Number(input.now), input.invitationId);
      if (revoked.changes === 1) return "revoked" as const;
      const row = this.connection
        .prepare("select accepted_at from invitations where id = ?")
        .get(input.invitationId) as { accepted_at: number | null } | undefined;
      return row !== undefined && row.accepted_at !== null
        ? ("conflict" as const)
        : ("not_found" as const);
    })();
  }

  public async issuePasswordReset(input: {
    readonly now: UnixMilliseconds;
    readonly requestedBy?: string;
    readonly target: { readonly email: string } | { readonly userId: string };
  }): Promise<IssuePasswordResetResult> {
    const now = Number(input.now);
    const token = tokenSecret();
    return this.connection.transaction((): IssuePasswordResetResult => {
      const row = (
        "email" in input.target
          ? this.connection
              .prepare("select id, email, disabled from user where email = ?")
              .get(normalizedEmail(input.target.email))
          : this.connection
              .prepare("select id, email, disabled from user where id = ?")
              .get(input.target.userId)
      ) as Record<string, unknown> | undefined;
      if (row === undefined) return Object.freeze({ status: "not_found" });
      if (Number(row.disabled) === 1) return Object.freeze({ status: "disabled" });
      this.connection
        .prepare("delete from password_reset_tokens where user_id = ? and consumed_at is null")
        .run(row.id);
      this.connection
        .prepare(
          "insert into password_reset_tokens (token_hash, user_id, created_at, expires_at, requested_by) values (?, ?, ?, ?, ?)",
        )
        .run(digest(token), row.id, now, now + PASSWORD_RESET_TTL_MS, input.requestedBy ?? null);
      return Object.freeze({
        email: String(row.email),
        status: "issued",
        token,
        userId: String(row.id),
      });
    })();
  }

  public async confirmPasswordReset(input: {
    readonly now: UnixMilliseconds;
    readonly password: string;
    readonly token: OpaqueTokenSecret;
  }): Promise<
    { readonly status: "reset"; readonly userId: string } | { readonly status: "invalid" }
  > {
    const now = Number(input.now);
    const tokenHash = digest(input.token);
    const password = await hashPassword(input.password);
    return this.connection.transaction(() => {
      const row = this.connection
        .prepare(
          "select t.user_id from password_reset_tokens t join user u on u.id = t.user_id where t.token_hash = ? and t.consumed_at is null and t.expires_at > ? and u.disabled = 0",
        )
        .get(tokenHash, now) as { user_id: string } | undefined;
      if (row === undefined) return Object.freeze({ status: "invalid" as const });
      this.connection
        .prepare("update password_reset_tokens set consumed_at = ? where token_hash = ?")
        .run(now, tokenHash);
      this.connection
        .prepare(
          "update account set password = ?, updated_at = ? where user_id = ? and provider_id = 'credential'",
        )
        .run(password, now, row.user_id);
      this.connection.prepare(oauthUserInvalidationSql()).run(now, row.user_id);
      this.connection.prepare(importTokenUserInvalidationSql()).run(now, row.user_id);
      this.connection.prepare("delete from session where user_id = ?").run(row.user_id);
      return Object.freeze({ status: "reset" as const, userId: row.user_id });
    })();
  }

  public async updateDisplayName(input: {
    readonly displayName: string;
    readonly now: UnixMilliseconds;
    readonly userId: string;
  }): Promise<boolean> {
    return (
      this.connection
        .prepare("update user set name = ?, updated_at = ? where id = ?")
        .run(input.displayName, Number(input.now), input.userId).changes === 1
    );
  }

  public async changePassword(input: {
    readonly currentPassword: string;
    readonly keepSessionId?: string;
    readonly newPassword: string;
    readonly now: UnixMilliseconds;
    readonly userId: string;
  }): Promise<ChangePasswordResult> {
    const current = this.connection
      .prepare("select password from account where user_id = ? and provider_id = 'credential'")
      .get(input.userId) as { password: string | null } | undefined;
    if (
      current?.password === null ||
      current === undefined ||
      !(await verifyPassword({ hash: current.password, password: input.currentPassword }))
    )
      return Object.freeze({ status: "invalid_credentials" });
    const password = await hashPassword(input.newPassword);
    return this.connection.transaction((): ChangePasswordResult => {
      const changed = this.connection
        .prepare(
          "update account set password = ?, updated_at = ? where user_id = ? and provider_id = 'credential' and password = ?",
        )
        .run(password, Number(input.now), input.userId, current.password);
      if (changed.changes !== 1) return Object.freeze({ status: "invalid_credentials" });
      if (input.keepSessionId !== undefined) {
        this.connection.prepare(oauthUserInvalidationSql()).run(Number(input.now), input.userId);
        this.connection
          .prepare(importTokenUserInvalidationSql())
          .run(Number(input.now), input.userId);
      }
      const revoked =
        input.keepSessionId === undefined
          ? 0
          : this.connection
              .prepare("delete from session where user_id = ? and id <> ?")
              .run(input.userId, input.keepSessionId).changes;
      return Object.freeze({ revoked, status: "changed" });
    })();
  }
}
