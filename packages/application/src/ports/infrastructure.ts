import type { UnixMilliseconds } from "@lacecms/domain";
import { LaceError } from "@lacecms/content";
import type { JsonObject } from "@lacecms/content";
import type { DispatcherEventId, DispatcherLeaseId } from "../shared/brands.js";

/** A runtime adapter refused its environment or a missing capability; internal to every transport. */
export class RuntimeConfigurationError extends LaceError<"RUNTIME_CONFIGURATION_INVALID"> {
  public constructor(message: string) {
    super("RUNTIME_CONFIGURATION_INVALID", message);
    this.name = "RuntimeConfigurationError";
  }
}

/** Operational evidence is deliberately sanitized before it crosses this port. */
export interface OperationalLogger {
  error(input: OperationalError): void | Promise<void>;
}

export interface OperationalError {
  readonly code: "MEDIA_METADATA_CREATE_FAILED" | "MEDIA_OBJECT_CLEANUP_FAILED";
  readonly storageKey: string;
}

/** A derived cache; callers must always remain correct on a miss. */
export interface Cache {
  delete(key: string): Promise<void>;
  get<Value>(key: string): Promise<Value | null>;
  set<Value>(key: string, value: Value): Promise<void>;
}

export interface Clock {
  now(): UnixMilliseconds;
}

export interface IdGenerator {
  next(): string;
}

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
