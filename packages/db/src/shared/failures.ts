import { DomainError } from "@lacecms/domain";
export function failure(message: string): never {
  throw new DomainError("CONTENT_INVALID_STATE", message);
}

export function revisionConflict(message: string): never {
  throw new DomainError("CONTENT_REVISION_CONFLICT", message);
}

export function notPublished(): never {
  throw new DomainError("CONTENT_NOT_PUBLISHED", "The entry is not published.");
}
