import type { ActorId } from "@lacecms/domain";

/** Display name used for `system:` audit actors such as configuration sync. */
export const SYSTEM_ACTOR_DISPLAY_NAME = "System";
/** Display name used when an audit actor no longer has a user record. */
export const UNKNOWN_ACTOR_DISPLAY_NAME = "Unknown user";

/** A human-readable actor reference that keeps raw IDs out of rendered lists. */
export interface ActorSummary {
  readonly displayName: string;
  readonly id: ActorId;
}

/** Resolves the portable display-name fallbacks shared by every runtime adapter. */
export function actorDisplayName(id: string, storedName?: string | null): string {
  const name = storedName?.trim();
  if (name !== undefined && name.length > 0) return name;
  return id.startsWith("system:") ? SYSTEM_ACTOR_DISPLAY_NAME : UNKNOWN_ACTOR_DISPLAY_NAME;
}
