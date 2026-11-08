import {
  SENSITIVE_RATE_LIMIT_POLICIES,
  type AccountSecurityPort,
  type RateLimitDecision,
  type SecurityService,
  type SensitiveRateLimitOperation,
  type SensitiveRateLimiter,
  type SessionSecurityPort,
  type TokenSecurityPort,
  type UserProfileReader,
} from "@lacecms/application";
import type { UnixMilliseconds } from "@lacecms/domain";
import type { D1Database } from "./d1.js";
import { D1AccountSecurity } from "./security/account.js";
import { encoder, hex } from "./security/secrets.js";
import { D1SessionSecurity } from "./security/session.js";
import { D1TokenSecurity } from "./security/token.js";

/**
 * D1 implementation of the cross-runtime security state protocol. Each port
 * lives in its own module under `security/`; this class delegates to them.
 * Every guarded decision is evaluated by the statement that writes; multi-row
 * changes are one atomic `batch()`.
 */
export class D1SecurityService implements SecurityService {
  private readonly account: D1AccountSecurity;
  private readonly session: D1SessionSecurity;
  private readonly token: D1TokenSecurity;

  public constructor(database: D1Database, now: () => UnixMilliseconds) {
    this.account = new D1AccountSecurity(database, now);
    this.session = new D1SessionSecurity(database, now);
    this.token = new D1TokenSecurity(database, now);
  }

  public isSetupComplete(): ReturnType<AccountSecurityPort["isSetupComplete"]> {
    return this.account.isSetupComplete();
  }
  public bootstrap(
    input: Parameters<AccountSecurityPort["bootstrap"]>[0],
  ): ReturnType<AccountSecurityPort["bootstrap"]> {
    return this.account.bootstrap(input);
  }
  public readUserProfile(userId: string): ReturnType<UserProfileReader["readUserProfile"]> {
    return this.account.readUserProfile(userId);
  }
  public listUsers(): ReturnType<AccountSecurityPort["listUsers"]> {
    return this.account.listUsers();
  }
  public updateUser(
    input: Parameters<AccountSecurityPort["updateUser"]>[0],
  ): ReturnType<AccountSecurityPort["updateUser"]> {
    return this.account.updateUser(input);
  }
  public disableUser(
    input: Parameters<AccountSecurityPort["disableUser"]>[0],
  ): ReturnType<AccountSecurityPort["disableUser"]> {
    return this.account.disableUser(input);
  }
  public createInvitation(
    input: Parameters<AccountSecurityPort["createInvitation"]>[0],
  ): ReturnType<AccountSecurityPort["createInvitation"]> {
    return this.account.createInvitation(input);
  }
  public listInvitations(): ReturnType<AccountSecurityPort["listInvitations"]> {
    return this.account.listInvitations();
  }
  public inspectInvitation(
    input: Parameters<AccountSecurityPort["inspectInvitation"]>[0],
  ): ReturnType<AccountSecurityPort["inspectInvitation"]> {
    return this.account.inspectInvitation(input);
  }
  public acceptInvitation(
    input: Parameters<AccountSecurityPort["acceptInvitation"]>[0],
  ): ReturnType<AccountSecurityPort["acceptInvitation"]> {
    return this.account.acceptInvitation(input);
  }
  public reissueInvitation(
    input: Parameters<AccountSecurityPort["reissueInvitation"]>[0],
  ): ReturnType<AccountSecurityPort["reissueInvitation"]> {
    return this.account.reissueInvitation(input);
  }
  public revokeInvitation(
    input: Parameters<AccountSecurityPort["revokeInvitation"]>[0],
  ): ReturnType<AccountSecurityPort["revokeInvitation"]> {
    return this.account.revokeInvitation(input);
  }
  public issuePasswordReset(
    input: Parameters<AccountSecurityPort["issuePasswordReset"]>[0],
  ): ReturnType<AccountSecurityPort["issuePasswordReset"]> {
    return this.account.issuePasswordReset(input);
  }
  public confirmPasswordReset(
    input: Parameters<AccountSecurityPort["confirmPasswordReset"]>[0],
  ): ReturnType<AccountSecurityPort["confirmPasswordReset"]> {
    return this.account.confirmPasswordReset(input);
  }
  public updateDisplayName(
    input: Parameters<AccountSecurityPort["updateDisplayName"]>[0],
  ): ReturnType<AccountSecurityPort["updateDisplayName"]> {
    return this.account.updateDisplayName(input);
  }
  public changePassword(
    input: Parameters<AccountSecurityPort["changePassword"]>[0],
  ): ReturnType<AccountSecurityPort["changePassword"]> {
    return this.account.changePassword(input);
  }

  public listSessions(
    input: Parameters<SessionSecurityPort["listSessions"]>[0],
  ): ReturnType<SessionSecurityPort["listSessions"]> {
    return this.session.listSessions(input);
  }
  public deleteSession(
    input: Parameters<SessionSecurityPort["deleteSession"]>[0],
  ): ReturnType<SessionSecurityPort["deleteSession"]> {
    return this.session.deleteSession(input);
  }
  public deleteOtherSessions(
    input: Parameters<SessionSecurityPort["deleteOtherSessions"]>[0],
  ): ReturnType<SessionSecurityPort["deleteOtherSessions"]> {
    return this.session.deleteOtherSessions(input);
  }
  public deleteUserSessions(
    input: Parameters<SessionSecurityPort["deleteUserSessions"]>[0],
  ): ReturnType<SessionSecurityPort["deleteUserSessions"]> {
    return this.session.deleteUserSessions(input);
  }

  public createSetupToken(): ReturnType<TokenSecurityPort["createSetupToken"]> {
    return this.token.createSetupToken();
  }
  public createBuildToken(
    input: Parameters<TokenSecurityPort["createBuildToken"]>[0],
  ): ReturnType<TokenSecurityPort["createBuildToken"]> {
    return this.token.createBuildToken(input);
  }
  public listBuildTokens(): ReturnType<TokenSecurityPort["listBuildTokens"]> {
    return this.token.listBuildTokens();
  }
  public revokeBuildToken(
    input: Parameters<TokenSecurityPort["revokeBuildToken"]>[0],
  ): ReturnType<TokenSecurityPort["revokeBuildToken"]> {
    return this.token.revokeBuildToken(input);
  }
  public verifyBuildToken(
    input: Parameters<TokenSecurityPort["verifyBuildToken"]>[0],
  ): ReturnType<TokenSecurityPort["verifyBuildToken"]> {
    return this.token.verifyBuildToken(input);
  }
  public createImportToken(
    input: Parameters<TokenSecurityPort["createImportToken"]>[0],
  ): ReturnType<TokenSecurityPort["createImportToken"]> {
    return this.token.createImportToken(input);
  }
  public listImportTokens(): ReturnType<TokenSecurityPort["listImportTokens"]> {
    return this.token.listImportTokens();
  }
  public revokeImportToken(
    input: Parameters<TokenSecurityPort["revokeImportToken"]>[0],
  ): ReturnType<TokenSecurityPort["revokeImportToken"]> {
    return this.token.revokeImportToken(input);
  }
  public resolveImportToken(
    input: Parameters<TokenSecurityPort["resolveImportToken"]>[0],
  ): ReturnType<TokenSecurityPort["resolveImportToken"]> {
    return this.token.resolveImportToken(input);
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
    const policy = SENSITIVE_RATE_LIMIT_POLICIES[input.operation];
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
