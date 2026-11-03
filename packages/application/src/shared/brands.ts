import type { Brand } from "@lacecms/domain";

export type OpaqueCursor = Brand<string, "OpaqueCursor">;
export type OpaqueTokenSecret = Brand<string, "OpaqueTokenSecret">;
export type OpaqueTokenVerifier = Brand<string, "OpaqueTokenVerifier">;
export type DispatcherEventId = Brand<string, "DispatcherEventId">;
export type DispatcherLeaseId = Brand<string, "DispatcherLeaseId">;
export type PublicationIdempotencyKey = Brand<string, "PublicationIdempotencyKey">;
export type PublicationRequestFingerprint = Brand<string, "PublicationRequestFingerprint">;

function opaqueBrand<Name extends string>(value: string, name: Name): Brand<string, Name> {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${name} must be a non-empty string.`);
  }
  return value as Brand<string, Name>;
}

export function opaqueCursor(value: string): OpaqueCursor {
  return opaqueBrand(value, "OpaqueCursor");
}

export function opaqueTokenSecret(value: string): OpaqueTokenSecret {
  return opaqueBrand(value, "OpaqueTokenSecret");
}

export function opaqueTokenVerifier(value: string): OpaqueTokenVerifier {
  return opaqueBrand(value, "OpaqueTokenVerifier");
}

export function dispatcherEventId(value: string): DispatcherEventId {
  return opaqueBrand(value, "DispatcherEventId");
}

export function dispatcherLeaseId(value: string): DispatcherLeaseId {
  return opaqueBrand(value, "DispatcherLeaseId");
}

/** A caller-supplied key that makes one guarded publication retry-safe. */
export function publicationIdempotencyKey(value: string): PublicationIdempotencyKey {
  return opaqueBrand(value, "PublicationIdempotencyKey");
}

/** Canonical application-generated identity of the complete publication request. */
export function publicationRequestFingerprint(value: string): PublicationRequestFingerprint {
  return opaqueBrand(value, "PublicationRequestFingerprint");
}
