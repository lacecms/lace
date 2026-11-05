import { MAX_DISPLAY_NAME_LENGTH } from "@lacecms/domain";
import * as v from "valibot";
import { identifierSchema, isoTimestampSchema } from "../shared/primitives.js";
import { emailSchema, roleSchema, passwordSchema } from "./users.js";
import {
  accountLinkSchema,
  emailDeliveryOutcomeSchema,
  linkOnlyWhenUndelivered,
} from "./email-delivery.js";

/** Invitation and reset tokens: 32 random bytes as unpadded base64url. */
export const accountTokenSchema = v.pipe(v.string(), v.regex(/^[A-Za-z0-9_-]{43}$/u));
// oxlint-disable-next-line no-control-regex -- rejects control characters by design.
const controlCharacterPattern = /[\u0000-\u001f\u007f-\u009f]/u;
/** A display name of 1 to 120 characters after trimming, without control characters. */
export const displayNameSchema = v.pipe(
  v.string(),
  v.maxLength(1_024),
  v.check(
    (value) => value.trim().length >= 1 && value.trim().length <= MAX_DISPLAY_NAME_LENGTH,
    `Enter a name of 1 to ${MAX_DISPLAY_NAME_LENGTH} characters.`,
  ),
  v.check((value) => !controlCharacterPattern.test(value), "Control characters are not allowed."),
);
export const invitationCreateRequestSchema = v.strictObject({
  email: emailSchema,
  role: roleSchema,
});
export const invitationResendRequestSchema = v.strictObject({});
export const invitationStateSchema = v.picklist(["pending", "expired"]);
/** A listed invitation; never carries a token or link. */
export const invitationSchema = v.strictObject({
  createdAt: isoTimestampSchema,
  email: emailSchema,
  expiresAt: isoTimestampSchema,
  id: identifierSchema,
  invitedBy: v.pipe(v.string(), v.minLength(1), v.maxLength(320)),
  role: roleSchema,
  state: invitationStateSchema,
});
export const invitationListSchema = v.strictObject({ items: v.array(invitationSchema) });
/** The accept link is present exactly when the invitation email was not sent. */
export const invitationIssueResultSchema = v.pipe(
  v.strictObject({
    delivery: emailDeliveryOutcomeSchema,
    invitation: invitationSchema,
    link: v.optional(accountLinkSchema),
  }),
  v.check(linkOnlyWhenUndelivered, "A link is present exactly when delivery was not sent."),
);
export const invitationInspectRequestSchema = v.strictObject({ token: accountTokenSchema });
export const invitationInspectResultSchema = v.strictObject({
  email: emailSchema,
  expiresAt: isoTimestampSchema,
  role: roleSchema,
});
export const invitationAcceptRequestSchema = v.strictObject({
  displayName: v.optional(displayNameSchema),
  password: passwordSchema,
  token: accountTokenSchema,
});
export const invitationAcceptResultSchema = v.strictObject({ email: emailSchema });
export const passwordResetRequestSchema = v.strictObject({ email: emailSchema });
export const passwordResetConfirmRequestSchema = v.strictObject({
  password: passwordSchema,
  token: accountTokenSchema,
});
export const adminPasswordResetRequestSchema = v.strictObject({});
/** The reset link is present exactly when the reset email was not sent. */
export const adminPasswordResetResultSchema = v.pipe(
  v.strictObject({ delivery: emailDeliveryOutcomeSchema, link: v.optional(accountLinkSchema) }),
  v.check(linkOnlyWhenUndelivered, "A link is present exactly when delivery was not sent."),
);
export const accountProfileUpdateRequestSchema = v.strictObject({
  displayName: displayNameSchema,
});
export const accountPasswordChangeRequestSchema = v.strictObject({
  currentPassword: v.pipe(v.string(), v.minLength(1), v.maxLength(1_024)),
  newPassword: passwordSchema,
  signOutOtherSessions: v.boolean(),
});
export type InvitationDto = v.InferOutput<typeof invitationSchema>;
export type InvitationListDto = v.InferOutput<typeof invitationListSchema>;
export type InvitationIssueResultDto = v.InferOutput<typeof invitationIssueResultSchema>;
export type InvitationInspectResultDto = v.InferOutput<typeof invitationInspectResultSchema>;
export type InvitationAcceptResultDto = v.InferOutput<typeof invitationAcceptResultSchema>;
export type AdminPasswordResetResultDto = v.InferOutput<typeof adminPasswordResetResultSchema>;
