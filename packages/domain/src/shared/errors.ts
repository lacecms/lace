import { LaceError } from "@lacecms/content";

/** Domain codes that no transport documents; the classifier maps them to `500`. */
export type InternalDomainErrorCode = "CONFIGURATION_SYNC_STALE";

export type DomainErrorCode =
  | "AUTHORIZATION_DENIED"
  | "BUILD_EXPORT_VERSION_CHANGED"
  | "CONTENT_INVALID_STATE"
  | "CONTENT_LINKS_IN_USE"
  | "CONTENT_LINK_IMPACT_CHANGED"
  | "CONTENT_MODEL_CARDINALITY_CONFLICT"
  | "CONTENT_NOT_PUBLISHED"
  | "CONTENT_PAGE_SINGLETON"
  | "CONTENT_PUBLISHED_IMMUTABLE"
  | "CONTENT_REVISION_CONFLICT"
  | "CONTENT_ROUTE_CONFLICT"
  | InternalDomainErrorCode
  | "LAST_ADMIN_PROTECTED"
  | "MEDIA_IN_USE"
  | "MEDIA_UPDATE_CONFLICT";

/** A portable error with a stable code suitable for later transport mapping. */
export class DomainError extends LaceError<DomainErrorCode> {
  public constructor(code: DomainErrorCode, message: string) {
    super(code, message);
    this.name = "DomainError";
  }
}
