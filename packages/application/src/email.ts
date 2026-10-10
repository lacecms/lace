import { requirePermission, type Actor } from "@lacecms/domain";

export type EmailProviderKind = "cloudflare" | "log" | "none" | "resend" | "smtp";

export type EmailFailureReason =
  | "invalid_message"
  | "not_configured"
  | "rate_limited"
  | "rejected"
  | "unavailable";

/** A single-recipient transactional message; the sender identity belongs to the adapter. */
export interface EmailMessage {
  readonly html?: string;
  readonly subject: string;
  readonly text: string;
  readonly to: string;
}

/** `sent` means only that the provider accepted the message, never that it was delivered. */
export type EmailDeliveryOutcome =
  | { readonly status: "sent" }
  | { readonly reason: EmailFailureReason; readonly status: "failed" };

/** Provider adapters never throw: every failure is mapped to a closed reason. */
export interface EmailSender {
  readonly from?: string;
  readonly provider: EmailProviderKind;
  send(message: EmailMessage): Promise<EmailDeliveryOutcome>;
}

export const EMAIL_SUBJECT_MAX_LENGTH = 200;
export const EMAIL_TEXT_MAX_LENGTH = 100_000;
export const EMAIL_HTML_MAX_LENGTH = 200_000;

const addressPattern = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]+$/u;
const lineBreakPattern = /[\r\n]/u;

/** A single bare address with no display name, whitespace or line breaks. */
export function isEmailAddress(value: string): boolean {
  return value.length <= 320 && addressPattern.test(value);
}

export interface EmailSenderIdentity {
  readonly address: string;
  readonly name?: string;
}

/** Parses `address` or `Display Name <address>`; returns undefined for anything else. */
export function parseEmailSender(value: string): EmailSenderIdentity | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 400 || lineBreakPattern.test(trimmed)) {
    return undefined;
  }
  if (isEmailAddress(trimmed)) return Object.freeze({ address: trimmed });
  const named = /^([^<>"]*[^\s<>"])\s*<([^<>]+)>$/u.exec(trimmed);
  if (named === null) return undefined;
  const [, name, address] = named;
  if (name === undefined || address === undefined || !isEmailAddress(address)) return undefined;
  return Object.freeze({ address, name: name.trim() });
}

/**
 * Validates a message before any provider sees it, so header-injection
 * protection never depends on a provider library.
 */
export function validatedMessage(message: EmailMessage): EmailMessage | undefined {
  const { html, subject, text, to } = message;
  if (typeof to !== "string" || !isEmailAddress(to)) return undefined;
  if (
    typeof subject !== "string" ||
    subject.trim().length === 0 ||
    subject.length > EMAIL_SUBJECT_MAX_LENGTH ||
    lineBreakPattern.test(subject)
  ) {
    return undefined;
  }
  if (typeof text !== "string" || text.length === 0 || text.length > EMAIL_TEXT_MAX_LENGTH) {
    return undefined;
  }
  if (html !== undefined && (typeof html !== "string" || html.length > EMAIL_HTML_MAX_LENGTH)) {
    return undefined;
  }
  return Object.freeze({ ...(html === undefined ? {} : { html }), subject, text, to });
}

/** Wraps a provider call so callers only ever see closed outcomes. */
export function guardedEmailSender(
  provider: EmailProviderKind,
  from: string | undefined,
  deliver: (message: EmailMessage) => Promise<EmailDeliveryOutcome>,
  onFailure?: (reason: EmailFailureReason) => void,
): EmailSender {
  return Object.freeze({
    ...(from === undefined ? {} : { from }),
    provider,
    send: async (message: EmailMessage): Promise<EmailDeliveryOutcome> => {
      const valid = validatedMessage(message);
      let outcome: EmailDeliveryOutcome;
      if (valid === undefined) {
        outcome = emailFailed("invalid_message");
      } else {
        try {
          outcome = await deliver(valid);
        } catch {
          outcome = emailFailed("unavailable");
        }
      }
      if (outcome.status === "failed") onFailure?.(outcome.reason);
      return outcome;
    },
  });
}

export function emailFailed(reason: EmailFailureReason): EmailDeliveryOutcome {
  return Object.freeze({ reason, status: "failed" });
}

export const EMAIL_SENT: EmailDeliveryOutcome = Object.freeze({ status: "sent" });

/** The `none` provider: delivery is unavailable and nothing leaves the process. */
export const unconfiguredEmailSender: EmailSender = Object.freeze({
  provider: "none",
  send: async () => emailFailed("not_configured"),
});

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export interface RenderedEmail {
  readonly html: string;
  readonly subject: string;
  readonly text: string;
}

/**
 * Renders the shared minimal layout; every paragraph and the optional link are
 * escaped. The link follows the paragraphs on its own line, then any postscript.
 */
export function renderEmail(input: {
  readonly link?: string;
  readonly paragraphs: readonly string[];
  readonly postscript?: readonly string[];
  readonly subject: string;
}): RenderedEmail {
  const paragraph = (value: string) => `<p style="margin:0 0 16px">${escapeHtml(value)}</p>`;
  const link =
    input.link === undefined
      ? ""
      : `<p style="margin:0 0 16px"><a href="${escapeHtml(input.link)}">${escapeHtml(input.link)}</a></p>`;
  const postscript = input.postscript ?? [];
  const body = `${input.paragraphs.map(paragraph).join("")}${link}${postscript.map(paragraph).join("")}`;
  const text = [
    ...input.paragraphs,
    ...(input.link === undefined ? [] : [input.link]),
    ...postscript,
  ];
  return Object.freeze({
    html: `<!doctype html><html><body style="margin:0;padding:24px;font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#18181b">${body}</body></html>`,
    subject: input.subject,
    text: `${text.join("\n\n")}\n`,
  });
}

export function testEmailTemplate(input: { readonly installationUrl: string }): RenderedEmail {
  return renderEmail({
    paragraphs: [
      "This is a test message from your Lace CMS installation.",
      `It was requested from Settings at ${input.installationUrl}. Email delivery is working: account emails such as invitations and password resets can reach this address.`,
      "No action is needed.",
    ],
    subject: "Lace test email",
  });
}

/** Reads the account fields the email use cases need, without credentials. */
export interface UserProfileReader {
  readUserProfile(userId: string): Promise<{
    readonly disabled: boolean;
    readonly email: string;
    readonly name?: string;
  } | null>;
}

/** Sends the fixed test message only to the acting administrator's own address. */
export async function sendTestEmail(input: {
  readonly actor: Actor;
  readonly email: EmailSender;
  readonly installationUrl: string;
  readonly users: UserProfileReader;
}): Promise<EmailDeliveryOutcome> {
  requirePermission(input.actor, "settings:manage");
  if (input.email.provider === "none") return emailFailed("not_configured");
  const profile = await input.users.readUserProfile(input.actor.id);
  if (profile === null || profile.disabled) return emailFailed("invalid_message");
  const message = testEmailTemplate({ installationUrl: input.installationUrl });
  return input.email.send({ ...message, to: profile.email });
}
