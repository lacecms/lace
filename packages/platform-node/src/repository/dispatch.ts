import {
  DISPATCHER_LEASE_DURATION_MS,
  MAX_DISPATCHER_CLAIMS_PER_CALL,
  dispatcherEventId,
  dispatcherLeaseId,
} from "@lacecms/application";
import type {
  ClaimDispatcherEventsInput,
  CompleteDispatcherLeaseInput,
  DispatcherLease,
  DispatcherLeasePort,
  RetryDispatcherLeaseInput,
} from "@lacecms/application";
import {
  SQL_MAX_PAGE_SIZE,
  assertNonNegativeInteger,
  assertTimestamp,
  failure,
  parseObject,
  sanitizeDispatchError,
} from "@lacecms/db";
import type { OutboxRow } from "@lacecms/db";
import { unixMilliseconds } from "@lacecms/domain";
import { NodeRepositoryBase } from "./base.js";

/** Node outbox dispatcher leases. */
export class NodeDispatcherLeases extends NodeRepositoryBase implements DispatcherLeasePort {
  public async claim(input: ClaimDispatcherEventsInput): Promise<readonly DispatcherLease[]> {
    if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > SQL_MAX_PAGE_SIZE) {
      failure("Dispatcher claim limit is invalid.");
    }
    if (input.eventTypes.length === 0 || input.eventTypes.some((type) => type.length === 0)) {
      failure("Dispatcher event types are invalid.");
    }
    const placeholders = input.eventTypes.map(() => "?").join(", ");
    const leases: DispatcherLease[] = [];
    try {
      this.connection.transaction(() => {
        const rows = this.connection
          .prepare(
            `select id, type, payload_json, attempts, available_at
               from outbox_events
              where processed_at is null
                and type in (${placeholders})
                and available_at <= ?
                and (locked_at is null or locked_at <= ?)
              order by available_at asc, id asc
              limit ?`,
          )
          .all(
            ...input.eventTypes,
            input.now,
            input.now - DISPATCHER_LEASE_DURATION_MS,
            Math.min(input.limit, MAX_DISPATCHER_CLAIMS_PER_CALL),
          ) as readonly OutboxRow[];
        const claim = this.connection.prepare(
          "update outbox_events set locked_at = ?, locked_by = ? where id = ? and processed_at is null and (locked_at is null or locked_at <= ?)",
        );
        for (const row of rows) {
          const leaseId = dispatcherLeaseId(this.nextId());
          const claimed = claim.run(
            input.now,
            leaseId,
            row.id,
            input.now - DISPATCHER_LEASE_DURATION_MS,
          );
          if (claimed.changes !== 1) continue;
          leases.push(
            Object.freeze({
              event: Object.freeze({
                attempts: assertNonNegativeInteger(row.attempts, "Outbox attempts"),
                availableAt: unixMilliseconds(
                  assertTimestamp(row.available_at, "Outbox availability"),
                ),
                id: dispatcherEventId(row.id),
                payload: parseObject(row.payload_json, "Outbox payload"),
                type: row.type,
              }),
              expiresAt: unixMilliseconds(input.now + DISPATCHER_LEASE_DURATION_MS),
              id: leaseId,
            }),
          );
        }
      })();
    } catch (error) {
      this.throwWriteError(error, false);
    }
    return Object.freeze(leases);
  }

  public async complete(input: CompleteDispatcherLeaseInput): Promise<void> {
    try {
      const changed = this.connection
        .prepare(
          "update outbox_events set processed_at = ?, locked_at = null, locked_by = null where locked_by = ? and processed_at is null and locked_at > ?",
        )
        .run(input.completedAt, input.leaseId, input.completedAt - DISPATCHER_LEASE_DURATION_MS);
      if (changed.changes !== 1) failure("Dispatcher lease is missing or expired.");
    } catch (error) {
      this.throwWriteError(error, false);
    }
  }

  public async retry(input: RetryDispatcherLeaseInput): Promise<void> {
    try {
      const changed = this.connection
        .prepare(
          "update outbox_events set attempts = attempts + 1, available_at = ?, locked_at = null, locked_by = null, last_error = ? where locked_by = ? and processed_at is null and locked_at > ?",
        )
        .run(
          input.retryAt ?? input.failedAt,
          sanitizeDispatchError(input.error),
          input.leaseId,
          input.failedAt - DISPATCHER_LEASE_DURATION_MS,
        );
      if (changed.changes !== 1) failure("Dispatcher lease is missing or expired.");
    } catch (error) {
      this.throwWriteError(error, false);
    }
  }
}
