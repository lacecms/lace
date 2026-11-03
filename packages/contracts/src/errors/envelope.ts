import { LaceError, ContentValidationError } from "@lacecms/content";
import * as v from "valibot";
import { jsonObjectSchema } from "../shared/json.js";
import { identifierSchema, jsonPointerSchema } from "../shared/primitives.js";

export const contractValidationIssueSchema = v.strictObject({
  code: identifierSchema,
  message: v.string(),
  path: jsonPointerSchema,
});

export const errorCodeSchema = v.picklist([
  "AUTHORIZATION_DENIED",
  "BUILD_EXPORT_VERSION_CHANGED",
  "CONFLICT",
  "CONTENT_INVALID_STATE",
  "CONTENT_LINKS_IN_USE",
  "CONTENT_LINK_IMPACT_CHANGED",
  "CONTENT_MODEL_CARDINALITY_CONFLICT",
  "CONTENT_NOT_PUBLISHED",
  "CONTENT_PAGE_SINGLETON",
  "CONTENT_PUBLISHED_IMMUTABLE",
  "CONTENT_REVISION_CONFLICT",
  "CONTENT_ROUTE_CONFLICT",
  "LAST_ADMIN_PROTECTED",
  "MEDIA_IN_USE",
  "MEDIA_UPDATE_CONFLICT",
  "INTERNAL_ERROR",
  "INVALID_CREDENTIALS",
  "INVITATION_INVALID",
  "NOT_FOUND",
  "PAYLOAD_TOO_LARGE",
  "RATE_LIMITED",
  "RESET_INVALID",
  "VALIDATION_FAILED",
]);

export const errorEnvelopeSchema = v.strictObject({
  error: v.strictObject({
    code: errorCodeSchema,
    details: v.optional(jsonObjectSchema),
    message: v.string(),
  }),
});

export type ErrorEnvelope = v.InferOutput<typeof errorEnvelopeSchema>;
export type LaceErrorCode = v.InferOutput<typeof errorCodeSchema>;
/** An error code as consumers read it: a known code, or one a newer API introduced. */
export type ReportedLaceErrorCode = LaceErrorCode | (string & {});
/** An error envelope as consumers read it; its code may be unknown to this release. */
export interface TolerantErrorEnvelope {
  readonly error: Omit<ErrorEnvelope["error"], "code"> & { readonly code: ReportedLaceErrorCode };
}
export type ContractValidationIssue = v.InferOutput<typeof contractValidationIssueSchema>;

/** JSON Pointer paths for Valibot and portable content validation issues. */
export function contractIssuePointer(path: readonly unknown[] | undefined): string {
  if (!path?.length) return "";
  return path
    .map((part) => (typeof part === "object" && part !== null && "key" in part ? part.key : part))
    .map((part) => `/${String(part).replaceAll("~", "~0").replaceAll("/", "~1")}`)
    .join("");
}
export function toContractValidationIssues(
  issues: readonly { readonly path?: readonly unknown[] | undefined; readonly type?: string }[],
  preserveType = false,
): ContractValidationIssue[] {
  return issues.map((issue) => ({
    code: preserveType && issue.type ? issue.type : "invalid_value",
    message: "The submitted value is invalid.",
    path: contractIssuePointer(issue.path),
  }));
}
export function toContentValidationIssues(
  error: ContentValidationError,
): ContractValidationIssue[] {
  return error.issues.map((issue) => ({
    code: issue.code,
    message: issue.message,
    path: contractIssuePointer(issue.path),
  }));
}

export interface ClassifiedError {
  readonly body: ErrorEnvelope;
  readonly status: 400 | 403 | 404 | 409 | 410 | 413 | 422 | 429 | 500;
  readonly headers?: Readonly<Record<string, string>>;
}

export class ContractValidationError extends LaceError<"VALIDATION_FAILED"> {
  public constructor(public readonly issues: readonly ContractValidationIssue[]) {
    super("VALIDATION_FAILED", "Request validation failed.");
    this.name = "ContractValidationError";
  }
}

/** Creates a safe validation envelope from already-normalized contract issues. */
export function validationError(issues: readonly ContractValidationIssue[]): ClassifiedError {
  return {
    body: {
      error: {
        code: "VALIDATION_FAILED",
        details: { issues: [...issues] },
        message: "The request did not satisfy the API contract.",
      },
    },
    status: 422,
  };
}
