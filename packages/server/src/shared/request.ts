import { opaqueCursor } from "@lacecms/application";
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  idempotencyKeySchema,
  identifierSchemaPublic,
  opaqueCursorSchema,
  resolveExpectedRevision,
} from "@lacecms/contracts";
import * as v from "valibot";
import { invalid, parse } from "./http.js";

export function pagination(request: Request): {
  readonly after?: ReturnType<typeof opaqueCursor>;
  readonly limit: number;
} {
  const url = new URL(request.url);
  const after = url.searchParams.get("after") ?? undefined;
  const limit = url.searchParams.get("limit") ?? String(DEFAULT_PAGE_SIZE);
  const parsedLimit = Number(limit);
  if (!Number.isSafeInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > MAX_PAGE_SIZE)
    invalid(`limit must be an integer between 1 and ${MAX_PAGE_SIZE}.`, "/limit");
  if (after === undefined) return { limit: parsedLimit };
  parse(opaqueCursorSchema, after);
  return { after: opaqueCursor(after), limit: parsedLimit };
}

export async function optionalJsonBody(request: Request): Promise<unknown> {
  if (request.headers.get("content-length") === "0") return {};
  try {
    return await request.json();
  } catch {
    if (request.headers.get("content-length") === null) return {};
    invalid("The request body must contain valid JSON.");
  }
}

export function revision(
  body: { readonly expectedRevision?: number | undefined },
  request: Request,
): number {
  try {
    const ifMatch = request.headers.get("if-match") ?? undefined;
    return resolveExpectedRevision({
      ...(body.expectedRevision === undefined ? {} : { expectedRevision: body.expectedRevision }),
      ...(ifMatch === undefined ? {} : { ifMatch }),
    });
  } catch {
    return invalid("expectedRevision and If-Match must supply one matching revision.");
  }
}

/** Like `revision`, but absent when neither the body nor `If-Match` supplies one. */
export function optionalRevision(
  body: { readonly expectedRevision?: number | undefined },
  request: Request,
): number | undefined {
  if (body.expectedRevision === undefined && request.headers.get("if-match") === null) {
    return undefined;
  }
  return revision(body, request);
}

export function optionalIdempotencyKey(request: Request): string | undefined {
  const value = request.headers.get("idempotency-key") ?? undefined;
  return value === undefined ? undefined : parse(idempotencyKeySchema, value);
}

export function publicPath(value: string): string {
  if (
    !value.startsWith("/") ||
    value.includes("?") ||
    value.includes("#") ||
    value.includes("\\") ||
    value.includes("//") ||
    /\s/u.test(value) ||
    (value.length > 1 && value.endsWith("/"))
  ) {
    invalid("The submitted value is invalid.", "/path");
  }
  return value;
}

export const modelKeyParams = v.strictObject({ modelKey: identifierSchemaPublic });
export const entryIdParams = v.strictObject({ entryId: identifierSchemaPublic });
export const mediaIdParams = v.strictObject({ mediaId: identifierSchemaPublic });
export const collectionItemParams = v.strictObject({
  modelKey: identifierSchemaPublic,
  slug: identifierSchemaPublic,
});
