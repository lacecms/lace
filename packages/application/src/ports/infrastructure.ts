import type { UnixMilliseconds } from "@lacecms/domain";
import { LaceError } from "@lacecms/content";

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
