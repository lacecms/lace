import { createHmac } from "node:crypto";
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
import type Database from "better-sqlite3";
import { NodeAccountSecurity } from "./account.js";
import { NodeSessionSecurity } from "./session.js";
import { NodeTokenSecurity } from "./token.js";

/**
 * SQLite implementation of the cross-runtime security state protocol. Each port
 * lives in its own module under `security/`; this class delegates to them.
 */
export class NodeSecurityService implements SecurityService {
  private readonly account: NodeAccountSecurity;
  private readonly session: NodeSessionSecurity;
  private readonly token: NodeTokenSecurity;

  public constructor(connection: Database.Database, now: () => UnixMilliseconds) {
    this.account = new NodeAccountSecurity(connection, now);
    this.session = new NodeSessionSecurity(connection, now);
    this.token = new NodeTokenSecurity(connection, now);
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
    const policy = SENSITIVE_RATE_LIMIT_POLICIES[input.operation];
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
