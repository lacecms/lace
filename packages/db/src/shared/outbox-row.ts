/** An outbox event claimed by a runtime dispatcher, whatever its type. */
export interface OutboxRow {
  readonly attempts: number;
  readonly available_at: number;
  readonly id: string;
  readonly payload_json: string;
  readonly type: string;
}
