import {
  DISPATCHER_LEASE_DURATION_MS,
  dispatcherLeaseId,
  opaqueTokenVerifier,
} from "@lacecms/application";
import type {
  BuildTriggerResult,
  ByteStream,
  Cache,
  ClaimDispatcherEventsInput,
  Clock,
  CompleteDispatcherLeaseInput,
  DispatcherEvent,
  DispatcherLease,
  DispatcherLeasePort,
  IdGenerator,
  RetryDispatcherLeaseInput,
  ObjectStorage,
  OpaqueTokenHasher,
  OpaqueTokenSecret,
  OpaqueTokenVerifier,
  PutObjectInput,
  ReadUrlOptions,
  SiteBuildRequest,
  SiteBuildTrigger,
  StoredObject,
} from "@lacecms/application";
import { unixMilliseconds } from "@lacecms/domain";
import type { UnixMilliseconds } from "@lacecms/domain";

import { assertPositiveInteger, clone, collectBytes, bytesStream } from "./assertions.js";
/** Deterministic clock for portable application and adapter contract tests. */
export class DeterministicClock implements Clock {
  private value: UnixMilliseconds;

  public constructor(initial: UnixMilliseconds) {
    this.value = initial;
  }

  public advanceBy(milliseconds: number): UnixMilliseconds {
    if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) {
      throw new TypeError("milliseconds must be a non-negative safe integer.");
    }
    this.value = unixMilliseconds(this.value + milliseconds);
    return this.now();
  }

  public now(): UnixMilliseconds {
    return this.value;
  }
}

/** Deterministic IDs make stateful fakes reproducible without a runtime UUID API. */
export class DeterministicIdGenerator implements IdGenerator {
  private nextValue = 1;

  public constructor(private readonly prefix = "id") {}

  public next(): string {
    const value = `${this.prefix}-${this.nextValue}`;
    this.nextValue += 1;
    return value;
  }
}

export class InMemoryObjectStorage implements ObjectStorage {
  private readonly objects = new Map<string, { bytes: Uint8Array; contentType: string }>();

  public async createReadUrl(key: string, options?: ReadUrlOptions): Promise<string> {
    if (!this.objects.has(key)) throw new Error(`Object ${key} does not exist.`);
    const expires = options?.expiresAt === undefined ? "" : `?expires=${options.expiresAt}`;
    return `memory-object://${encodeURIComponent(key)}${expires}`;
  }

  public async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }

  public async get(key: string): Promise<ByteStream | null> {
    const object = this.objects.get(key);
    return object === undefined ? null : bytesStream(object.bytes);
  }

  public async put(input: PutObjectInput): Promise<StoredObject> {
    const bytes = await collectBytes(input.body);
    this.objects.set(input.key, { bytes: bytes.slice(), contentType: input.contentType });
    return Object.freeze({
      contentType: input.contentType,
      key: input.key,
      size: bytes.byteLength,
    });
  }
}

/** An intentionally simple cache fake; production callers must tolerate misses. */
export class InMemoryCache implements Cache {
  private readonly values = new Map<string, unknown>();

  public async delete(key: string): Promise<void> {
    this.values.delete(key);
  }

  public async get<Value>(key: string): Promise<Value | null> {
    const value = this.values.get(key);
    return value === undefined ? null : (clone(value) as Value);
  }

  public async set<Value>(key: string, value: Value): Promise<void> {
    this.values.set(key, clone(value));
  }
}

export class InMemorySiteBuildTrigger implements SiteBuildTrigger {
  public readonly requests: SiteBuildRequest[] = [];

  public constructor(private readonly result: BuildTriggerResult = { status: "succeeded" }) {}

  public async trigger(input: SiteBuildRequest): Promise<BuildTriggerResult> {
    this.requests.push(clone(input));
    return clone(this.result);
  }
}

/** Test-only deterministic verifier; production adapters provide password hashing. */
export class DeterministicTokenHasher implements OpaqueTokenHasher {
  public async hash(secret: OpaqueTokenSecret): Promise<OpaqueTokenVerifier> {
    let value = 2_166_136_261;
    for (const character of secret) {
      value ^= character.codePointAt(0) ?? 0;
      value = Math.imul(value, 16_777_619);
    }
    return opaqueTokenVerifier(`test-v1-${(value >>> 0).toString(16)}`);
  }

  public async verify(secret: OpaqueTokenSecret, verifier: OpaqueTokenVerifier): Promise<boolean> {
    return verifier === (await this.hash(secret));
  }
}

interface StoredLease {
  readonly expiresAt: UnixMilliseconds;
  readonly eventId: string;
}

export class InMemoryDispatcherLeasePort implements DispatcherLeasePort {
  private readonly events = new Map<string, DispatcherEvent>();
  private readonly leases = new Map<string, StoredLease>();
  private nextLease = 1;

  public enqueue(event: DispatcherEvent): void {
    this.events.set(event.id, clone(event));
  }

  public async claim(input: ClaimDispatcherEventsInput): Promise<readonly DispatcherLease[]> {
    assertPositiveInteger(input.limit, "limit");
    if (input.eventTypes.length === 0 || input.eventTypes.some((type) => type.length === 0)) {
      throw new TypeError("eventTypes must contain non-empty strings.");
    }
    const activelyLeased = new Set(
      [...this.leases.values()]
        .filter((lease) => lease.expiresAt > input.now)
        .map((lease) => lease.eventId),
    );
    const leases: DispatcherLease[] = [];
    for (const event of [...this.events.values()].sort((left, right) =>
      left.id.localeCompare(right.id),
    )) {
      if (
        leases.length === input.limit ||
        !input.eventTypes.includes(event.type) ||
        event.availableAt > input.now ||
        activelyLeased.has(event.id)
      )
        continue;
      const id = dispatcherLeaseId(`lease-${this.nextLease}`);
      this.nextLease += 1;
      const expiresAt = unixMilliseconds(input.now + DISPATCHER_LEASE_DURATION_MS);
      this.leases.set(id, { eventId: event.id, expiresAt });
      leases.push(Object.freeze({ event: clone(event), expiresAt, id }));
    }
    return Object.freeze(leases);
  }

  public async complete(input: CompleteDispatcherLeaseInput): Promise<void> {
    const lease = this.leases.get(input.leaseId);
    if (lease === undefined || lease.expiresAt <= input.completedAt) {
      throw new Error("Dispatcher lease is missing or expired.");
    }
    this.leases.delete(input.leaseId);
    this.events.delete(lease.eventId);
  }

  public async retry(input: RetryDispatcherLeaseInput): Promise<void> {
    const lease = this.leases.get(input.leaseId);
    if (lease === undefined || lease.expiresAt <= input.failedAt) {
      throw new Error("Dispatcher lease is missing or expired.");
    }
    this.leases.delete(input.leaseId);
    const event = this.events.get(lease.eventId);
    if (event !== undefined) {
      this.events.set(event.id, {
        ...event,
        attempts: event.attempts + 1,
        availableAt: input.retryAt ?? input.failedAt,
      });
    }
  }
}
