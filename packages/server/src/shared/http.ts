import {
  LaceError,
  ContractValidationError,
  errorEnvelopeSchema,
  transportError,
  validationError,
  toContractValidationIssues as standardIssues,
} from "@lacecms/contracts";
import type { ClassifiedError, ContractValidationIssue } from "@lacecms/contracts";
import * as v from "valibot";

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

export function response<Schema extends ServerSchema>(
  schema: Schema,
  value: unknown,
  status = 200,
  headers?: HeadersInit,
): Response {
  return Response.json(parse(schema, value), {
    ...(headers === undefined ? {} : { headers }),
    status,
  });
}

export function errorResponse(error: ClassifiedError, headers?: HeadersInit): Response {
  const combined = new Headers(error.headers);
  new Headers(headers).forEach((value, key) => combined.set(key, value));
  return response(errorEnvelopeSchema, error.body, error.status, combined);
}

export function notFound(): Response {
  return errorResponse(transportError("NOT_FOUND"));
}

export function validationResponse(issues: readonly ContractValidationIssue[]): Response {
  return errorResponse(validationError(issues));
}

export const validationHook = ((result: {
  readonly success: boolean;
  readonly error?: readonly { readonly path?: readonly unknown[] | undefined }[] | undefined;
}) => {
  if (!result.success) return validationResponse(standardIssues(result.error ?? []));
}) as never;

export const noStore = { "cache-control": "no-store" };
