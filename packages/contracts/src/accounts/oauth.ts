import * as v from "valibot";
import { identifierSchema, isoTimestampSchema, opaqueCursorSchema } from "../shared/primitives.js";

/** Session-only account capabilities and safe OAuth connection projections. */
export const accountCapabilitiesSchema = v.strictObject({ mcpEnabled: v.boolean() });
export const oauthConnectionSchema = v.strictObject({
  id: identifierSchema,
  clientName: v.pipe(v.string(), v.minLength(1), v.maxLength(120)),
  scopes: v.array(
    v.picklist(["content:read", "content:write", "content:publish", "offline_access"]),
  ),
  createdAt: isoTimestampSchema,
  expiresAt: isoTimestampSchema,
  revokedAt: v.nullable(isoTimestampSchema),
  lastUsedAt: v.optional(isoTimestampSchema),
});
export const oauthConnectionListSchema = v.strictObject({
  items: v.array(oauthConnectionSchema),
  nextCursor: v.nullable(opaqueCursorSchema),
});
export const oauthConnectionListQuerySchema = v.strictObject({
  after: v.optional(identifierSchema),
  limit: v.optional(v.pipe(v.string(), v.regex(/^(?:[1-9]|[1-4][0-9]|50)$/u))),
});
export const oauthConnectionRevokeSchema = v.strictObject({});
export type AccountCapabilitiesDto = v.InferOutput<typeof accountCapabilitiesSchema>;
export type OAuthConnectionDto = v.InferOutput<typeof oauthConnectionSchema>;
export type OAuthConnectionListDto = v.InferOutput<typeof oauthConnectionListSchema>;

export const mcpConsentDetailsSchema = v.strictObject({
  transaction: identifierSchema,
  clientName: v.string(),
  callbackHostname: v.string(),
  scopes: v.array(
    v.picklist(["content:read", "content:write", "content:publish", "offline_access"]),
  ),
  canWrite: v.boolean(),
  canPublish: v.boolean(),
});
export const mcpConsentNavigationSchema = v.strictObject({
  redirect: v.literal(true),
  url: v.string(),
});
export type McpConsentDetailsDto = v.InferOutput<typeof mcpConsentDetailsSchema>;
export type McpConsentNavigationDto = v.InferOutput<typeof mcpConsentNavigationSchema>;
