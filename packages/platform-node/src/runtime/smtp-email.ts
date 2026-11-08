import {
  EMAIL_SENT,
  emailFailed,
  guardedEmailSender,
  type EmailFailureReason,
  type EmailSender,
} from "@lacecms/application";
import {
  defaultEmailFailureReporter,
  type EmailFailureReporter,
  type SmtpEmailSettings,
} from "@lacecms/server";
import { isIP } from "node:net";
import { createTransport } from "nodemailer";

function smtpReason(error: unknown): EmailFailureReason {
  const { code, responseCode } = (error ?? {}) as { code?: unknown; responseCode?: unknown };
  // Permanent sender, recipient or content refusals; everything else is transient.
  if (
    (code === "EENVELOPE" || code === "EMESSAGE") &&
    typeof responseCode === "number" &&
    responseCode >= 500 &&
    responseCode < 600
  ) {
    return "rejected";
  }
  return "unavailable";
}

/** SMTP through nodemailer; `starttls` refuses to continue without encryption. */
export function createSmtpEmailSender(input: {
  readonly from: string;
  readonly report?: EmailFailureReporter;
  readonly settings: SmtpEmailSettings;
  readonly timeoutMs: number;
}): EmailSender {
  const { auth, host, port, security } = input.settings;
  const transport = createTransport({
    ...(auth === undefined ? {} : { auth: { pass: auth.password, user: auth.user } }),
    connectionTimeout: input.timeoutMs,
    disableFileAccess: true,
    disableUrlAccess: true,
    greetingTimeout: input.timeoutMs,
    host,
    ignoreTLS: security === "none",
    logger: false,
    port,
    requireTLS: security === "starttls",
    secure: security === "tls",
    socketTimeout: input.timeoutMs,
    tls: { minVersion: "TLSv1.2", ...(isIP(host) === 0 ? { servername: host } : {}) },
  });
  const report = input.report ?? defaultEmailFailureReporter;
  return guardedEmailSender(
    "smtp",
    input.from,
    async (message) => {
      try {
        await transport.sendMail({
          from: input.from,
          ...(message.html === undefined ? {} : { html: message.html }),
          subject: message.subject,
          text: message.text,
          to: message.to,
        });
        return EMAIL_SENT;
      } catch (error) {
        return emailFailed(smtpReason(error));
      }
    },
    (reason) => report({ component: "email", provider: "smtp", reason }),
  );
}
