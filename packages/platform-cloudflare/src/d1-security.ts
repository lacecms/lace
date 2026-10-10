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
  type RateLimitDecision,
  type SecurityRole,
  type SecurityService,
  type SensitiveRateLimiter,
} from "@lacecms/application";
import { DomainError, unixMilliseconds, type UnixMilliseconds } from "@lacecms/domain";
import type { D1Database, D1PreparedStatement } from "./d1.js";

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
const encoder = new TextEncoder();
const SETUP_COMPLETED_SQL =
  "exists (select 1 from installation_state where singleton_key = 1 and setup_completed_at is not null)";
const USER_COLUMNS_SQL = "select id, email, role, disabled from user";
const INVITATION_COLUMNS_SQL =
  "select i.id, i.email, i.role, i.invited_by, i.created_at, i.expires_at, u.name as inviter_name from invitations i left join user u on u.id = i.invited_by";
const ACTIVE_INVITATION_SQL = "accepted_at is null and revoked_at is null";

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function digest(value: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const value of bytes) binary += String.fromCharCode(value);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function randomHex(length: number): string {
  return hex(crypto.getRandomValues(new Uint8Array(length)).buffer);
}

function tokenSecret(): OpaqueTokenSecret {
  return opaqueTokenSecret(base64Url(crypto.getRandomValues(new Uint8Array(32))));
}

/** Compares equal-length digests without an early exit on the first differing byte. */
function constantTimeEqual(left: string, right: string): boolean {
  let difference = left.length ^ right.length;
  for (let index = 0; index < left.length; index += 1)
    difference |= left.charCodeAt(index) ^ (right.charCodeAt(index % right.length) || 0);
  return difference === 0;
}

function normalizedEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (email.length === 0 || !email.includes("@")) throw new TypeError("Invalid email.");
  return email;
}

function role(value: unknown): SecurityRole {
  if (value === "admin" || value === "editor" || value === "viewer") return value;
  throw new TypeError("Invalid role.");
}

function user(row: Record<string, unknown>): ManagedUser {
  return Object.freeze({
    disabled: Number(row.disabled) === 1,
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

/**
 * D1 implementation of the cross-runtime security state protocol. Every guarded
 * decision is evaluated by the statement that writes; multi-row changes are one
 * atomic `batch()`.
 */
export class D1SecurityService implements SecurityService {
  public constructor(
    private readonly database: D1Database,
    private readonly now: () => UnixMilliseconds,
  ) {}

  public async createSetupToken(): Promise<{
    readonly expiresAt: UnixMilliseconds;
    readonly token: OpaqueTokenSecret;
  }> {
    const now = Number(this.now());
    const token = tokenSecret();
    const [, minted] = await this.database.batch([
      this.statement("insert or ignore into installation_state (singleton_key) values (1)"),
      this.statement(
        `insert into setup_tokens (token_hash, expires_at, created_at) select ?, ?, ? where not ${SETUP_COMPLETED_SQL}`,
        await digest(token),
        now + setupExpiryMs,
        now,
      ),
    ]);
    if (minted?.meta.changes !== 1) throw new Error("Setup already completed.");
    return Object.freeze({ expiresAt: unixMilliseconds(now + setupExpiryMs), token });
  }

  public async bootstrap(input: {
    readonly email: string;
    readonly password: string;
    readonly token: OpaqueTokenSecret;
  }): Promise<{ readonly user: ManagedUser }> {
    const now = Number(this.now());
    const email = normalizedEmail(input.email);
    const tokenHash = await digest(input.token);
    const emailHash = await digest(email);
    if (await this.isSetupComplete()) throw new Error("Setup unavailable.");
    const claimed = await this.statement(
      `update setup_tokens set claimed_email_hash = coalesce(claimed_email_hash, ?1), claimed_at = coalesce(claimed_at, ?2) where token_hash = ?3 and expires_at > ?2 and consumed_at is null and (claimed_email_hash is null or claimed_email_hash = ?1) and not ${SETUP_COMPLETED_SQL}`,
      emailHash,
      now,
      tokenHash,
    ).run();
    if (claimed.meta.changes !== 1) throw new Error("Setup credential is invalid.");
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
      throw new Error("Setup claim user is not an administrator.");
    const [completed] = await this.database.batch([
      this.statement(
        "update installation_state set setup_completed_at = ?, setup_admin_user_id = ? where singleton_key = 1 and setup_completed_at is null",
        now,
        account.id,
      ),
      this.statement(
        "update setup_tokens set consumed_at = ?1 where consumed_at is null and exists (select 1 from installation_state where singleton_key = 1 and setup_admin_user_id = ?2 and setup_completed_at = ?1)",
        now,
        account.id,
      ),
    ]);
    if (completed?.meta.changes !== 1) throw new Error("Setup unavailable.");
    return Object.freeze({ user: account });
  }

  public async readUserProfile(userId: string): Promise<{
    readonly disabled: boolean;
    readonly email: string;
    readonly name?: string;
  } | null> {
    const row = await this.statement(
      "select email, name, disabled from user where id = ?",
      userId,
    ).first();
    return row === null ? null : profile(row);
  }

  public async listUsers(): Promise<readonly ManagedUser[]> {
    const rows = await this.statement(`${USER_COLUMNS_SQL} order by email`).all();
    return rows.results.map((row) => user(row));
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
    if (value === null) throw new Error("User not found.");
    return value;
  }

  private async loadInvitation(id: string): Promise<InvitationRecord> {
    const row = await this.statement(`${INVITATION_COLUMNS_SQL} where i.id = ?`, id).first();
    if (row === null) throw new Error("Invitation could not be reloaded.");
    return invitation(row);
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
        this.statement(
          `update invitations set revoked_at = ?1 where email = ?2 and ${ACTIVE_INVITATION_SQL} and expires_at <= ?1`,
          now,
          email,
        ),
        this.statement(
          "insert into invitations (id, email, role, token_hash, invited_by, created_at, expires_at) select ?1, ?2, ?3, ?4, ?5, ?6, ?7 where not exists (select 1 from user where email = ?2)",
          id,
          email,
          role(input.role),
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
    const rows = await this.statement(
      `${INVITATION_COLUMNS_SQL} where i.accepted_at is null and i.revoked_at is null order by i.created_at desc, i.id desc`,
    ).all();
    return rows.results.map((row) => invitation(row));
  }

  public async inspectInvitation(input: {
    readonly now: UnixMilliseconds;
    readonly token: OpaqueTokenSecret;
  }): Promise<{
    readonly email: string;
    readonly expiresAt: UnixMilliseconds;
    readonly role: SecurityRole;
  } | null> {
    const row = await this.statement(
      `select email, role, expires_at from invitations where token_hash = ? and ${ACTIVE_INVITATION_SQL} and expires_at > ?`,
      await digest(input.token),
      Number(input.now),
    ).first();
    return row === null
      ? null
      : Object.freeze({
          email: String(row.email),
          expiresAt: unixMilliseconds(Number(row.expires_at)),
          role: role(row.role),
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
        this.statement(
          `insert into user (id, name, email, email_verified, role, disabled, created_at, updated_at) select ?1, coalesce(?4, email), email, 0, role, 0, ?3, ?3 from invitations where ${active}`,
          id,
          tokenHash,
          now,
          input.displayName ?? null,
        ),
        this.statement(
          "insert into account (id, account_id, provider_id, user_id, password, created_at, updated_at) select 'credential-' || id, id, 'credential', id, ?2, ?3, ?3 from user where id = ?1",
          id,
          password,
          now,
        ),
        this.statement(
          `update invitations set accepted_at = ?3, accepted_user_id = ?1 where ${active} and exists (select 1 from user where id = ?1)`,
          id,
          tokenHash,
          now,
        ),
        this.statement(`${USER_COLUMNS_SQL} where id = ?`, id),
      ]);
    } catch (error) {
      if (isUniqueViolation(error)) {
        const valid = await this.statement(
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
    return Object.freeze({ status: "accepted", user: user(created) });
  }

  public async reissueInvitation(input: {
    readonly invitationId: string;
    readonly now: UnixMilliseconds;
  }): Promise<ReissueInvitationResult> {
    const token = tokenSecret();
    const [changed, row] = await this.database.batch([
      this.statement(
        `update invitations set token_hash = ?1, expires_at = ?2 where id = ?3 and ${ACTIVE_INVITATION_SQL} and not exists (select 1 from user where user.email = invitations.email)`,
        await digest(token),
        Number(input.now) + INVITATION_TTL_MS,
        input.invitationId,
      ),
      this.statement(
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
      this.statement(
        `update invitations set revoked_at = ? where id = ? and ${ACTIVE_INVITATION_SQL}`,
        Number(input.now),
        input.invitationId,
      ),
      this.statement("select accepted_at from invitations where id = ?", input.invitationId),
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
        ? await this.statement(
            "select id, email, disabled from user where email = ?",
            normalizedEmail(input.target.email),
          ).first()
        : await this.statement(
            "select id, email, disabled from user where id = ?",
            input.target.userId,
          ).first();
    if (row === null) return Object.freeze({ status: "not_found" });
    if (Number(row.disabled) === 1) return Object.freeze({ status: "disabled" });
    const token = tokenSecret();
    const [, issued] = await this.database.batch([
      this.statement(
        "delete from password_reset_tokens where user_id = ? and consumed_at is null",
        row.id,
      ),
      this.statement(
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
    const [claimed, , , , , row] = await this.database.batch([
      this.statement(
        "insert into mutation_guards (token, created_at) select ?1, ?3 where exists (select 1 from password_reset_tokens t join user u on u.id = t.user_id where t.token_hash = ?2 and t.consumed_at is null and t.expires_at > ?3 and u.disabled = 0)",
        guard,
        tokenHash,
        now,
      ),
      this.statement(
        `update password_reset_tokens set consumed_at = ?3 where token_hash = ?2 and ${guarded}`,
        guard,
        tokenHash,
        now,
      ),
      this.statement(
        `update account set password = ?4, updated_at = ?3 where user_id = ${owner} and provider_id = 'credential' and ${guarded}`,
        guard,
        tokenHash,
        now,
        password,
      ),
      this.statement(
        `delete from session where user_id = ${owner} and ${guarded}`,
        guard,
        tokenHash,
      ),
      this.statement("delete from mutation_guards where token = ?", guard),
      this.statement("select user_id from password_reset_tokens where token_hash = ?", tokenHash),
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
    const result = await this.statement(
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
    const current = await this.statement(
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
      this.statement(
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
        this.statement(
          "delete from session where user_id = ?1 and id <> ?2 and exists (select 1 from account where user_id = ?1 and provider_id = 'credential' and password = ?3)",
          input.userId,
          input.keepSessionId,
          password,
        ),
      );
    const [changed, revoked] = await this.database.batch(statements);
    if (changed?.meta.changes !== 1) return Object.freeze({ status: "invalid_credentials" });
    return Object.freeze({ revoked: revoked?.meta.changes ?? 0, status: "changed" });
  }

  public async listSessions(input: {
    readonly now: UnixMilliseconds;
    readonly userId: string;
  }): Promise<readonly SessionRecord[]> {
    const rows = await this.statement(
      "select id, created_at, updated_at, user_agent from session where user_id = ? and expires_at > ? order by updated_at desc, id",
      input.userId,
      Number(input.now),
    ).all();
    return rows.results.map((row) => session(row));
  }

  public async deleteSession(input: {
    readonly sessionId: string;
    readonly userId: string;
  }): Promise<boolean> {
    const result = await this.statement(
      "delete from session where id = ? and user_id = ?",
      input.sessionId,
      input.userId,
    ).run();
    return result.meta.changes === 1;
  }

  public async deleteOtherSessions(input: {
    readonly keepSessionId: string;
    readonly userId: string;
  }): Promise<number> {
    const result = await this.statement(
      "delete from session where user_id = ? and id <> ?",
      input.userId,
      input.keepSessionId,
    ).run();
    return result.meta.changes;
  }

  public async deleteUserSessions(input: { readonly userId: string }): Promise<number | null> {
    const [found, deleted] = await this.database.batch([
      this.statement("select 1 as found from user where id = ?", input.userId),
      this.statement("delete from session where user_id = ?", input.userId),
    ]);
    return found?.results[0] === undefined ? null : (deleted?.meta.changes ?? 0);
  }

  public async createBuildToken(input: {
    readonly name: string;
    readonly now: UnixMilliseconds;
  }): Promise<IssuedBuildToken> {
    const token = tokenSecret();
    const id = randomHex(16);
    await this.statement(
      "insert into api_tokens (id, name, token_prefix, token_hash, capabilities_json, created_at) values (?, ?, ?, ?, ?, ?)",
      id,
      input.name,
      token.slice(0, 8),
      await digest(token),
      '["content:build:read"]',
      Number(input.now),
    ).run();
    const row = await this.statement("select * from api_tokens where id = ?", id).first();
    if (row === null) throw new Error("Build token could not be reloaded.");
    return Object.freeze({ ...buildToken(row), token });
  }

  public async listBuildTokens(): Promise<readonly BuildTokenMetadata[]> {
    const rows = await this.statement("select * from api_tokens order by created_at desc").all();
    return rows.results.map((row) => buildToken(row));
  }

  public async revokeBuildToken(input: {
    readonly tokenId: string;
    readonly now: UnixMilliseconds;
  }): Promise<BuildTokenMetadata | null> {
    const [, row] = await this.database.batch([
      this.statement(
        "update api_tokens set revoked_at = coalesce(revoked_at, ?) where id = ?",
        Number(input.now),
        input.tokenId,
      ),
      this.statement("select * from api_tokens where id = ?", input.tokenId),
    ]);
    const value = row?.results[0];
    return value === undefined ? null : buildToken(value);
  }

  public async verifyBuildToken(input: {
    readonly token: OpaqueTokenSecret;
    readonly now: UnixMilliseconds;
  }): Promise<boolean> {
    const candidate = await digest(input.token);
    const rows = await this.statement(
      "select id, token_hash from api_tokens where revoked_at is null",
    ).all<{ id: string; token_hash: string }>();
    let matched: string | undefined;
    for (const row of rows.results)
      if (constantTimeEqual(row.token_hash, candidate) && matched === undefined) matched = row.id;
    if (matched === undefined) return false;
    const used = await this.statement(
      "update api_tokens set last_used_at = ? where id = ? and revoked_at is null",
      Number(input.now),
      matched,
    ).run();
    return used.meta.changes === 1;
  }

  public async isSetupComplete(): Promise<boolean> {
    return (
      (await this.statement(`select 1 as completed where ${SETUP_COMPLETED_SQL}`).first()) !== null
    );
  }

  private async userByEmail(email: string): Promise<ManagedUser | undefined> {
    const row = await this.statement(`${USER_COLUMNS_SQL} where email = ?`, email).first();
    return row === null ? undefined : user(row);
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
      this.statement(
        "insert into user (id, name, email, email_verified, role, disabled, created_at, updated_at) values (?, ?, ?, 0, ?, 0, ?, ?)",
        id,
        email,
        email,
        nextRole,
        now,
        now,
      ),
      this.statement(
        "insert into account (id, account_id, provider_id, user_id, password, created_at, updated_at) values (?, ?, 'credential', ?, ?, ?, ?)",
        `credential-${id}`,
        id,
        id,
        hashed,
        now,
        now,
      ),
      this.statement(`${USER_COLUMNS_SQL} where id = ?`, id),
    ]);
    const value = row?.results[0];
    if (value === undefined) throw new Error("User could not be reloaded.");
    return user(value);
  }

  /** One statement applies the change only while another active administrator remains. */
  private async mutateUser(
    id: string,
    nextRole?: SecurityRole,
    disabled?: boolean,
  ): Promise<ManagedUser | null> {
    const [changed, , row] = await this.database.batch([
      this.statement(
        "update user set role = coalesce(?1, role), disabled = coalesce(?2, disabled), updated_at = ?3 where id = ?4 and not (role = 'admin' and disabled = 0 and (coalesce(?2, 0) = 1 or coalesce(?1, 'admin') <> 'admin') and (select count(*) from user where role = 'admin' and disabled = 0) <= 1)",
        nextRole === undefined ? null : role(nextRole),
        disabled === undefined ? null : Number(disabled),
        Number(this.now()),
        id,
      ),
      // Disabling ends every session in the same batch; a refused change deletes nothing.
      this.statement(
        "delete from session where user_id = ?1 and ?2 = 1 and exists (select 1 from user where id = ?1 and disabled = 1)",
        id,
        disabled === true ? 1 : 0,
      ),
      this.statement(`${USER_COLUMNS_SQL} where id = ?`, id),
    ]);
    const value = row?.results[0];
    if (value === undefined) return null;
    if (changed?.meta.changes !== 1)
      throw new DomainError("LAST_ADMIN_PROTECTED", "Last administrator cannot be changed.");
    return user(value);
  }

  private statement(sql: string, ...params: unknown[]): D1PreparedStatement {
    const statement = this.database.prepare(sql);
    return params.length === 0 ? statement : statement.bind(...params);
  }
}

/** Atomic fixed-window counter: one upsert increments or resets and returns the count. */
export class D1FixedWindowRateLimiter implements SensitiveRateLimiter {
  private key: Promise<CryptoKey> | undefined;

  public constructor(
    private readonly database: D1Database,
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
    this.key ??= crypto.subtle.importKey(
      "raw",
      encoder.encode(this.secret),
      { hash: "SHA-256", name: "HMAC" },
      false,
      ["sign"],
    );
    const bucketKey = hex(
      await crypto.subtle.sign(
        "HMAC",
        await this.key,
        encoder.encode(`${input.operation}:${input.subject}`),
      ),
    );
    const row = await this.database
      .prepare(
        "insert into rate_limit_buckets (bucket_key, window_started_at, request_count, expires_at) values (?1, ?2, 1, ?3) on conflict(bucket_key) do update set request_count = case when rate_limit_buckets.window_started_at = excluded.window_started_at then rate_limit_buckets.request_count + 1 else 1 end, window_started_at = excluded.window_started_at, expires_at = excluded.expires_at returning request_count",
      )
      .bind(bucketKey, start, expiry)
      .first<{ request_count: number }>();
    const count = Number(row?.request_count ?? Number.POSITIVE_INFINITY);
    return Object.freeze({
      allowed: count <= policy.limit,
      retryAfterSeconds: Math.max(1, Math.ceil((expiry - now) / 1000)),
    });
  }
}
