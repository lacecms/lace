import * as v from "valibot";
import { entityTagSchema, expectedRevisionSchema, nonNegativeIntegerSchema } from "./primitives.js";
import type { EntityTag } from "./primitives.js";

/** Derives the build-export entity tag from the published-state version. */
export function entityTagForVersion(version: number): EntityTag {
  const parsed = v.safeParse(nonNegativeIntegerSchema, version);
  if (!parsed.success || !Number.isSafeInteger(version))
    throw new TypeError("An ETag version must be a non-negative safe integer.");
  return `"${parsed.output}"` as EntityTag;
}

/** Parses the version encoded in a supported, version-derived entity tag. */
export function versionFromEntityTag(value: string): number {
  const parsed = v.safeParse(entityTagSchema, value);
  if (!parsed.success)
    throw new TypeError('An ETag must be "N" or W/"N" with a non-negative safe integer version.');
  const version = Number(parsed.output.replace(/^W\//u, "").slice(1, -1));
  if (!Number.isSafeInteger(version))
    throw new TypeError("An ETag version must be a safe integer.");
  return version;
}

export interface RevisionPreconditionInput {
  readonly expectedRevision?: number;
  readonly ifMatch?: string;
}

/** Normalizes equivalent HTTP/body preconditions into the application revision value. */
export function resolveExpectedRevision(input: RevisionPreconditionInput): number {
  const body =
    input.expectedRevision === undefined
      ? undefined
      : v.safeParse(expectedRevisionSchema, input.expectedRevision);
  if (body !== undefined && !body.success) {
    throw new TypeError("expectedRevision must be a non-negative integer.");
  }
  if (input.ifMatch?.startsWith("W/"))
    throw new TypeError("If-Match requires a strong revision ETag.");
  const header = input.ifMatch === undefined ? undefined : versionFromEntityTag(input.ifMatch);
  if (body === undefined && header === undefined) {
    throw new TypeError("An expected revision is required.");
  }
  if (body !== undefined && header !== undefined && body.output !== header) {
    throw new TypeError("expectedRevision and If-Match must agree.");
  }
  return body?.output ?? header!;
}
