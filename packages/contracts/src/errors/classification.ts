import { LaceError, ContentValidationError } from "@lacecms/content";
import type { JsonObject } from "@lacecms/content";
import {
  BlockOrderError,
  RateLimitExceededError,
  CollectionQueryValidationError,
  BuildExportVersionChangedError,
  ReferenceGraphChangedError,
} from "@lacecms/domain";
import type {
  AccountErrorCode,
  DomainErrorCode,
  InternalDomainErrorCode,
  PreviewFailureReason,
} from "@lacecms/domain";
import { AuthenticationRequiredError } from "./authentication.js";
import { ContractValidationError, toContentValidationIssues, validationError } from "./envelope.js";
import type { ClassifiedError, LaceErrorCode } from "./envelope.js";

export type TransportErrorCode =
  | "AUTHENTICATION_REQUIRED"
  | "AUTHORIZATION_DENIED"
  | "CONFLICT"
  | "INVALID_CREDENTIALS"
  | "INVITATION_INVALID"
  | "NOT_FOUND"
  | "PAYLOAD_TOO_LARGE"
  | "RATE_LIMITED"
  | "RESET_INVALID"
  | PreviewFailureReason;

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
const errorMappings = {
  AUTHENTICATION_REQUIRED: {
    status: 401,
    message: "Authentication is required.",
    expose: (error) =>
      error instanceof AuthenticationRequiredError
        ? {
            headers: {
              "cache-control": "no-store",
              "www-authenticate":
                error.challenge === "session-or-bearer"
                  ? 'Session realm="lace", Bearer realm="lace"'
                  : error.challenge === "session"
                    ? 'Session realm="lace"'
                    : 'Bearer realm="lace"',
            },
          }
        : {},
  },
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
  CONTENT_REFERENCES_IN_USE: {
    status: 409,
    message:
      "Published references use this entry. Remove or replace them and republish the sources.",
  },
  CONTENT_REFERENCE_REVIEW_REQUIRED: {
    status: 409,
    message:
      "Saved drafts reference this entry. Review and acknowledge the draft usages before deletion.",
  },
  CONTENT_REFERENCE_IMPACT_CHANGED: {
    status: 409,
    message: "Reference impact changed. Refresh and review it again.",
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
  MEDIA_THUMBNAIL_UNAVAILABLE: {
    status: 503,
    message: "The media thumbnail is unavailable.",
    expose: () => ({ headers: { "cache-control": "no-store" } }),
  },
  MEDIA_UPDATE_CONFLICT: { status: 409, message: "The media was modified by another request." },
  CONFLICT: {
    status: 409,
    message: "The request conflicts with the current state.",
    expose: (error) =>
      error instanceof ReferenceGraphChangedError
        ? { message: "The reference graph changed. Reload and retry." }
        : {},
  },
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
  PREVIEW_CONFIGURATION_UNAVAILABLE: {
    status: 503,
    message: "Preview configuration is unavailable.",
  },
  PREVIEW_INELIGIBLE: { status: 409, message: "Preview requires a saved draft with a site route." },
  PREVIEW_REVISION_CONFLICT: {
    status: 409,
    message: "The saved draft changed. Reload it before creating a preview.",
  },
  PREVIEW_IDEMPOTENCY_CONFLICT: {
    status: 409,
    message: "This request was already used for another preview.",
  },
  PREVIEW_BUSY: {
    status: 409,
    message: "Another preview is in progress. Try again after it finishes.",
  },
  PREVIEW_CONTEXT_CHANGED: { status: 409, message: "The preview inputs changed. Try again." },
  PREVIEW_VALIDATION_FAILED: { status: 422, message: "The saved draft could not be previewed." },
  PREVIEW_SOURCE_UNAVAILABLE: {
    status: 503,
    message: "The configured site source is unavailable.",
  },
  PREVIEW_DEPENDENCY_FAILED: {
    status: 503,
    message: "The preview dependencies could not be prepared.",
  },
  PREVIEW_ROUTE_CONFLICT: { status: 409, message: "The draft route is already in use." },
  PREVIEW_RENDER_FAILED: { status: 503, message: "The site could not render the preview." },
  PREVIEW_STORAGE_FAILED: { status: 503, message: "Preview storage is unavailable." },
  PREVIEW_RESOURCE_LIMIT: { status: 409, message: "This preview exceeds the resource limits." },
  PREVIEW_PROVIDER_UNAVAILABLE: { status: 503, message: "The preview builder is unavailable." },
  PREVIEW_PROVIDER_QUOTA: {
    status: 503,
    message: "The preview provider has reached a limit. Try again later.",
  },
  PREVIEW_TIMED_OUT: { status: 503, message: "The preview timed out. Try again." },
} as const satisfies Record<
  AssertMapped<
    | MappedErrorCode
    | Exclude<DomainErrorCode, InternalDomainErrorCode>
    | AccountErrorCode
    | "RATE_LIMITED"
  >,
  ErrorMapping
>;

/** Creates one of the stable sanitized envelopes for HTTP boundary failures. */
export function transportError<Code extends TransportErrorCode>(
  code: Code,
): ClassifiedError & { readonly status: (typeof errorMappings)[Code]["status"] } {
  const mapping = errorMappings[code];
  return { body: { error: { code, message: mapping.message } }, status: mapping.status };
}

/** Converts portable failures to documented safe transport responses. */
export function classifyError(
  error: unknown,
  options: { readonly includeReferenceDetails?: boolean } = {},
): ClassifiedError {
  if (error instanceof ContractValidationError) return validationError(error.issues);
  if (error instanceof ContentValidationError)
    return validationError(toContentValidationIssues(error, options.includeReferenceDetails));
  if (error instanceof CollectionQueryValidationError)
    return validationError([
      { code: "invalid_value", message: "The submitted value is invalid.", path: error.pointer },
    ]);
  if (error instanceof LaceError && Object.hasOwn(errorMappings, error.code)) {
    const code = error.code as MappedErrorCode;
    const mapping: ErrorMapping = errorMappings[code];
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
