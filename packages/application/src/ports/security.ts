import type { UnixMilliseconds } from "@lacecms/domain";
import type { OpaqueTokenSecret, OpaqueTokenVerifier } from "../shared/brands.js";

/** Persistence receives only the derived verifier, never an opaque secret. */
export interface OpaqueTokenHasher {
  hash(secret: OpaqueTokenSecret): Promise<OpaqueTokenVerifier>;
  verify(secret: OpaqueTokenSecret, verifier: OpaqueTokenVerifier): Promise<boolean>;
}

export type SecurityRole = "admin" | "editor" | "viewer";

export interface ManagedUser {
  readonly disabled: boolean;
  readonly email: string;
  readonly id: string;
  readonly role: SecurityRole;
}

export interface BuildTokenMetadata {
  readonly capabilities: readonly ["content:build:read"];
  readonly createdAt: UnixMilliseconds;
  readonly id: string;
  readonly lastUsedAt?: UnixMilliseconds;
  readonly name: string;
  readonly revokedAt?: UnixMilliseconds;
  readonly tokenPrefix: string;
}

export interface IssuedBuildToken extends BuildTokenMetadata {
  /** Returned exactly once by the creation command; never persisted or logged. */
  readonly token: OpaqueTokenSecret;
}

/** Import tokens may write content and media; publication is an optional extra (ADR 0016). */
export type ImportTokenCapabilities =
  | readonly ["content:import"]
  | readonly ["content:import", "content:publish"];

export interface ImportTokenMetadata {
  readonly capabilities: ImportTokenCapabilities;
  readonly createdAt: UnixMilliseconds;
  readonly createdBy: {
    readonly displayName?: string;
    readonly email: string;
    readonly id: string;
  };
  readonly expiresAt: UnixMilliseconds;
  readonly id: string;
  readonly lastUsedAt?: UnixMilliseconds;
  readonly name: string;
  readonly revokedAt?: UnixMilliseconds;
  readonly tokenPrefix: string;
}

export interface IssuedImportToken extends ImportTokenMetadata {
  /** Returned exactly once by the creation command; never persisted or logged. */
  readonly token: OpaqueTokenSecret;
}

/** An unexpired, unrevoked import token and its enabled creator's current role. */
export interface ResolvedImportToken {
  readonly creator: { readonly id: string; readonly role: string };
  readonly token: ImportTokenMetadata;
}

/** Reads the account fields the email use cases need, without credentials. */
export interface UserProfileReader {
  readUserProfile(userId: string): Promise<{
    readonly disabled: boolean;
    readonly email: string;
    readonly name?: string;
  } | null>;
}

/** An unaccepted, unrevoked invitation as stored; never carries its token or digest. */
export interface InvitationRecord {
  readonly createdAt: UnixMilliseconds;
  readonly email: string;
  readonly expiresAt: UnixMilliseconds;
  readonly id: string;
  readonly invitedBy: string;
  /** The inviter's display name with the shared fallbacks applied. */
  readonly invitedByName: string;
  readonly role: SecurityRole;
}

/** One stored session of a user; never carries the session token or IP address. */
export interface SessionRecord {
  readonly createdAt: UnixMilliseconds;
  readonly id: string;
  readonly lastActiveAt: UnixMilliseconds;
  readonly userAgent?: string;
}

export type CreateInvitationResult =
  | {
      readonly invitation: InvitationRecord;
      readonly status: "created";
      readonly token: OpaqueTokenSecret;
    }
  | { readonly status: "conflict" };

export type ReissueInvitationResult =
  | {
      readonly invitation: InvitationRecord;
      readonly status: "reissued";
      readonly token: OpaqueTokenSecret;
    }
  | { readonly status: "conflict" }
  | { readonly status: "not_found" };

export type AcceptInvitationResult =
  | { readonly status: "accepted"; readonly user: ManagedUser }
  | { readonly status: "conflict" }
  | { readonly status: "invalid" };

export type IssuePasswordResetResult =
  | {
      readonly email: string;
      readonly status: "issued";
      readonly token: OpaqueTokenSecret;
      readonly userId: string;
    }
  | { readonly status: "disabled" }
  | { readonly status: "not_found" };

export type ChangePasswordResult =
  | { readonly revoked: number; readonly status: "changed" }
  | { readonly status: "invalid_credentials" };

/**
 * Invitation, reset, profile, password and session commands. Tokens cross this
 * port only as plaintext inputs or once-returned outputs; adapters store digests.
 */
export interface AccountSecurityPort {
  /** Conflicts when the email has an account or an unexpired active invitation. */
  createInvitation(input: {
    readonly email: string;
    readonly invitedBy: string;
    readonly now: UnixMilliseconds;
    readonly role: SecurityRole;
  }): Promise<CreateInvitationResult>;
  /** Unaccepted, unrevoked invitations, newest first, including expired ones. */
  listInvitations(): Promise<readonly InvitationRecord[]>;
  /** Null for an unknown, expired, revoked or accepted token. */
  inspectInvitation(input: {
    readonly now: UnixMilliseconds;
    readonly token: OpaqueTokenSecret;
  }): Promise<{
    readonly email: string;
    readonly expiresAt: UnixMilliseconds;
    readonly role: SecurityRole;
  } | null>;
  /** Atomically creates the user and credential and marks the invitation accepted. */
  acceptInvitation(input: {
    readonly displayName?: string;
    readonly now: UnixMilliseconds;
    readonly password: string;
    readonly token: OpaqueTokenSecret;
  }): Promise<AcceptInvitationResult>;
  /** Rotates the token and restarts the expiry of an unaccepted, unrevoked invitation. */
  reissueInvitation(input: {
    readonly invitationId: string;
    readonly now: UnixMilliseconds;
  }): Promise<ReissueInvitationResult>;
  revokeInvitation(input: {
    readonly invitationId: string;
    readonly now: UnixMilliseconds;
  }): Promise<"conflict" | "not_found" | "revoked">;
  /** Issues a token for an enabled account and supersedes its unconsumed tokens. */
  issuePasswordReset(input: {
    readonly now: UnixMilliseconds;
    readonly requestedBy?: string;
    readonly target: { readonly email: string } | { readonly userId: string };
  }): Promise<IssuePasswordResetResult>;
  /** Replaces the credential, consumes the token and deletes every session. */
  confirmPasswordReset(input: {
    readonly now: UnixMilliseconds;
    readonly password: string;
    readonly token: OpaqueTokenSecret;
  }): Promise<
    { readonly status: "reset"; readonly userId: string } | { readonly status: "invalid" }
  >;
  updateDisplayName(input: {
    readonly displayName: string;
    readonly now: UnixMilliseconds;
    readonly userId: string;
  }): Promise<boolean>;
  /** With `keepSessionId`, every other session of the user is deleted. */
  changePassword(input: {
    readonly currentPassword: string;
    readonly keepSessionId?: string;
    readonly newPassword: string;
    readonly now: UnixMilliseconds;
    readonly userId: string;
  }): Promise<ChangePasswordResult>;
  /** Read-only durable completion marker; never infers completion from users. */
  isSetupComplete(): Promise<boolean>;
  bootstrap(input: {
    readonly email: string;
    readonly password: string;
    readonly token: OpaqueTokenSecret;
  }): Promise<{ readonly user: ManagedUser }>;
  /** Disabling also deletes every session of the user in the same operation. */
  disableUser(input: { readonly userId: string }): Promise<ManagedUser>;
  listUsers(): Promise<readonly ManagedUser[]>;
  /** Disabling also deletes every session of the user in the same operation. */
  updateUser(input: {
    readonly role?: SecurityRole;
    readonly userId: string;
    readonly disabled?: boolean;
  }): Promise<ManagedUser | null>;
}

export interface SessionSecurityPort {
  /** Unexpired sessions of one user, newest activity first. */
  listSessions(input: {
    readonly now: UnixMilliseconds;
    readonly userId: string;
  }): Promise<readonly SessionRecord[]>;
  /** False when the session does not exist or belongs to another user. */
  deleteSession(input: { readonly sessionId: string; readonly userId: string }): Promise<boolean>;
  deleteOtherSessions(input: {
    readonly keepSessionId: string;
    readonly userId: string;
  }): Promise<number>;
  /** Null when the user does not exist. */
  deleteUserSessions(input: { readonly userId: string }): Promise<number | null>;
}

export interface TokenSecurityPort {
  createSetupToken(): Promise<{
    readonly expiresAt: UnixMilliseconds;
    readonly token: OpaqueTokenSecret;
  }>;
  createBuildToken(input: {
    readonly name: string;
    readonly now: UnixMilliseconds;
  }): Promise<IssuedBuildToken>;
  listBuildTokens(): Promise<readonly BuildTokenMetadata[]>;
  revokeBuildToken(input: {
    readonly tokenId: string;
    readonly now: UnixMilliseconds;
  }): Promise<BuildTokenMetadata | null>;
  /** Accepts only an unrevoked token whose capabilities are exactly `content:build:read`. */
  verifyBuildToken(input: {
    readonly token: OpaqueTokenSecret;
    readonly now: UnixMilliseconds;
  }): Promise<boolean>;
  createImportToken(input: {
    readonly capabilities: ImportTokenCapabilities;
    readonly createdBy: string;
    readonly expiresAt: UnixMilliseconds;
    readonly name: string;
    readonly now: UnixMilliseconds;
  }): Promise<IssuedImportToken>;
  /** Newest first, including expired and revoked tokens. */
  listImportTokens(): Promise<readonly ImportTokenMetadata[]>;
  /** Idempotent; null when no import token has the identifier. */
  revokeImportToken(input: {
    readonly tokenId: string;
    readonly now: UnixMilliseconds;
  }): Promise<ImportTokenMetadata | null>;
  /**
   * Null for an unknown, revoked or expired token, another token kind, or a
   * missing or disabled creator. A successful resolution records its use at
   * most once per `IMPORT_TOKEN_USE_RECORD_INTERVAL_MS`.
   */
  resolveImportToken(input: {
    readonly token: OpaqueTokenSecret;
    readonly now: UnixMilliseconds;
  }): Promise<ResolvedImportToken | null>;
}

/** Security lifecycle boundary implemented by each runtime's durable adapter. */
export interface SecurityService
  extends UserProfileReader, AccountSecurityPort, SessionSecurityPort, TokenSecurityPort {}

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly retryAfterSeconds: number;
}

/**
 * `invite` covers invitation create, resend and revoke plus administrator
 * resets per actor; `reset` counts public reset requests per normalized email.
 */
export type SensitiveRateLimitOperation =
  | "mcp"
  | "oauth-register"
  | "oauth-token"
  | "oauth-revoke"
  | "auth"
  | "email"
  | "invite"
  | "reset"
  | "setup"
  | "token"
  | "upload";

export interface SensitiveRateLimiter {
  check(input: {
    readonly operation: SensitiveRateLimitOperation;
    readonly subject: string;
    readonly now: UnixMilliseconds;
  }): Promise<RateLimitDecision>;
}
