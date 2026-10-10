import { randomBytes, createHash, createHmac, timingSafeEqual } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import {
  opaqueTokenSecret,
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

  public async createUser(input: {
    readonly email: string;
    readonly password: string;
    readonly role: SecurityRole;
  }): Promise<ManagedUser> {
    const now = this.now();
    const email = normalizedEmail(input.email);
    const id = randomBytes(16).toString("hex");
    const password = await hashPassword(input.password);
    this.connection.transaction(() => {
      this.connection
        .prepare(
          "insert into user (id, name, email, email_verified, role, disabled, created_at, updated_at) values (?, ?, ?, 0, ?, 0, ?, ?)",
        )
        .run(id, email, email, input.role, Number(now), Number(now));
      this.connection
        .prepare(
          "insert into account (id, account_id, provider_id, user_id, password, created_at, updated_at) values (?, ?, 'credential', ?, ?, ?, ?)",
        )
        .run(`credential-${id}`, id, id, password, Number(now), Number(now));
    })();
    return user(
      this.connection
        .prepare("select id, email, role, disabled from user where id = ?")
        .get(id) as Record<string, unknown>,
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
      return user(
        this.connection
          .prepare("select id, email, role, disabled from user where id = ?")
          .get(id) as Record<string, unknown>,
      );
    })();
    return result;
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
    readonly operation: "auth" | "email" | "setup" | "token" | "upload";
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
