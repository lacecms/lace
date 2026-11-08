import { DomainError } from "../shared/errors.js";

/** A value-free collection query issue shared by application and transports. */
export class CollectionQueryValidationError extends DomainError {
  public constructor(public readonly pointer: string) {
    super("CONTENT_INVALID_STATE", "Collection query is invalid.");
  }
}
