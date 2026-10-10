import {
  EMAIL_SENT,
  emailFailed,
  guardedEmailSender,
  parseEmailSender,
  type EmailFailureReason,
  type EmailSender,
} from "@lacecms/application";
import { defaultEmailFailureReporter, type EmailFailureReporter } from "@lacecms/server";

/** Structural subset of the Email Service `send_email` binding. */
export interface SendEmailBinding {
  send(message: {
    readonly from: string | { readonly email: string; readonly name: string };
    readonly html?: string;
    readonly subject: string;
    readonly text: string;
    readonly to: string;
  }): Promise<unknown>;
}

const REASONS: Readonly<Record<string, EmailFailureReason>> = Object.freeze({
  E_CONTENT_TOO_LARGE: "invalid_message",
  E_DAILY_LIMIT_EXCEEDED: "rate_limited",
  E_DELIVERY_FAILED: "unavailable",
  E_FIELD_MISSING: "invalid_message",
  E_INTERNAL_SERVER_ERROR: "unavailable",
  E_RATE_LIMIT_EXCEEDED: "rate_limited",
  E_RECIPIENT_NOT_ALLOWED: "rejected",
  E_RECIPIENT_SUPPRESSED: "rejected",
  E_SENDER_DOMAIN_NOT_AVAILABLE: "rejected",
  E_SENDER_NOT_VERIFIED: "rejected",
  E_TOO_MANY_RECIPIENTS: "invalid_message",
  E_VALIDATION_ERROR: "invalid_message",
});

function bindingReason(error: unknown): EmailFailureReason {
  const code = (error ?? {}) as { code?: unknown };
  return (typeof code.code === "string" && REASONS[code.code]) || "unavailable";
}

/** Cloudflare Email Service through the Worker binding (Workers Paid, onboarded domain). */
export function createCloudflareEmailSender(input: {
  readonly binding: SendEmailBinding;
  readonly from: string;
  readonly report?: EmailFailureReporter;
  readonly timeoutMs: number;
}): EmailSender {
  const sender = parseEmailSender(input.from);
  const from =
    sender?.name === undefined ? input.from : { email: sender.address, name: sender.name };
  const report = input.report ?? defaultEmailFailureReporter;
  return guardedEmailSender(
    "cloudflare",
    input.from,
    async (message) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          input.binding.send({
            from,
            ...(message.html === undefined ? {} : { html: message.html }),
            subject: message.subject,
            text: message.text,
            to: message.to,
          }),
          new Promise((_resolve, reject) => {
            timer = setTimeout(() => reject(new Error("timeout")), input.timeoutMs);
          }),
        ]);
        return EMAIL_SENT;
      } catch (error) {
        return emailFailed(bindingReason(error));
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    },
    (reason) => report({ component: "email", provider: "cloudflare", reason }),
  );
}
