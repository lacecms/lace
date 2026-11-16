import {
  LaceError,
  ContractValidationError,
  errorEnvelopeSchema,
  transportError,
  validationError,
  toContractValidationIssues as standardIssues,
} from "@lacecms/contracts";
import type { ClassifiedError, ContractValidationIssue } from "@lacecms/contracts";
import type { Hook } from "@hono/standard-validator";
import type { Env, TypedResponse } from "hono";
import type { ContentfulStatusCode, StatusCode } from "hono/utils/http-status";
import * as v from "valibot";

// `HeadersInit` is a DOM name; Node-only consumers type-check this source too.
type ResponseHeaders = ConstructorParameters<typeof Headers>[0];

export type ServerSchema = v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>;
export class AuthorizationError extends LaceError<"AUTHORIZATION_DENIED"> {
  public constructor(message?: string) {
    super(
      "AUTHORIZATION_DENIED",
      message ?? "The actor is not permitted to perform this operation.",
    );
  }
}

export function invalid(message = "The submitted value is invalid.", path = ""): never {
  throw new ContractValidationError([{ code: "invalid_value", message, path }]);
}

export function parse<Schema extends ServerSchema>(
  schema: Schema,
  value: unknown,
): v.InferOutput<Schema> {
  const result = v.safeParse(schema, value);
  if (!result.success) {
    throw new ContractValidationError(standardIssues(result.issues, true));
  }
  return result.output;
}

export type JsonResponse<Output, Status extends StatusCode> = Response &
  TypedResponse<Output, Status, "json">;

export type BodyResponse<Body, Status extends StatusCode> = Response &
  TypedResponse<Body, Status, "body">;

export function response<Schema extends ServerSchema>(
  schema: Schema,
  value: unknown,
): JsonResponse<v.InferOutput<Schema>, 200>;
export function response<Schema extends ServerSchema, Status extends ContentfulStatusCode>(
  schema: Schema,
  value: unknown,
  status: Status,
  headers?: ResponseHeaders,
): JsonResponse<v.InferOutput<Schema>, Status>;
export function response<Schema extends ServerSchema>(
  schema: Schema,
  value: unknown,
  status: ContentfulStatusCode = 200,
  headers?: ResponseHeaders,
): JsonResponse<v.InferOutput<Schema>, ContentfulStatusCode> {
  // Hono's type markers describe the response for RPC and have no runtime fields.
  return Response.json(parse(schema, value), {
    ...(headers === undefined ? {} : { headers }),
    status,
  }) as JsonResponse<v.InferOutput<Schema>, ContentfulStatusCode>;
}

export function bodyResponse<
  Body extends ReadableStream<Uint8Array> | null,
  Status extends StatusCode,
>(body: Body, status: Status, headers?: ResponseHeaders): BodyResponse<Body, Status> {
  return new Response(body, {
    ...(headers === undefined ? {} : { headers }),
    status,
  }) as BodyResponse<Body, Status>;
}

export function errorResponse<Status extends ClassifiedError["status"]>(
  error: ClassifiedError & { readonly status: Status },
  headers?: ResponseHeaders,
) {
  const combined = new Headers(error.headers);
  new Headers(headers).forEach((value, key) => combined.set(key, value));
  return response(errorEnvelopeSchema, error.body, error.status, combined);
}

export function notFound() {
  return errorResponse(transportError("NOT_FOUND"));
}

export function validationResponse(issues: readonly ContractValidationIssue[]) {
  return errorResponse(validationError(issues));
}

export function validationHook(result: Parameters<Hook<unknown, Env, string>>[0]) {
  if (!result.success) return validationResponse(standardIssues(result.error));
}

export const noStore = { "cache-control": "no-store" };
