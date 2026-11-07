import type { UnixMilliseconds } from "@lacecms/domain";
import type { JsonObject } from "@lacecms/content";
import type { DispatcherEventId, DispatcherLeaseId } from "../shared/brands.js";

export interface DispatcherEvent {
  readonly attempts: number;
  readonly availableAt: UnixMilliseconds;
  readonly id: DispatcherEventId;
  readonly payload: JsonObject;
  readonly type: string;
}

export interface DispatcherRetryPolicy {
  readonly baseDelayMs: number;
  readonly maxAttempts: number;
  readonly maxDelayMs: number;
}

export interface DispatcherLease {
  readonly event: DispatcherEvent;
  readonly expiresAt: UnixMilliseconds;
  readonly id: DispatcherLeaseId;
}

export interface ClaimDispatcherEventsInput {
  readonly eventTypes: readonly string[];
  readonly limit: number;
  readonly now: UnixMilliseconds;
}

export interface CompleteDispatcherLeaseInput {
  readonly completedAt: UnixMilliseconds;
  readonly error?: string;
  readonly leaseId: DispatcherLeaseId;
  readonly outcome: "succeeded";
}

export interface RetryDispatcherLeaseInput {
  readonly error: string;
  readonly failedAt: UnixMilliseconds;
  readonly leaseId: DispatcherLeaseId;
  readonly retryAt?: UnixMilliseconds;
}

export interface DispatcherLeasePort {
  claim(input: ClaimDispatcherEventsInput): Promise<readonly DispatcherLease[]>;
  complete(input: CompleteDispatcherLeaseInput): Promise<void>;
  retry(input: RetryDispatcherLeaseInput): Promise<void>;
}
