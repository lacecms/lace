import { randomBytes, createHash, createHmac, timingSafeEqual } from "node:crypto";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import {
  INVITATION_TTL_MS,
  PASSWORD_RESET_TTL_MS,
  actorDisplayName,
  opaqueTokenSecret,
  type AcceptInvitationResult,
  type ChangePasswordResult,
  type CreateInvitationResult,
  type InvitationRecord,
  type IssuePasswordResetResult,
  type ReissueInvitationResult,
  type SensitiveRateLimitOperation,
  type SessionRecord,
  type BuildTokenMetadata,
  type IssuedBuildToken,
  type ManagedUser,
  type OpaqueTokenSecret,
  type SecurityRole,
  type SecurityService,
  type SensitiveRateLimiter,
  type RateLimitDecision,
} from "@lacecms/application";
import { DomainError, unixMilliseconds, type UnixMilliseconds } from "@lacecms/domain";
import type Database from "better-sqlite3";

const setupExpiryMs = 60 * 60 * 1000;
const limits = {
  auth: { limit: 10, windowMs: 15 * 60 * 1000 },
  email: { limit: 5, windowMs: 60 * 60 * 1000 },
  invite: { limit: 20, windowMs: 60 * 60 * 1000 },
  reset: { limit: 3, windowMs: 60 * 60 * 1000 },
  setup: { limit: 5, windowMs: 60 * 60 * 1000 },
  token: { limit: 20, windowMs: 60 * 60 * 1000 },
  upload: { limit: 30, windowMs: 60 * 1000 },
} as const;

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizedEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (email.length === 0 || !email.includes("@")) throw new TypeError("Invalid email.");
  return email;
}

function tokenSecret(): OpaqueTokenSecret {
  return opaqueTokenSecret(randomBytes(32).toString("base64url"));
}

function role(value: unknown): SecurityRole {
  if (value === "admin" || value === "editor" || value === "viewer") return value;
  throw new TypeError("Invalid role.");
}

function user(row: Record<string, unknown>): ManagedUser {
  return Object.freeze({
    disabled: row.disabled === 1,
    email: String(row.email),
    id: String(row.id),
    role: role(row.role),
  });
}

function profile(row: Record<string, unknown>): {
  readonly disabled: boolean;
  readonly email: string;
  readonly name?: string;
} {
  const name = typeof row.name === "string" ? row.name.trim() : "";
  return Object.freeze({
    disabled: Number(row.disabled) === 1,
    email: String(row.email),
    ...(name.length === 0 ? {} : { name }),
  });
}

const INVITATION_COLUMNS_SQL =
  "select i.id, i.email, i.role, i.invited_by, i.created_at, i.expires_at, u.name as inviter_name from invitations i left join user u on u.id = i.invited_by";
const ACTIVE_INVITATION_SQL = "accepted_at is null and revoked_at is null";

function invitation(row: Record<string, unknown>): InvitationRecord {
  return Object.freeze({
    createdAt: unixMilliseconds(Number(row.created_at)),
    email: String(row.email),
    expiresAt: unixMilliseconds(Number(row.expires_at)),
    id: String(row.id),
    invitedBy: String(row.invited_by),
    invitedByName: actorDisplayName(
      String(row.invited_by),
      typeof row.inviter_name === "string" ? row.inviter_name : null,
    ),
    role: role(row.role),
  });
}

function session(row: Record<string, unknown>): SessionRecord {
  return Object.freeze({
    createdAt: unixMilliseconds(Number(row.created_at)),
    id: String(row.id),
    lastActiveAt: unixMilliseconds(Number(row.updated_at)),
    ...(typeof row.user_agent === "string" && row.user_agent.length > 0
      ? { userAgent: row.user_agent }
      : {}),
  });
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && /UNIQUE constraint failed/u.test(error.message);
}

function buildToken(row: Record<string, unknown>): BuildTokenMetadata {
  return Object.freeze({
    capabilities: ["content:build:read"] as const,
    createdAt: unixMilliseconds(Number(row.created_at)),
    id: String(row.id),
    ...(row.last_used_at === null
      ? {}
      : { lastUsedAt: unixMilliseconds(Number(row.last_used_at)) }),
    name: String(row.name),
    ...(row.revoked_at === null ? {} : { revokedAt: unixMilliseconds(Number(row.revoked_at)) }),
    tokenPrefix: String(row.token_prefix),
  });
}

/** SQLite implementation of the cross-runtime security state protocol. */
export class NodeSecurityService implements SecurityService {
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

  public async createSetupToken(): Promise<{
    readonly expiresAt: UnixMilliseconds;
    readonly token: OpaqueTokenSecret;
  }> {
    const now = this.now();
    const token = tokenSecret();
    this.connection.transaction(() => {
      const state = this.connection
        .prepare("select setup_completed_at from installation_state where singleton_key = 1")
        .get() as { setup_completed_at: number | null } | undefined;
      if (state?.setup_completed_at !== null && state !== undefined)
        throw new Error("Setup already completed.");
      this.connection
        .prepare("insert or ignore into installation_state (singleton_key) values (1)")
        .run();
      this.connection
        .prepare("insert into setup_tokens (token_hash, expires_at, created_at) values (?, ?, ?)")
        .run(digest(token), Number(now) + setupExpiryMs, Number(now));
    })();
    return Object.freeze({ expiresAt: unixMilliseconds(Number(now) + setupExpiryMs), token });
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
        throw new Error("Setup unavailable.");
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
        throw new Error("Setup credential is invalid.");
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
    if (account.role !== "admin") throw new Error("Setup claim user is not an administrator.");
    this.connection.transaction(() => {
      const completed = this.connection
        .prepare(
          "update installation_state set setup_completed_at = ?, setup_admin_user_id = ? where singleton_key = 1 and setup_completed_at is null",
        )
        .run(Number(now), account!.id);
      if (completed.changes === 0) throw new Error("Setup unavailable.");
      this.connection
        .prepare("update setup_tokens set consumed_at = ? where consumed_at is null")
        .run(Number(now));
    })();
    return Object.freeze({ user: user(account) });
  }

  public async readUserProfile(userId: string): Promise<{
    readonly disabled: boolean;
    readonly email: string;
    readonly name?: string;
  } | null> {
    const row = this.connection
      .prepare("select email, name, disabled from user where id = ?")
      .get(userId) as Record<string, unknown> | undefined;
    return row === undefined ? null : profile(row);
  }

  public async listUsers(): Promise<readonly ManagedUser[]> {
    return this.connection
      .prepare("select id, email, role, disabled from user order by email")
      .all()
      .map((row) => user(row as Record<string, unknown>));
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
    if (value === null) throw new Error("User not found.");
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
      if (disabled === true)
        this.connection.prepare("delete from session where user_id = ?").run(id);
      return user(
        this.connection
          .prepare("select id, email, role, disabled from user where id = ?")
          .get(id) as Record<string, unknown>,
      );
    })();
    return result;
  }

  private loadInvitation(id: string): InvitationRecord {
    return invitation(
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
            role(input.role),
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
      .map((row) => invitation(row as Record<string, unknown>));
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
          role: role(row.role),
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
        .run(id, input.displayName ?? email, email, role(found.role), now, now);
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
        user: user(
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
      const revoked =
        input.keepSessionId === undefined
          ? 0
          : this.connection
              .prepare("delete from session where user_id = ? and id <> ?")
              .run(input.userId, input.keepSessionId).changes;
      return Object.freeze({ revoked, status: "changed" });
    })();
  }

  public async listSessions(input: {
    readonly now: UnixMilliseconds;
    readonly userId: string;
  }): Promise<readonly SessionRecord[]> {
    return this.connection
      .prepare(
        "select id, created_at, updated_at, user_agent from session where user_id = ? and expires_at > ? order by updated_at desc, id",
      )
      .all(input.userId, Number(input.now))
      .map((row) => session(row as Record<string, unknown>));
  }

  public async deleteSession(input: {
    readonly sessionId: string;
    readonly userId: string;
  }): Promise<boolean> {
    return (
      this.connection
        .prepare("delete from session where id = ? and user_id = ?")
        .run(input.sessionId, input.userId).changes === 1
    );
  }

  public async deleteOtherSessions(input: {
    readonly keepSessionId: string;
    readonly userId: string;
  }): Promise<number> {
    return this.connection
      .prepare("delete from session where user_id = ? and id <> ?")
      .run(input.userId, input.keepSessionId).changes;
  }

  public async deleteUserSessions(input: { readonly userId: string }): Promise<number | null> {
    return this.connection.transaction(() => {
      if (
        this.connection.prepare("select 1 from user where id = ?").get(input.userId) === undefined
      )
        return null;
      return this.connection.prepare("delete from session where user_id = ?").run(input.userId)
        .changes;
    })();
  }

  public async createBuildToken(input: {
    readonly name: string;
    readonly now: UnixMilliseconds;
  }): Promise<IssuedBuildToken> {
    const token = tokenSecret();
    const id = randomBytes(16).toString("hex");
    const prefix = token.slice(0, 8);
    this.connection
      .prepare(
        "insert into api_tokens (id, name, token_prefix, token_hash, capabilities_json, created_at) values (?, ?, ?, ?, ?, ?)",
      )
      .run(id, input.name, prefix, digest(token), '["content:build:read"]', Number(input.now));
    return Object.freeze({
      ...buildToken(
        this.connection.prepare("select * from api_tokens where id = ?").get(id) as Record<
          string,
          unknown
        >,
      ),
      token,
    });
  }
  public async listBuildTokens(): Promise<readonly BuildTokenMetadata[]> {
    return this.connection
      .prepare("select * from api_tokens order by created_at desc")
      .all()
      .map((row) => buildToken(row as Record<string, unknown>));
  }
  public async revokeBuildToken(input: {
    readonly tokenId: string;
    readonly now: UnixMilliseconds;
  }): Promise<BuildTokenMetadata | null> {
    this.connection
      .prepare("update api_tokens set revoked_at = coalesce(revoked_at, ?) where id = ?")
      .run(Number(input.now), input.tokenId);
    const row = this.connection
      .prepare("select * from api_tokens where id = ?")
      .get(input.tokenId) as Record<string, unknown> | undefined;
    return row === undefined ? null : buildToken(row);
  }
  public async verifyBuildToken(input: {
    readonly token: OpaqueTokenSecret;
    readonly now: UnixMilliseconds;
  }): Promise<boolean> {
    const candidate = Buffer.from(digest(input.token));
    const rows = this.connection
      .prepare("select id, token_hash from api_tokens where revoked_at is null")
      .all() as { id: string; token_hash: string }[];
    const matches = rows.map((row) => ({
      row,
      equal: timingSafeEqual(Buffer.from(row.token_hash), candidate),
    }));
    const matched = matches.find((value) => value.equal)?.row;
    if (matched === undefined) return false;
    this.connection
      .prepare("update api_tokens set last_used_at = ? where id = ?")
      .run(Number(input.now), matched.id);
    return true;
  }
}

export class NodeFixedWindowRateLimiter implements SensitiveRateLimiter {
  public constructor(
    private readonly connection: Database.Database,
    private readonly secret: string,
  ) {}
  public async check(input: {
    readonly operation: SensitiveRateLimitOperation;
    readonly subject: string;
    readonly now: UnixMilliseconds;
  }): Promise<RateLimitDecision> {
    const policy = limits[input.operation];
    const now = Number(input.now);
    const start = Math.floor(now / policy.windowMs) * policy.windowMs;
    const expiry = start + policy.windowMs;
    const key = createHmac("sha256", this.secret)
      .update(`${input.operation}:${input.subject}`)
      .digest("hex");
    const row = this.connection
      .prepare(
        "select request_count, window_started_at from rate_limit_buckets where bucket_key = ?",
      )
      .get(key) as { request_count: number; window_started_at: number } | undefined;
    const count = row === undefined || row.window_started_at !== start ? 1 : row.request_count + 1;
    this.connection
      .prepare(
        "insert into rate_limit_buckets (bucket_key, window_started_at, request_count, expires_at) values (?, ?, ?, ?) on conflict(bucket_key) do update set window_started_at = excluded.window_started_at, request_count = excluded.request_count, expires_at = excluded.expires_at",
      )
      .run(key, start, count, expiry);
    return Object.freeze({
      allowed: count <= policy.limit,
      retryAfterSeconds: Math.max(1, Math.ceil((expiry - now) / 1000)),
    });
  }
}
