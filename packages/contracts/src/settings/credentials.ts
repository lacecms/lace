import type { UnixMilliseconds } from "@lacecms/domain";
import * as v from "valibot";
import { identifierSchema, isoTimestampSchema, toIsoTimestamp } from "../shared/primitives.js";
import { permissionSchema } from "../accounts/users.js";

export const buildTokenCreateRequestSchema = v.strictObject({
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(120)),
});
export const buildTokenSchema = v.strictObject({
  capabilities: v.tuple([v.literal("content:build:read")]),
  createdAt: isoTimestampSchema,
  id: identifierSchema,
  lastUsedAt: v.optional(isoTimestampSchema),
  name: v.string(),
  revokedAt: v.optional(isoTimestampSchema),
  tokenPrefix: v.string(),
});
export const buildTokenCreatedSchema = v.strictObject({
  ...buildTokenSchema.entries,
  token: v.string(),
});
export const buildTokenListSchema = v.strictObject({ items: v.array(buildTokenSchema) });
/** Import tokens let `lace import` write as their creator for 1 to 7 days (ADR 0016). */
export const importTokenCreateRequestSchema = v.strictObject({
  allowPublish: v.optional(v.boolean(), false),
  expiresInDays: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(7)),
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(120)),
});
export const importTokenSchema = v.strictObject({
  // Strict tuples: a loose first option would silently drop `content:publish`.
  capabilities: v.union([
    v.strictTuple([v.literal("content:import")]),
    v.strictTuple([v.literal("content:import"), v.literal("content:publish")]),
  ]),
  createdAt: isoTimestampSchema,
  createdBy: v.strictObject({
    displayName: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(320))),
    email: v.string(),
    id: identifierSchema,
  }),
  expiresAt: isoTimestampSchema,
  id: identifierSchema,
  lastUsedAt: v.optional(isoTimestampSchema),
  name: v.string(),
  revokedAt: v.optional(isoTimestampSchema),
  tokenPrefix: v.string(),
});
export const importTokenCreatedSchema = v.strictObject({
  ...importTokenSchema.entries,
  token: v.string(),
});
export const importTokenListSchema = v.strictObject({ items: v.array(importTokenSchema) });
/** What `GET /api/v1/admin/import-credential` tells an import client about itself. */
export const importCredentialSchema = v.strictObject({
  permissions: v.pipe(
    v.array(permissionSchema),
    v.check((items) => new Set(items).size === items.length, "Permissions must be unique."),
  ),
  token: importTokenSchema,
});
export type BuildTokenDto = v.InferOutput<typeof buildTokenSchema>;
export type BuildTokenCreatedDto = v.InferOutput<typeof buildTokenCreatedSchema>;
export type ImportTokenCreateRequestDto = v.InferInput<typeof importTokenCreateRequestSchema>;
export type ImportTokenDto = v.InferOutput<typeof importTokenSchema>;
export type ImportTokenCreatedDto = v.InferOutput<typeof importTokenCreatedSchema>;
export type ImportTokenListDto = v.InferOutput<typeof importTokenListSchema>;
export type ImportCredentialDto = v.InferOutput<typeof importCredentialSchema>;

export interface ImportTokenDtoSource {
  readonly capabilities:
    | readonly ["content:import"]
    | readonly ["content:import", "content:publish"];
  readonly createdAt: UnixMilliseconds;
  readonly createdBy: {
    readonly displayName?: string;
    readonly email: string;
    readonly id: string;
  };
  readonly expiresAt: UnixMilliseconds;
  readonly id: string;
  readonly lastUsedAt?: UnixMilliseconds;
  readonly name: string;
  readonly revokedAt?: UnixMilliseconds;
  readonly tokenPrefix: string;
}

/** Maps import-token metadata; the plaintext is added only by the creation response. */
export function toImportTokenDto(token: ImportTokenDtoSource): ImportTokenDto {
  return {
    capabilities: [...token.capabilities] as ImportTokenDto["capabilities"],
    createdAt: toIsoTimestamp(token.createdAt),
    createdBy: {
      ...(token.createdBy.displayName === undefined
        ? {}
        : { displayName: token.createdBy.displayName }),
      email: token.createdBy.email,
      id: token.createdBy.id,
    },
    expiresAt: toIsoTimestamp(token.expiresAt),
    id: token.id,
    ...(token.lastUsedAt === undefined ? {} : { lastUsedAt: toIsoTimestamp(token.lastUsedAt) }),
    name: token.name,
    ...(token.revokedAt === undefined ? {} : { revokedAt: toIsoTimestamp(token.revokedAt) }),
    tokenPrefix: token.tokenPrefix,
  };
}
export type BuildTokenListDto = v.InferOutput<typeof buildTokenListSchema>;
