import { requirePermission, type Actor, type UnixMilliseconds } from "@lacecms/domain";
import { requireSettingsManager } from "../shared/permissions.js";
import {
  MIN_IMPORT_TOKEN_LIFETIME_DAYS,
  MAX_IMPORT_TOKEN_LIFETIME_DAYS,
} from "../shared/limits.js";
import type { ImportTokenCapabilities } from "../ports/security.js";

/**
 * Chooses an import token's capabilities. Publication is granted only when the
 * creating actor currently holds `content:publish`; asking for it otherwise is
 * refused rather than silently narrowed.
 */
export function importTokenCapabilities(
  actor: Actor,
  allowPublish: boolean,
): ImportTokenCapabilities {
  requireSettingsManager(actor);
  if (!allowPublish) return ["content:import"];
  requirePermission(actor, "content:publish");
  return ["content:import", "content:publish"];
}

/** Validates a whole-day lifetime and returns the absolute expiry. */
export function importTokenExpiry(now: UnixMilliseconds, days: number): UnixMilliseconds {
  if (
    !Number.isInteger(days) ||
    days < MIN_IMPORT_TOKEN_LIFETIME_DAYS ||
    days > MAX_IMPORT_TOKEN_LIFETIME_DAYS
  )
    throw new RangeError("Import token lifetime must be 1 to 7 whole days.");
  return (Number(now) + days * 86_400_000) as UnixMilliseconds;
}
