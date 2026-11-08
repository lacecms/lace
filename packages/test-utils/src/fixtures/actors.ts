import { actorId, attenuateActor } from "@lacecms/domain";
import type { Actor, DelegatedAuthority, Role } from "@lacecms/domain";

/** A frozen actor of `role`; the id defaults to the role name. */
export function testActor(role: Role, id: string = role): Actor {
  return Object.freeze({ id: actorId(id), role });
}

export const admin: Actor = testActor("admin");
export const editor: Actor = testActor("editor");
export const viewer: Actor = testActor("viewer");

/** The actor as a delegated client sees it: `base` narrowed to `authority`. */
export function delegatedActor(base: Actor, authority: DelegatedAuthority): Actor {
  return attenuateActor(base, authority);
}
