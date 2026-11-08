import * as v from "valibot";

export const emailFailureReasonSchema = v.picklist([
  "not_configured",
  "invalid_message",
  "rejected",
  "rate_limited",
  "unavailable",
]);
export type EmailFailureReasonDto = v.InferOutput<typeof emailFailureReasonSchema>;
export const accountLinkSchema = v.pipe(
  v.string(),
  v.url(),
  v.maxLength(2_048),
  v.regex(/^https?:\/\/[^\x23\s]+\x23token=[A-Za-z0-9_-]{43}$/u),
);
/** The closed outcome of one transactional email. */
export const emailDeliveryOutcomeSchema = v.union([
  v.strictObject({ status: v.literal("sent") }),
  v.strictObject({ reason: emailFailureReasonSchema, status: v.literal("failed") }),
]);
export type EmailDeliveryOutcomeDto = v.InferOutput<typeof emailDeliveryOutcomeSchema>;
export function linkOnlyWhenUndelivered<
  Value extends { readonly delivery: EmailDeliveryOutcomeDto; readonly link?: string | undefined },
>(value: Value): boolean {
  return (value.delivery.status === "sent") === (value.link === undefined);
}
