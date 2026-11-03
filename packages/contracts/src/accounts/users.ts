import * as v from "valibot";
import { identifierSchema } from "../shared/primitives.js";

export const roleSchema = v.picklist(["admin", "editor", "viewer"]);
export const emailSchema = v.pipe(v.string(), v.email(), v.maxLength(320));
export const passwordSchema = v.pipe(v.string(), v.minLength(12), v.maxLength(1_024));
export const setupStateSchema = v.strictObject({ setupComplete: v.boolean() });
export type SetupStateDto = v.InferOutput<typeof setupStateSchema>;

export const setupAdminRequestSchema = v.strictObject({
  email: emailSchema,
  password: passwordSchema,
  token: v.pipe(v.string(), v.minLength(40), v.maxLength(128)),
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
export const managedUserListSchema = v.strictObject({ items: v.array(managedUserSchema) });
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
