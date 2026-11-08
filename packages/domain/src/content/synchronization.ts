import { DomainError } from "../shared/errors.js";

/** The stable code of a stale configuration synchronization plan. */
export const CONFIGURATION_SYNC_STALE = "CONFIGURATION_SYNC_STALE";

/**
 * A configuration synchronization plan no longer matches the stored state it
 * was prepared against. Callers recognize it by `CONFIGURATION_SYNC_STALE` and
 * tell the operator to review and rerun synchronization.
 */
export class StaleSynchronizationError extends DomainError {
  public constructor(message: string) {
    super(CONFIGURATION_SYNC_STALE, message);
    this.name = "StaleSynchronizationError";
  }
}
