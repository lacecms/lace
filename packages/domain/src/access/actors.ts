import type { ActorId } from "../shared/brands.js";

export type Role = "admin" | "editor" | "viewer";
export type Permission =
  | "content:read"
  | "content:write"
  | "content:publish"
  | "media:write"
  | "users:manage"
  | "settings:manage";

/** A provider-neutral, immutable ceiling which can only reduce an actor's authority. */
export interface DelegatedAuthority {
  readonly permissions: readonly Permission[];
  readonly operations: readonly string[];
}
/** The authenticated principal passed from an authentication adapter. */
export interface Actor {
  readonly id: ActorId;
  readonly role: Role;
  readonly authority?: DelegatedAuthority;
}

/** Copies the ceiling and intersects any existing one; never widens delegation. */
export function attenuateActor(actor: Actor, authority: DelegatedAuthority): Actor {
  const previous = actor.authority;
  return Object.freeze({
    id: actor.id,
    role: actor.role,
    authority: Object.freeze({
      permissions: Object.freeze(
        [...new Set(authority.permissions)].filter(
          (permission) => previous === undefined || previous.permissions.includes(permission),
        ),
      ),
      operations: Object.freeze(
        [...new Set(authority.operations)].filter(
          (operation) => previous === undefined || previous.operations.includes(operation),
        ),
      ),
    }),
  });
}
/** Historical attribution is identity data, never reusable request authority. */
export function auditActor(actor: Actor): Actor {
  return Object.freeze({ id: actor.id, role: actor.role });
}
