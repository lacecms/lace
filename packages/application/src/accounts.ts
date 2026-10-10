import { requirePermission, type Actor, type UnixMilliseconds } from "@lacecms/domain";
import {
  renderEmail,
  type EmailDeliveryOutcome,
  type EmailSender,
  type RenderedEmail,
} from "./email.js";
import type {
  Clock,
  ManagedUser,
  OpaqueTokenSecret,
  SecurityRole,
  SecurityService,
  SensitiveRateLimiter,
} from "./index.js";

/** Invitations stay valid for 72 hours after issuance or resend. */
export const INVITATION_TTL_MS = 72 * 60 * 60 * 1000;
/** Password-reset links stay valid for one hour. */
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
export const DISPLAY_NAME_MAX_LENGTH = 120;

/** Closed account-flow failures; the HTTP boundary maps each code to one envelope. */
export type AccountErrorCode =
  | "CONFLICT"
  | "INVALID_CREDENTIALS"
  | "INVITATION_INVALID"
  | "NOT_FOUND"
  | "RESET_INVALID";

export class AccountError extends Error {
  public constructor(public readonly code: AccountErrorCode) {
    super(code);
    this.name = "AccountError";
  }
}

/** A sensitive limit was exhausted inside a use case. */
export class RateLimitExceededError extends Error {
  public constructor(public readonly retryAfterSeconds: number) {
    super("Rate limit exceeded.");
    this.name = "RateLimitExceededError";
  }
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

export type SessionBrowser = "Chrome" | "Edge" | "Firefox" | "Opera" | "Safari" | "Unknown";
export type SessionOs = "Android" | "iOS" | "Linux" | "macOS" | "Windows" | "Unknown";

/** Classifies a stored user agent into a coarse browser and OS; no dependency, no versions. */
export function summarizeUserAgent(userAgent: string | undefined): {
  readonly browser: SessionBrowser;
  readonly os: SessionOs;
} {
  const value = userAgent ?? "";
  const browser: SessionBrowser = /\bEdg(?:e|A|iOS)?\//u.test(value)
    ? "Edge"
    : /\b(?:OPR|Opera|OPiOS)\//u.test(value)
      ? "Opera"
      : /\b(?:Firefox|FxiOS)\//u.test(value)
        ? "Firefox"
        : /\b(?:Chrome|CriOS|Chromium)\//u.test(value)
          ? "Chrome"
          : /\bVersion\/[\d.]+.*\bSafari\//u.test(value)
            ? "Safari"
            : "Unknown";
  const os: SessionOs = /\bWindows\b/u.test(value)
    ? "Windows"
    : /\b(?:iPhone|iPad|iPod)\b/u.test(value)
      ? "iOS"
      : /\bAndroid\b/u.test(value)
        ? "Android"
        : /\b(?:Macintosh|Mac OS X)\b/u.test(value)
          ? "macOS"
          : /\b(?:Linux|X11|CrOS)\b/u.test(value)
            ? "Linux"
            : "Unknown";
  return Object.freeze({ browser, os });
}

const ROLE_LABELS: Readonly<Record<SecurityRole, string>> = Object.freeze({
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
});

function hours(ms: number): number {
  return Math.round(ms / (60 * 60 * 1000));
}

export function invitationEmailTemplate(input: {
  readonly expiresInHours: number;
  readonly inviterName: string;
  readonly link: string;
  readonly role: SecurityRole;
  readonly siteUrl: string;
}): RenderedEmail {
  return renderEmail({
    link: input.link,
    paragraphs: [
      `${input.inviterName} invited you to the Lace CMS at ${input.siteUrl} with the ${ROLE_LABELS[input.role]} role.`,
      `Open the link below to choose your password and join. The link works once and expires in ${input.expiresInHours} hours.`,
    ],
    postscript: [
      "If you did not expect this invitation, you can ignore this email; no account is created unless the link is used.",
    ],
    subject: "You are invited to Lace CMS",
  });
}

export function passwordResetEmailTemplate(input: {
  readonly expiresInHours: number;
  readonly link: string;
  readonly requestedByAdministrator: boolean;
  readonly siteUrl: string;
}): RenderedEmail {
  return renderEmail({
    link: input.link,
    paragraphs: [
      input.requestedByAdministrator
        ? `An administrator of the Lace CMS at ${input.siteUrl} sent you a link to choose a new password.`
        : `Someone asked to reset the password of your account on the Lace CMS at ${input.siteUrl}.`,
      `Open the link below to choose a new password. The link works once and expires in ${input.expiresInHours} ${input.expiresInHours === 1 ? "hour" : "hours"}. Choosing a new password signs you out everywhere.`,
    ],
    postscript: [
      "If you did not ask for this, you can ignore this email; your password stays unchanged.",
    ],
    subject: "Reset your Lace CMS password",
  });
}

export function passwordChangedEmailTemplate(input: { readonly siteUrl: string }): RenderedEmail {
  return renderEmail({
    paragraphs: [
      `The password of your account on the Lace CMS at ${input.siteUrl} was just changed.`,
      "If you made this change, no action is needed. If you did not, reset your password from the sign-in page and contact your administrator.",
    ],
    subject: "Your Lace CMS password was changed",
  });
}

/** Builds a link whose token travels only in the URL fragment. */
export function accountLink(
  publicBaseUrl: string,
  path: "admin/accept-invite" | "admin/reset-password",
  token: string,
): string {
  if (!/^https?:\/\/[^\s?\x23]+\/$/u.test(publicBaseUrl))
    throw new TypeError("The public base URL must be absolute and end in a slash.");
  return `${publicBaseUrl}${path}#token=${token}`;
}

/** Normalizes an address the way every adapter stores it. */
export function normalizeAccountEmail(value: string): string {
  return value.trim().toLowerCase();
}

// oxlint-disable-next-line no-control-regex -- rejects control characters by design.
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/u;

/** Trims a display name and enforces the shared bounds. */
export function normalizeDisplayName(value: string): string {
  const name = value.trim();
  if (name.length < 1 || name.length > DISPLAY_NAME_MAX_LENGTH || CONTROL_CHARACTERS.test(name))
    throw new TypeError("Invalid display name.");
  return name;
}

export type InvitationState = "expired" | "pending";

export interface InvitationView {
  readonly createdAt: UnixMilliseconds;
  readonly email: string;
  readonly expiresAt: UnixMilliseconds;
  readonly id: string;
  readonly invitedBy: string;
  readonly role: SecurityRole;
  readonly state: InvitationState;
}

export interface LinkIssueResult {
  readonly delivery: EmailDeliveryOutcome;
  /** Present exactly when delivery was not `sent`; shown to the administrator once. */
  readonly link?: string;
}

export interface InvitationIssueResult extends LinkIssueResult {
  readonly invitation: InvitationView;
}

export interface SessionView {
  readonly browser: SessionBrowser;
  readonly createdAt: UnixMilliseconds;
  readonly current: boolean;
  readonly id: string;
  readonly lastActiveAt: UnixMilliseconds;
  readonly os: SessionOs;
}

/** Schedules work after the response without delaying it; failures are reported, not raised. */
export type DeferTask = (task: Promise<unknown>) => void;

export interface AccountUseCasesInput {
  readonly clock: Clock;
  readonly email: EmailSender;
  /** Per-email reset limit; absent means unlimited (tests and tooling only). */
  readonly limiter?: SensitiveRateLimiter;
  /** Absolute base URL ending in `/`, never derived from request headers. */
  readonly publicBaseUrl: string;
  readonly security: SecurityService;
}

function requireUsersManagerActor(actor: Actor): void {
  requirePermission(actor, "users:manage");
}

/** Invitation, password-recovery and self-service flows shared by both runtimes. */
export class AccountUseCases {
  public constructor(private readonly input: AccountUseCasesInput) {}

  private now(): UnixMilliseconds {
    return this.input.clock.now();
  }

  private view(record: InvitationRecord, now: UnixMilliseconds): InvitationView {
    return Object.freeze({
      createdAt: record.createdAt,
      email: record.email,
      expiresAt: record.expiresAt,
      id: record.id,
      invitedBy: record.invitedByName,
      role: record.role,
      state: Number(record.expiresAt) > Number(now) ? "pending" : "expired",
    });
  }

  private async deliver(
    message: RenderedEmail,
    to: string,
    link: string,
  ): Promise<LinkIssueResult> {
    const delivery = await this.input.email.send({ ...message, to });
    return delivery.status === "sent"
      ? Object.freeze({ delivery })
      : Object.freeze({ delivery, link });
  }

  private async sendInvitation(
    actor: Actor,
    invitation: InvitationRecord,
    token: OpaqueTokenSecret,
    now: UnixMilliseconds,
  ): Promise<InvitationIssueResult> {
    const link = accountLink(this.input.publicBaseUrl, "admin/accept-invite", token);
    const profile = await this.input.security.readUserProfile(actor.id);
    const message = invitationEmailTemplate({
      expiresInHours: hours(INVITATION_TTL_MS),
      inviterName: profile?.name ?? profile?.email ?? "A Lace administrator",
      link,
      role: invitation.role,
      siteUrl: this.input.publicBaseUrl,
    });
    const result = await this.deliver(message, invitation.email, link);
    return Object.freeze({ ...result, invitation: this.view(invitation, now) });
  }

  public async invite(
    actor: Actor,
    request: { readonly email: string; readonly role: SecurityRole },
  ): Promise<InvitationIssueResult> {
    requireUsersManagerActor(actor);
    const now = this.now();
    const created = await this.input.security.createInvitation({
      email: normalizeAccountEmail(request.email),
      invitedBy: actor.id,
      now,
      role: request.role,
    });
    if (created.status === "conflict") throw new AccountError("CONFLICT");
    return this.sendInvitation(actor, created.invitation, created.token, now);
  }

  public async listInvitations(actor: Actor): Promise<readonly InvitationView[]> {
    requireUsersManagerActor(actor);
    const now = this.now();
    return (await this.input.security.listInvitations()).map((record) => this.view(record, now));
  }

  public async resendInvitation(
    actor: Actor,
    invitationId: string,
  ): Promise<InvitationIssueResult> {
    requireUsersManagerActor(actor);
    const now = this.now();
    const reissued = await this.input.security.reissueInvitation({ invitationId, now });
    if (reissued.status === "not_found") throw new AccountError("NOT_FOUND");
    if (reissued.status === "conflict") throw new AccountError("CONFLICT");
    return this.sendInvitation(actor, reissued.invitation, reissued.token, now);
  }

  public async revokeInvitation(actor: Actor, invitationId: string): Promise<void> {
    requireUsersManagerActor(actor);
    const outcome = await this.input.security.revokeInvitation({ invitationId, now: this.now() });
    if (outcome === "not_found") throw new AccountError("NOT_FOUND");
    if (outcome === "conflict") throw new AccountError("CONFLICT");
  }

  public async inspectInvitation(request: { readonly token: string }): Promise<{
    readonly email: string;
    readonly expiresAt: UnixMilliseconds;
    readonly role: SecurityRole;
  }> {
    const found = await this.input.security.inspectInvitation({
      now: this.now(),
      token: request.token as OpaqueTokenSecret,
    });
    if (found === null) throw new AccountError("INVITATION_INVALID");
    return found;
  }

  public async acceptInvitation(request: {
    readonly displayName?: string;
    readonly password: string;
    readonly token: string;
  }): Promise<{ readonly email: string }> {
    const result = await this.input.security.acceptInvitation({
      ...(request.displayName === undefined
        ? {}
        : { displayName: normalizeDisplayName(request.displayName) }),
      now: this.now(),
      password: request.password,
      token: request.token as OpaqueTokenSecret,
    });
    if (result.status === "invalid") throw new AccountError("INVITATION_INVALID");
    if (result.status === "conflict") throw new AccountError("CONFLICT");
    return Object.freeze({ email: result.user.email });
  }

  /**
   * Returns the same outcome for enabled, disabled and unknown addresses. Only
   * an enabled account receives a token, and its email is deferred.
   */
  public async requestPasswordReset(request: {
    readonly defer: DeferTask;
    readonly email: string;
  }): Promise<void> {
    const email = normalizeAccountEmail(request.email);
    const now = this.now();
    if (this.input.limiter !== undefined) {
      const decision = await this.input.limiter.check({ now, operation: "reset", subject: email });
      if (!decision.allowed) throw new RateLimitExceededError(decision.retryAfterSeconds);
    }
    const issued = await this.input.security.issuePasswordReset({ now, target: { email } });
    if (issued.status !== "issued") return;
    const message = passwordResetEmailTemplate({
      expiresInHours: hours(PASSWORD_RESET_TTL_MS),
      link: accountLink(this.input.publicBaseUrl, "admin/reset-password", issued.token),
      requestedByAdministrator: false,
      siteUrl: this.input.publicBaseUrl,
    });
    request.defer(this.input.email.send({ ...message, to: issued.email }));
  }

  public async confirmPasswordReset(request: {
    readonly password: string;
    readonly token: string;
  }): Promise<void> {
    const result = await this.input.security.confirmPasswordReset({
      now: this.now(),
      password: request.password,
      token: request.token as OpaqueTokenSecret,
    });
    if (result.status === "invalid") throw new AccountError("RESET_INVALID");
  }

  public async sendPasswordReset(actor: Actor, userId: string): Promise<LinkIssueResult> {
    requireUsersManagerActor(actor);
    const issued = await this.input.security.issuePasswordReset({
      now: this.now(),
      requestedBy: actor.id,
      target: { userId },
    });
    if (issued.status === "not_found") throw new AccountError("NOT_FOUND");
    if (issued.status === "disabled") throw new AccountError("CONFLICT");
    const link = accountLink(this.input.publicBaseUrl, "admin/reset-password", issued.token);
    const message = passwordResetEmailTemplate({
      expiresInHours: hours(PASSWORD_RESET_TTL_MS),
      link,
      requestedByAdministrator: true,
      siteUrl: this.input.publicBaseUrl,
    });
    return this.deliver(message, issued.email, link);
  }

  public async signOutUser(actor: Actor, userId: string): Promise<{ readonly revoked: number }> {
    requireUsersManagerActor(actor);
    const revoked = await this.input.security.deleteUserSessions({ userId });
    if (revoked === null) throw new AccountError("NOT_FOUND");
    return Object.freeze({ revoked });
  }

  public async updateDisplayName(actor: Actor, displayName: string): Promise<void> {
    const updated = await this.input.security.updateDisplayName({
      displayName: normalizeDisplayName(displayName),
      now: this.now(),
      userId: actor.id,
    });
    if (!updated) throw new AccountError("NOT_FOUND");
  }

  /**
   * Requires the current password. Signing out other sessions keeps only the
   * session making the request. The changed-password notice is deferred.
   */
  public async changePassword(
    actor: Actor,
    currentSessionId: string | null,
    request: {
      readonly currentPassword: string;
      readonly defer: DeferTask;
      readonly newPassword: string;
      readonly signOutOtherSessions: boolean;
    },
  ): Promise<{ readonly revoked: number }> {
    if (request.signOutOtherSessions && currentSessionId === null)
      throw new AccountError("CONFLICT");
    const result = await this.input.security.changePassword({
      currentPassword: request.currentPassword,
      ...(request.signOutOtherSessions && currentSessionId !== null
        ? { keepSessionId: currentSessionId }
        : {}),
      newPassword: request.newPassword,
      now: this.now(),
      userId: actor.id,
    });
    if (result.status === "invalid_credentials") throw new AccountError("INVALID_CREDENTIALS");
    if (this.input.email.provider !== "none") {
      const profile = await this.input.security.readUserProfile(actor.id);
      if (profile !== null && !profile.disabled)
        request.defer(
          this.input.email.send({
            ...passwordChangedEmailTemplate({ siteUrl: this.input.publicBaseUrl }),
            to: profile.email,
          }),
        );
    }
    return Object.freeze({ revoked: result.revoked });
  }

  public async listSessions(
    actor: Actor,
    currentSessionId: string | null,
  ): Promise<readonly SessionView[]> {
    const sessions = await this.input.security.listSessions({ now: this.now(), userId: actor.id });
    return sessions.map((session) =>
      Object.freeze({
        ...summarizeUserAgent(session.userAgent),
        createdAt: session.createdAt,
        current: session.id === currentSessionId,
        id: session.id,
        lastActiveAt: session.lastActiveAt,
      }),
    );
  }

  /** Ending the current session is refused in favor of sign-out. */
  public async deleteSession(
    actor: Actor,
    currentSessionId: string | null,
    sessionId: string,
  ): Promise<void> {
    if (sessionId === currentSessionId) throw new AccountError("CONFLICT");
    const deleted = await this.input.security.deleteSession({ sessionId, userId: actor.id });
    if (!deleted) throw new AccountError("NOT_FOUND");
  }

  public async deleteOtherSessions(
    actor: Actor,
    currentSessionId: string | null,
  ): Promise<{ readonly revoked: number }> {
    if (currentSessionId === null) throw new AccountError("CONFLICT");
    const revoked = await this.input.security.deleteOtherSessions({
      keepSessionId: currentSessionId,
      userId: actor.id,
    });
    return Object.freeze({ revoked });
  }
}
