import { fail } from "./failures.js";

/** A nominal marker for domain values that share a string representation. */
export type Brand<Value, Name extends string> = Value & { readonly __brand: Name };

export type ActorId = Brand<string, "ActorId">;
export type BlockKey = Brand<string, "BlockKey">;
export type ContentEntryId = Brand<string, "ContentEntryId">;
export type ContentModelKey = Brand<string, "ContentModelKey">;
export type ContentSnapshotId = Brand<string, "ContentSnapshotId">;
export type MediaId = Brand<string, "MediaId">;
export type SiteBuildId = Brand<string, "SiteBuildId">;
export type UnixMilliseconds = Brand<number, "UnixMilliseconds">;

function nonEmptyString<Name extends string>(value: string, name: Name): Brand<string, Name> {
  if (typeof value !== "string" || value.length === 0) {
    fail("CONTENT_INVALID_STATE", `${name} must be a non-empty string.`);
  }
  return value as Brand<string, Name>;
}

export function actorId(value: string): ActorId {
  return nonEmptyString(value, "ActorId");
}

export function blockKey(value: string): BlockKey {
  return nonEmptyString(value, "BlockKey");
}

export function contentEntryId(value: string): ContentEntryId {
  return nonEmptyString(value, "ContentEntryId");
}

export function contentModelKey(value: string): ContentModelKey {
  return nonEmptyString(value, "ContentModelKey");
}

export function contentSnapshotId(value: string): ContentSnapshotId {
  return nonEmptyString(value, "ContentSnapshotId");
}

export function mediaId(value: string): MediaId {
  return nonEmptyString(value, "MediaId");
}

export function siteBuildId(value: string): SiteBuildId {
  return nonEmptyString(value, "SiteBuildId");
}

export function unixMilliseconds(value: number): UnixMilliseconds {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail("CONTENT_INVALID_STATE", "UnixMilliseconds must be a non-negative safe integer.");
  }
  return value as UnixMilliseconds;
}
