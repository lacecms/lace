import { hashPassword } from "better-auth/crypto";
import {
  opaqueTokenSecret,
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
  setup: { limit: 5, windowMs: 60 * 60 * 1000 },
  token: { limit: 20, windowMs: 60 * 60 * 1000 },
  upload: { limit: 30, windowMs: 60 * 1000 },
} as const;
const encoder = new TextEncoder();
const SETUP_COMPLETED_SQL =
  "exists (select 1 from installation_state where singleton_key = 1 and setup_completed_at is not null)";
const USER_COLUMNS_SQL = "select id, email, role, disabled from user";

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

  public async createUser(input: {
    readonly email: string;
    readonly password: string;
    readonly role: SecurityRole;
  }): Promise<ManagedUser> {
    return this.insertUser(
      normalizedEmail(input.email),
      input.password,
      role(input.role),
      Number(this.now()),
    );
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
    const [changed, row] = await this.database.batch([
      this.statement(
        "update user set role = coalesce(?1, role), disabled = coalesce(?2, disabled), updated_at = ?3 where id = ?4 and not (role = 'admin' and disabled = 0 and (coalesce(?2, 0) = 1 or coalesce(?1, 'admin') <> 'admin') and (select count(*) from user where role = 'admin' and disabled = 0) <= 1)",
        nextRole === undefined ? null : role(nextRole),
        disabled === undefined ? null : Number(disabled),
        Number(this.now()),
        id,
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
    readonly operation: "auth" | "email" | "setup" | "token" | "upload";
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
