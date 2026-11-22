import {
  isInternalLinkTargetId,
  LaceError,
  MAX_REFERENCE_CYCLE_IDS,
  MAX_TITLE_LENGTH,
} from "@lacecms/content";
import * as v from "valibot";
import { identifierSchema, jsonPointerSchema } from "./primitives.js";

const referenceEntryIdSchema = v.pipe(
  identifierSchema,
  v.check((value: string) => isInternalLinkTargetId(value)),
);
export const referenceCycleDetailsSchema = v.strictObject({
  witness: v.pipe(
    v.array(referenceEntryIdSchema),
    v.minLength(2),
    v.maxLength(MAX_REFERENCE_CYCLE_IDS),
  ),
  truncated: v.boolean(),
  publishFirst: v.exactOptional(
    v.strictObject({
      entryId: referenceEntryIdSchema,
      title: v.pipe(v.string(), v.minLength(1), v.maxLength(MAX_TITLE_LENGTH)),
    }),
  ),
});
const issueEntries = { message: v.string(), path: jsonPointerSchema };
export const contractValidationIssueSchema = v.union([
  v.strictObject({
    ...issueEntries,
    code: v.literal("reference_cycle"),
    details: referenceCycleDetailsSchema,
  }),
  v.strictObject({ ...issueEntries, code: identifierSchema }),
]);
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
