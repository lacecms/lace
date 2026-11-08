import * as v from "valibot";
import { ParsedUrl } from "../shared/url.js";
import { nonNegativeIntegerSchema } from "../shared/primitives.js";
import { emailFailureReasonSchema } from "../accounts/email-delivery.js";

export const emailProviderSchema = v.picklist(["none", "log", "smtp", "resend", "cloudflare"]);
export type EmailProviderDto = v.InferOutput<typeof emailProviderSchema>;
const emailSenderSchema = v.pipe(v.string(), v.minLength(3), v.maxLength(400));
export const emailDeliveryStatusSchema = v.union([
  v.strictObject({ provider: v.literal("none") }),
  v.strictObject({
    from: emailSenderSchema,
    provider: v.picklist(["log", "smtp", "resend", "cloudflare"]),
  }),
]);
export type EmailDeliveryStatusDto = v.InferOutput<typeof emailDeliveryStatusSchema>;
export const emailTestRequestSchema = v.strictObject({});
export const emailTestResultSchema = v.union([
  v.strictObject({ status: v.literal("sent") }),
  v.strictObject({ reason: emailFailureReasonSchema, status: v.literal("failed") }),
]);
export type EmailTestResultDto = v.InferOutput<typeof emailTestResultSchema>;
export const mcpSettingsStatusSchema = v.strictObject({
  enabled: v.boolean(),
  endpoint: v.pipe(
    v.string(),
    v.maxLength(2_048),
    v.check((value) => {
      try {
        const url = new ParsedUrl(value);
        return (
          (url.protocol === "http:" || url.protocol === "https:") &&
          url.pathname === "/mcp" &&
          !url.username &&
          !url.password &&
          !url.search &&
          !url.hash &&
          url.href === value
        );
      } catch {
        return false;
      }
    }, "Expected a canonical MCP endpoint."),
  ),
});
export const adminSettingsStatusSchema = v.strictObject({
  configuredModels: nonNegativeIntegerSchema,
  mcp: mcpSettingsStatusSchema,
  email: emailDeliveryStatusSchema,
  engineVersion: v.pipe(v.string(), v.minLength(1), v.maxLength(120)),
  ready: v.boolean(),
});
export type AdminSettingsStatusDto = v.InferOutput<typeof adminSettingsStatusSchema>;
