import type { EmailFailureReasonDto } from "@lacecms/contracts";

const explanations: Readonly<Record<EmailFailureReasonDto, string>> = {
  invalid_message: "The email could not be addressed, so it was not sent.",
  not_configured: "Email delivery is not configured on this server, so no email was sent.",
  rate_limited: "The email provider's sending limit was reached, so the email was not sent.",
  rejected: "The email provider rejected the message, so it was not sent.",
  unavailable: "The email provider could not be reached, so the email was not sent.",
};

/** Explains a closed delivery failure in plain words, without provider error text. */
export function deliveryFailureExplanation(reason: EmailFailureReasonDto): string {
  return explanations[reason];
}
