import {
  hasPermission,
  permissionsFor,
  requirePermission,
  type Actor,
  type Permission,
} from "@lacecms/domain";

/** Keeps the role matrix in the domain policy rather than HTTP handlers. */
export function requireUsersManager(actor: Actor): void {
  requirePermission(actor, "users:manage");
}

/** Authorizes installation settings: status, build tokens and email delivery checks. */
export function requireSettingsManager(actor: Actor): void {
  requirePermission(actor, "settings:manage");
}

/** The permissions the domain policy grants an actor, for session summaries. */
export function actorPermissions(actor: Actor): readonly Permission[] {
  return permissionsFor(actor.role);
}

/** The role's permissions narrowed by any delegated ceiling, in the domain's order. */
export function effectiveActorPermissions(actor: Actor): readonly Permission[] {
  return permissionsFor(actor.role).filter((permission) => hasPermission(actor, permission));
}

/** Authorizes read-only installation metadata with the existing content permission. */
export function requireContentReader(actor: Actor): void {
  requirePermission(actor, "content:read");
}
