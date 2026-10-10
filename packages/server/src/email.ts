import {
  EMAIL_SENT,
  emailFailed,
  guardedEmailSender,
  parseEmailSender,
  unconfiguredEmailSender,
  type EmailFailureReason,
  type EmailProviderKind,
  type EmailSender,
} from "@lacecms/application";

export const DEFAULT_EMAIL_TIMEOUT_MS = 10_000;
export const DEFAULT_SMTP_PORT = 587;
export const DEFAULT_RESEND_API_BASE_URL = "https://api.resend.com/";

export type EmailRuntime = "cloudflare" | "node";
export type SmtpSecurity = "none" | "starttls" | "tls";

export interface SmtpEmailSettings {
  readonly auth?: { readonly password: string; readonly user: string };
  readonly host: string;
  readonly port: number;
  readonly security: SmtpSecurity;
}

export interface ResendEmailSettings {
  readonly apiKey: string;
  readonly baseUrl: URL;
}

/** Validated email delivery settings; secrets stay inside and are never rendered. */
export type EmailSettings =
  | { readonly provider: "none" }
  | { readonly from: string; readonly provider: "cloudflare" | "log"; readonly timeoutMs: number }
  | {
      readonly from: string;
      readonly provider: "smtp";
      readonly smtp: SmtpEmailSettings;
      readonly timeoutMs: number;
    }
  | {
      readonly from: string;
      readonly provider: "resend";
      readonly resend: ResendEmailSettings;
      readonly timeoutMs: number;
    };

export interface EmailSettingsIssue {
  readonly reason: "invalid" | "missing";
  readonly variable: string;
}

export interface EmailEnvironment {
  readonly LACE_EMAIL_FROM?: unknown;
  readonly LACE_EMAIL_PROVIDER?: unknown;
  readonly LACE_EMAIL_TIMEOUT_MS?: unknown;
  readonly LACE_RESEND_API_BASE_URL?: unknown;
  readonly LACE_RESEND_API_KEY?: unknown;
  readonly LACE_SMTP_HOST?: unknown;
  readonly LACE_SMTP_PASSWORD?: unknown;
  readonly LACE_SMTP_PORT?: unknown;
  readonly LACE_SMTP_SECURITY?: unknown;
  readonly LACE_SMTP_USER?: unknown;
}

export interface EmailSettingsResult {
  readonly issues: readonly EmailSettingsIssue[];
  /** Present only when there are no issues. */
  readonly settings?: EmailSettings;
}

const PROVIDERS: Readonly<Record<EmailRuntime, readonly EmailProviderKind[]>> = Object.freeze({
  cloudflare: Object.freeze(["none", "log", "resend", "cloudflare"] as const),
  node: Object.freeze(["none", "log", "smtp", "resend"] as const),
});

function optionalText(
  value: unknown,
  variable: string,
  issues: EmailSettingsIssue[],
): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    issues.push({ reason: "invalid", variable });
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function requiredText(
  value: unknown,
  variable: string,
  issues: EmailSettingsIssue[],
): string | undefined {
  const text = optionalText(value, variable, issues);
  if (text === undefined && !issues.some((issue) => issue.variable === variable))
    issues.push({ reason: "missing", variable });
  return text;
}

function boundedInteger(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
  variable: string,
  issues: EmailSettingsIssue[],
): number {
  if (value === undefined) return fallback;
  const parsed = /^\d+$/u.test(value) ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    issues.push({ reason: "invalid", variable });
    return fallback;
  }
  return parsed;
}

function resendBaseUrl(
  value: string | undefined,
  development: boolean,
  issues: EmailSettingsIssue[],
): URL {
  if (value === undefined) return new URL(DEFAULT_RESEND_API_BASE_URL);
  try {
    const url = new URL(value);
    const allowed = url.protocol === "https:" || (development && url.protocol === "http:");
    if (allowed && !url.username && !url.password && !url.search && !url.hash) {
      if (!url.pathname.endsWith("/")) url.pathname = `${url.pathname}/`;
      return url;
    }
  } catch {
    // Reported below without the supplied value.
  }
  issues.push({ reason: "invalid", variable: "LACE_RESEND_API_BASE_URL" });
  return new URL(DEFAULT_RESEND_API_BASE_URL);
}

/**
 * Parses email delivery settings with one rule set for Node, the Worker and
 * doctor. Issues name variables only and never repeat supplied values.
 */
export function parseEmailSettings(
  environment: EmailEnvironment,
  options: { readonly production: boolean; readonly runtime: EmailRuntime },
): EmailSettingsResult {
  const issues: EmailSettingsIssue[] = [];
  const development = !options.production;
  const selected =
    optionalText(environment.LACE_EMAIL_PROVIDER, "LACE_EMAIL_PROVIDER", issues) ?? "none";
  const provider = PROVIDERS[options.runtime].find((candidate) => candidate === selected);
  if (provider === undefined || (provider === "log" && options.production)) {
    issues.push({ reason: "invalid", variable: "LACE_EMAIL_PROVIDER" });
    return Object.freeze({ issues: Object.freeze(issues) });
  }
  if (provider === "none") {
    return issues.length > 0
      ? Object.freeze({ issues: Object.freeze(issues) })
      : Object.freeze({ issues: Object.freeze([]), settings: Object.freeze({ provider }) });
  }
  const fromValue = requiredText(environment.LACE_EMAIL_FROM, "LACE_EMAIL_FROM", issues);
  if (fromValue !== undefined && parseEmailSender(fromValue) === undefined)
    issues.push({ reason: "invalid", variable: "LACE_EMAIL_FROM" });
  const timeoutMs = boundedInteger(
    optionalText(environment.LACE_EMAIL_TIMEOUT_MS, "LACE_EMAIL_TIMEOUT_MS", issues),
    DEFAULT_EMAIL_TIMEOUT_MS,
    1,
    60_000,
    "LACE_EMAIL_TIMEOUT_MS",
    issues,
  );
  let settings: EmailSettings | undefined;
  const from = fromValue ?? "";
  if (provider === "smtp") {
    const host = requiredText(environment.LACE_SMTP_HOST, "LACE_SMTP_HOST", issues);
    if (host !== undefined && (/[\s/@]/u.test(host) || host.length > 253))
      issues.push({ reason: "invalid", variable: "LACE_SMTP_HOST" });
    const port = boundedInteger(
      optionalText(environment.LACE_SMTP_PORT, "LACE_SMTP_PORT", issues),
      DEFAULT_SMTP_PORT,
      1,
      65_535,
      "LACE_SMTP_PORT",
      issues,
    );
    const securityValue =
      optionalText(environment.LACE_SMTP_SECURITY, "LACE_SMTP_SECURITY", issues) ?? "starttls";
    const security = (["starttls", "tls", "none"] as const).find(
      (candidate) => candidate === securityValue,
    );
    if (security === undefined || (security === "none" && options.production))
      issues.push({ reason: "invalid", variable: "LACE_SMTP_SECURITY" });
    const user = optionalText(environment.LACE_SMTP_USER, "LACE_SMTP_USER", issues);
    // Passwords are used verbatim: surrounding spaces can be significant.
    const rawPassword = environment.LACE_SMTP_PASSWORD;
    if (rawPassword !== undefined && rawPassword !== null && typeof rawPassword !== "string")
      issues.push({ reason: "invalid", variable: "LACE_SMTP_PASSWORD" });
    const password =
      typeof rawPassword === "string" && rawPassword.length > 0 ? rawPassword : undefined;
    if (user !== undefined && password === undefined)
      issues.push({ reason: "missing", variable: "LACE_SMTP_PASSWORD" });
    if (user === undefined && password !== undefined)
      issues.push({ reason: "missing", variable: "LACE_SMTP_USER" });
    if (host !== undefined && security !== undefined)
      settings = {
        from,
        provider,
        smtp: Object.freeze({
          ...(user !== undefined && password !== undefined
            ? { auth: Object.freeze({ password, user }) }
            : {}),
          host,
          port,
          security,
        }),
        timeoutMs,
      };
  } else if (provider === "resend") {
    const apiKey = requiredText(environment.LACE_RESEND_API_KEY, "LACE_RESEND_API_KEY", issues);
    if (apiKey !== undefined && (/\s/u.test(apiKey) || apiKey.length > 512))
      issues.push({ reason: "invalid", variable: "LACE_RESEND_API_KEY" });
    const baseUrl = resendBaseUrl(
      optionalText(environment.LACE_RESEND_API_BASE_URL, "LACE_RESEND_API_BASE_URL", issues),
      development,
      issues,
    );
    if (apiKey !== undefined)
      settings = { from, provider, resend: Object.freeze({ apiKey, baseUrl }), timeoutMs };
  } else {
    settings = { from, provider, timeoutMs };
  }
  if (issues.length > 0 || settings === undefined)
    return Object.freeze({ issues: Object.freeze(issues) });
  return Object.freeze({ issues: Object.freeze([]), settings: Object.freeze(settings) });
}

/** Sanitized failure evidence: provider kind and closed reason only. */
export type EmailFailureReporter = (entry: {
  readonly component: "email";
  readonly provider: EmailProviderKind;
  readonly reason: EmailFailureReason;
}) => void;

export const defaultEmailFailureReporter: EmailFailureReporter = (entry) =>
  console.error(JSON.stringify({ ...entry, level: "warn" }));

function reporter(provider: EmailProviderKind, report: EmailFailureReporter) {
  return (reason: EmailFailureReason) => report({ component: "email", provider, reason });
}

/** Development-only sender: the whole message is written as one structured record. */
export function createLogEmailSender(input: {
  readonly from: string;
  readonly write?: (line: string) => void;
}): EmailSender {
  const write = input.write ?? ((line: string) => console.info(line));
  return guardedEmailSender("log", input.from, async (message) => {
    write(
      JSON.stringify({
        component: "email",
        from: input.from,
        provider: "log",
        subject: message.subject,
        text: message.text,
        to: message.to,
      }),
    );
    return EMAIL_SENT;
  });
}

/** Messages are validated locally, so remaining 4xx answers are sender, domain or key problems. */
function resendReason(status: number): EmailFailureReason {
  if (status === 429) return "rate_limited";
  if (status >= 300 && status < 400) return "unavailable";
  if (status >= 400 && status < 500) return "rejected";
  return "unavailable";
}

/** Resend over HTTPS with `fetch`; works unchanged on Node and Workers. */
export function createResendEmailSender(input: {
  readonly fetch?: typeof fetch;
  readonly from: string;
  readonly idempotencyKey?: () => string;
  readonly report?: EmailFailureReporter;
  readonly settings: ResendEmailSettings;
  readonly timeoutMs: number;
}): EmailSender {
  const request = input.fetch ?? fetch;
  const key = input.idempotencyKey ?? (() => crypto.randomUUID());
  const endpoint = new URL("emails", input.settings.baseUrl);
  return guardedEmailSender(
    "resend",
    input.from,
    async (message) => {
      let response: Response;
      try {
        response = await request(endpoint, {
          body: JSON.stringify({
            from: input.from,
            ...(message.html === undefined ? {} : { html: message.html }),
            subject: message.subject,
            text: message.text,
            to: [message.to],
          }),
          headers: {
            authorization: `Bearer ${input.settings.apiKey}`,
            "content-type": "application/json",
            "idempotency-key": key(),
          },
          method: "POST",
          // Workers support only "follow" and "manual"; a redirect is never followed.
          redirect: "manual",
          signal: AbortSignal.timeout(input.timeoutMs),
        });
      } catch {
        return emailFailed("unavailable");
      }
      await response.body?.cancel().catch(() => undefined);
      return response.ok ? EMAIL_SENT : emailFailed(resendReason(response.status));
    },
    reporter("resend", input.report ?? defaultEmailFailureReporter),
  );
}

/** Builds the runtime-neutral senders; runtime-specific providers are passed in. */
export function createEmailSender(
  settings: EmailSettings,
  options: {
    readonly fetch?: typeof fetch;
    readonly report?: EmailFailureReporter;
    readonly runtimeSender?: (settings: EmailSettings & { readonly from: string }) => EmailSender;
    readonly write?: (line: string) => void;
  } = {},
): EmailSender {
  switch (settings.provider) {
    case "none":
      return unconfiguredEmailSender;
    case "log":
      return createLogEmailSender({
        from: settings.from,
        ...(options.write ? { write: options.write } : {}),
      });
    case "resend":
      return createResendEmailSender({
        ...(options.fetch ? { fetch: options.fetch } : {}),
        from: settings.from,
        ...(options.report ? { report: options.report } : {}),
        settings: settings.resend,
        timeoutMs: settings.timeoutMs,
      });
    default:
      if (options.runtimeSender === undefined)
        throw new Error(`Email provider ${settings.provider} is not composed for this runtime.`);
      return options.runtimeSender(settings);
  }
}

/** The non-secret status Settings may display. */
export function emailDeliveryStatus(
  sender: Pick<EmailSender, "from" | "provider">,
):
  | { readonly provider: "none" }
  | { readonly from: string; readonly provider: Exclude<EmailProviderKind, "none"> } {
  if (sender.provider === "none" || sender.from === undefined)
    return Object.freeze({ provider: "none" });
  return Object.freeze({ from: sender.from, provider: sender.provider });
}
