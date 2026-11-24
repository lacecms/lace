import * as v from "valibot";
import {
  cursorPageSchema,
  identifierSchema,
  nonNegativeIntegerSchema,
} from "../shared/primitives.js";
import {
  accountLinkSchema,
  emailDeliveryOutcomeSchema,
  linkOnlyWhenUndelivered,
} from "./email-delivery.js";

export const roleSchema = v.picklist(["admin", "editor", "viewer"]);
const accountEmailChecks = [v.email(), v.maxLength<string, 320>(320)] as const;
export const emailSchema = v.pipe(v.string(), ...accountEmailChecks);
export const passwordSchema = v.pipe(v.string(), v.minLength(12), v.maxLength(1_024));
export const setupStateSchema = v.strictObject({ setupComplete: v.boolean() });
export type SetupStateDto = v.InferOutput<typeof setupStateSchema>;

export const setupAdminRequestSchema = v.strictObject({
  email: emailSchema,
  password: passwordSchema,
  token: v.pipe(v.string(), v.minLength(40), v.maxLength(128)),
});
export const userCreateRequestSchema = v.strictObject({
  email: v.pipe(v.string(), v.trim(), ...accountEmailChecks),
  role: roleSchema,
});
export const userUpdateRequestSchema = v.strictObject({
  disabled: v.optional(v.boolean()),
  role: v.optional(roleSchema),
});
export const managedUserSchema = v.strictObject({
  disabled: v.boolean(),
  email: emailSchema,
  id: identifierSchema,
  role: roleSchema,
});
export const userCreateResultSchema = v.pipe(
  v.strictObject({
    delivery: emailDeliveryOutcomeSchema,
    link: v.optional(
      v.pipe(
        accountLinkSchema,
        v.regex(/^https?:\/\/[^?\x23\s]+\/admin\/reset-password\x23token=/u),
      ),
    ),
    user: v.strictObject({ ...managedUserSchema.entries, disabled: v.literal(false) }),
  }),
  v.check(linkOnlyWhenUndelivered, "A link is present exactly when delivery was not sent."),
);
export type UserCreateResultDto = v.InferOutput<typeof userCreateResultSchema>;
export const managedUserListSchema = v.strictObject({
  ...cursorPageSchema(managedUserSchema).entries,
  disabledCount: nonNegativeIntegerSchema,
  total: nonNegativeIntegerSchema,
});
export const permissionSchema = v.picklist([
  "content:read",
  "content:write",
  "content:publish",
  "media:write",
  "users:manage",
  "settings:manage",
]);
export type PermissionDto = v.InferOutput<typeof permissionSchema>;
/** The signed-in user's identity and server-derived permissions; no credential material. */
export const adminSessionSchema = v.strictObject({
  permissions: v.pipe(
    v.array(permissionSchema),
    v.check((items) => new Set(items).size === items.length, "Permissions must be unique."),
  ),
  user: v.strictObject({
    displayName: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(320))),
    email: emailSchema,
    id: identifierSchema,
    role: roleSchema,
  }),
});
export type AdminSessionDto = v.InferOutput<typeof adminSessionSchema>;
export type ManagedUserDto = v.InferOutput<typeof managedUserSchema>;
export type ManagedUserListDto = v.InferOutput<typeof managedUserListSchema>;
