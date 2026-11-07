import * as v from "valibot";
import {
  identifierSchema,
  isoTimestampSchema,
  nonNegativeIntegerSchema,
} from "../shared/primitives.js";

export const sessionBrowserSchema = v.picklist([
  "Chrome",
  "Edge",
  "Firefox",
  "Opera",
  "Safari",
  "Unknown",
]);
export const sessionOsSchema = v.picklist([
  "Android",
  "iOS",
  "Linux",
  "macOS",
  "Windows",
  "Unknown",
]);
/** One of the signed-in user's sessions; never a session token or IP address. */
export const accountSessionSchema = v.strictObject({
  browser: sessionBrowserSchema,
  createdAt: isoTimestampSchema,
  current: v.boolean(),
  id: identifierSchema,
  lastActiveAt: isoTimestampSchema,
  os: sessionOsSchema,
});
export const accountSessionListSchema = v.strictObject({ items: v.array(accountSessionSchema) });
export const sessionRevokeRequestSchema = v.strictObject({});
export const sessionRevocationResultSchema = v.strictObject({ revoked: nonNegativeIntegerSchema });
export type AccountSessionDto = v.InferOutput<typeof accountSessionSchema>;
export type AccountSessionListDto = v.InferOutput<typeof accountSessionListSchema>;
export type SessionRevocationResultDto = v.InferOutput<typeof sessionRevocationResultSchema>;
