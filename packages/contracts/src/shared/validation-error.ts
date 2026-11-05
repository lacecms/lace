import { LaceError } from "@lacecms/content";
import * as v from "valibot";
import { identifierSchema, jsonPointerSchema } from "./primitives.js";

export const contractValidationIssueSchema = v.strictObject({
  code: identifierSchema,
  message: v.string(),
  path: jsonPointerSchema,
});
export type ContractValidationIssue = v.InferOutput<typeof contractValidationIssueSchema>;

/**
 * A request that violates a contract, with JSON Pointer issues. It lives in
 * `shared/` so request-precondition parsers can raise it; the error envelope
 * module re-exports it.
 */
export class ContractValidationError extends LaceError<"VALIDATION_FAILED"> {
  public constructor(public readonly issues: readonly ContractValidationIssue[]) {
    super("VALIDATION_FAILED", "Request validation failed.");
    this.name = "ContractValidationError";
  }
}

/** A malformed or inconsistent request precondition; servers map it to their own pointer. */
export function invalidPrecondition(message: string): never {
  throw new ContractValidationError([{ code: "invalid_value", message, path: "" }]);
}
