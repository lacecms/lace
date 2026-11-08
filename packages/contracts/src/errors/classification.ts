import { LaceError, ContentValidationError } from "@lacecms/content";
import type { JsonObject } from "@lacecms/content";
import {
  BlockOrderError,
  RateLimitExceededError,
  CollectionQueryValidationError,
  BuildExportVersionChangedError,
} from "@lacecms/domain";
import type { AccountErrorCode, DomainErrorCode, InternalDomainErrorCode } from "@lacecms/domain";
import { ContractValidationError, toContentValidationIssues, validationError } from "./envelope.js";
import type { ClassifiedError, LaceErrorCode } from "./envelope.js";

export type TransportErrorCode =
  | "AUTHORIZATION_DENIED"
  | "CONFLICT"
  | "INVALID_CREDENTIALS"
  | "INVITATION_INVALID"
  | "NOT_FOUND"
  | "PAYLOAD_TOO_LARGE"
  | "RATE_LIMITED"
  | "RESET_INVALID";

type MappedErrorCode = Exclude<LaceErrorCode, "INTERNAL_ERROR">;
type AssertMapped<Code extends MappedErrorCode> = Code;
interface ErrorMapping {
  readonly status: ClassifiedError["status"];
  readonly message: string;
  readonly expose?: (error: LaceError) => {
    readonly details?: JsonObject;
    readonly headers?: Readonly<Record<string, string>>;
    readonly message?: string;
  };
}

// The constrained union also checks every portable domain/account code.
const errorMappings: Readonly<
  Record<
    AssertMapped<
      | MappedErrorCode
      | Exclude<DomainErrorCode, InternalDomainErrorCode>
      | AccountErrorCode
      | "RATE_LIMITED"
    >,
    ErrorMapping
  >
> = {
  AUTHORIZATION_DENIED: {
    status: 403,
    message: "The actor is not permitted to perform this operation.",
  },
  BUILD_EXPORT_VERSION_CHANGED: {
    status: 409,
    message: "Published content changed during the build export. Restart from the first page.",
    expose: (error) =>
      error instanceof BuildExportVersionChangedError
        ? {
            details: { actualVersion: error.actualVersion, expectedVersion: error.expectedVersion },
          }
        : {},
  },
  CONTENT_INVALID_STATE: {
    status: 422,
    message: "The requested content operation is invalid.",
    expose: (error) => (error instanceof BlockOrderError ? { message: error.message } : {}),
  },
  CONTENT_LINKS_IN_USE: {
    status: 409,
    message: "Published links use this destination. Review the current link impact before removal.",
  },
  CONTENT_LINK_IMPACT_CHANGED: {
    status: 409,
    message: "Link impact changed. Refresh and review it again.",
  },
  CONTENT_MODEL_CARDINALITY_CONFLICT: {
    status: 409,
    message: "The content model cannot accept another entry.",
  },
  CONTENT_NOT_PUBLISHED: { status: 409, message: "The entry is not published." },
  CONTENT_PAGE_SINGLETON: {
    status: 409,
    message: "Page and global entries are defined by configuration.",
  },
  CONTENT_PUBLISHED_IMMUTABLE: { status: 409, message: "Published content cannot be modified." },
  CONTENT_REVISION_CONFLICT: { status: 409, message: "The draft was modified by another request." },
  CONTENT_ROUTE_CONFLICT: { status: 409, message: "The public route is already in use." },
  LAST_ADMIN_PROTECTED: {
    status: 409,
    message: "The final active administrator cannot be disabled or demoted.",
  },
  MEDIA_IN_USE: { status: 409, message: "The media is still used by content." },
  MEDIA_UPDATE_CONFLICT: { status: 409, message: "The media was modified by another request." },
  CONFLICT: { status: 409, message: "The request conflicts with the current state." },
  INVALID_CREDENTIALS: { status: 400, message: "The current password is incorrect." },
  INVITATION_INVALID: { status: 410, message: "The invitation is invalid or has expired." },
  NOT_FOUND: { status: 404, message: "The requested resource was not found." },
  PAYLOAD_TOO_LARGE: { status: 413, message: "The request body is too large." },
  RATE_LIMITED: {
    status: 429,
    message: "Too many requests were received.",
    expose: (error) =>
      error instanceof RateLimitExceededError
        ? { headers: { "retry-after": String(Math.max(1, Math.ceil(error.retryAfterSeconds))) } }
        : {},
  },
  RESET_INVALID: { status: 410, message: "The password reset link is invalid or has expired." },
  VALIDATION_FAILED: { status: 422, message: "The request did not satisfy the API contract." },
};

/** Creates one of the stable sanitized envelopes for HTTP boundary failures. */
export function transportError(code: TransportErrorCode): ClassifiedError {
  const mapping = errorMappings[code];
  return { body: { error: { code, message: mapping.message } }, status: mapping.status };
}

/** Converts portable failures to documented safe transport responses. */
export function classifyError(error: unknown): ClassifiedError {
  if (error instanceof ContractValidationError) return validationError(error.issues);
  if (error instanceof ContentValidationError)
    return validationError(toContentValidationIssues(error));
  if (error instanceof CollectionQueryValidationError)
    return validationError([
      { code: "invalid_value", message: "The submitted value is invalid.", path: error.pointer },
    ]);
  if (error instanceof LaceError && Object.hasOwn(errorMappings, error.code)) {
    const code = error.code as MappedErrorCode;
    const mapping = errorMappings[code];
    const exposed = mapping.expose?.(error);
    return {
      status: mapping.status,
      body: {
        error: {
          code,
          message: exposed?.message ?? mapping.message,
          ...(exposed?.details === undefined ? {} : { details: exposed.details }),
        },
      },
      ...(exposed?.headers === undefined ? {} : { headers: exposed.headers }),
    };
  }
  return {
    body: { error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." } },
    status: 500,
  };
}
