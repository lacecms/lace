/** A bound statement shared by the Node SQLite and D1 repositories. */
export interface IdempotencySqlStatement {
  readonly sql: string;
  readonly params: readonly (string | number)[];
}

/** Maximum expired idempotency records one maintenance call deletes. */
export const IDEMPOTENCY_PURGE_LIMIT = 20;

/**
 * Reads the live record of one scope and key. Parameters: scope, key, then the
 * command's clock time; a record expiring at or before it is treated as absent.
 */
export const LIVE_IDEMPOTENCY_RECORD_SQL =
  "select request_hash, response_json from idempotency_records where scope = ? and key = ? and expires_at > ?";

/**
 * Condition that no live record holds one scope and key. Parameters: scope,
 * key, then the command's clock time.
 */
export const NO_LIVE_IDEMPOTENCY_RECORD_SQL =
  "not exists (select 1 from idempotency_records where scope = ? and key = ? and expires_at > ?)";

/**
 * Deletes the expired record of one scope and key before a committed mutation
 * inserts its own. `guard` is a trusted condition whose parameters the caller
 * appends after the returned ones.
 */
export function deleteExpiredIdempotencyRecordStatement(
  scope: string,
  key: string,
  now: number,
  guard = "1",
): IdempotencySqlStatement {
  return {
    sql: `delete from idempotency_records where scope = ? and key = ? and expires_at <= ? and ${guard}`,
    params: [scope, key, now],
  };
}

/** Deletes at most `limit` expired records; unexpired records are never touched. */
export function purgeExpiredIdempotencyRecordsStatement(
  now: number,
  limit: number,
): IdempotencySqlStatement {
  if (!Number.isInteger(limit) || limit < 1 || limit > IDEMPOTENCY_PURGE_LIMIT)
    throw new TypeError("Invalid idempotency purge limit.");
  return {
    sql: `delete from idempotency_records where (scope, key) in
      (select scope, key from idempotency_records where expires_at <= ? limit ?)`,
    params: [now, limit],
  };
}
