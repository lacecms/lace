import { deepFreeze } from "@lacecms/content";
import { fail } from "../shared/failures.js";
import type { Actor, Permission, Role } from "./actors.js";

/** The installation-wide permission policy. */
export const defaultRolePermissions: Readonly<Record<Role, readonly Permission[]>> = deepFreeze({
  admin: [
    "content:read",
    "content:write",
    "content:publish",
    "media:write",
    "users:manage",
    "settings:manage",
  ],
  editor: ["content:read", "content:write", "media:write"],
  viewer: ["content:read"],
});

/** Every permission the installation policy grants a role, in policy order. */
export function permissionsFor(role: Role): readonly Permission[] {
  return defaultRolePermissions[role];
}

export function hasPermission(actor: Actor, permission: Permission): boolean {
  return (
    permissionsFor(actor.role).includes(permission) &&
    (actor.authority === undefined || actor.authority.permissions.includes(permission))
  );
}

/** Requires a permission without requiring callers to duplicate role policy. */
export function requirePermission(actor: Actor, permission: Permission): void {
  if (!hasPermission(actor, permission)) {
    fail("AUTHORIZATION_DENIED", `Actor is missing permission ${permission}.`);
  }
}
