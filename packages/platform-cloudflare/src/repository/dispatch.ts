import {
  DISPATCHER_LEASE_DURATION_MS,
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
import { D1_MAX_CLAIMS_PER_CALL } from "../d1/database.js";
import { D1RepositoryBase } from "./base.js";

/** D1 outbox dispatcher leases. */
export class D1DispatcherLeases extends D1RepositoryBase implements DispatcherLeasePort {
  public async claim(input: ClaimDispatcherEventsInput): Promise<readonly DispatcherLease[]> {
    if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > SQL_MAX_PAGE_SIZE) {
      failure("Dispatcher claim limit is invalid.");
    }
    if (input.eventTypes.length === 0 || input.eventTypes.some((type) => type.length === 0)) {
      failure("Dispatcher event types are invalid.");
    }
    const expired = input.now - DISPATCHER_LEASE_DURATION_MS;
    const rows = await this.all<OutboxRow>(
      `select id, type, payload_json, attempts, available_at
         from outbox_events
        where processed_at is null
          and type in (${input.eventTypes.map(() => "?").join(", ")})
          and available_at <= ?
          and (locked_at is null or locked_at <= ?)
        order by available_at asc, id asc
        limit ?`,
      ...input.eventTypes,
      input.now,
      expired,
      Math.min(input.limit, D1_MAX_CLAIMS_PER_CALL),
    );
    if (rows.length === 0) return Object.freeze([]);
    const batch = this.batch();
    const leaseIds = rows.map((row) => {
      const leaseId = dispatcherLeaseId(this.nextId());
      batch.add(
        "update outbox_events set locked_at = ?, locked_by = ? where id = ? and processed_at is null and (locked_at is null or locked_at <= ?)",
        input.now,
        leaseId,
        row.id,
        expired,
      );
      return leaseId;
    });
    const results = await this.execute(batch, false);
    const leases: DispatcherLease[] = [];
    rows.forEach((row, index) => {
      if (results[index]!.meta.changes !== 1) return;
      leases.push(
        Object.freeze({
          event: Object.freeze({
            attempts: assertNonNegativeInteger(row.attempts, "Outbox attempts"),
            availableAt: unixMilliseconds(assertTimestamp(row.available_at, "Outbox availability")),
            id: dispatcherEventId(row.id),
            payload: parseObject(row.payload_json, "Outbox payload"),
            type: row.type,
          }),
          expiresAt: unixMilliseconds(input.now + DISPATCHER_LEASE_DURATION_MS),
          id: leaseIds[index]!,
        }),
      );
    });
    return Object.freeze(leases);
  }

  public async complete(input: CompleteDispatcherLeaseInput): Promise<void> {
    const changed = await this.run(
      "update outbox_events set processed_at = ?, locked_at = null, locked_by = null where locked_by = ? and processed_at is null and locked_at > ?",
      input.completedAt,
      input.leaseId,
      input.completedAt - DISPATCHER_LEASE_DURATION_MS,
    );
    if (changed !== 1) failure("Dispatcher lease is missing or expired.");
  }

  public async retry(input: RetryDispatcherLeaseInput): Promise<void> {
    const changed = await this.run(
      "update outbox_events set attempts = attempts + 1, available_at = ?, locked_at = null, locked_by = null, last_error = ? where locked_by = ? and processed_at is null and locked_at > ?",
      input.retryAt ?? input.failedAt,
      sanitizeDispatchError(input.error),
      input.leaseId,
      input.failedAt - DISPATCHER_LEASE_DURATION_MS,
    );
    if (changed !== 1) failure("Dispatcher lease is missing or expired.");
  }
}
