import { LaceError } from "@lacecms/content";
import { DomainError } from "@lacecms/domain";
/** Maps SQLite and D1 constraint failures to stable domain errors. */
export function sqliteWriteError(
  error: unknown,
  singletonCreation: boolean,
  runtime: string,
): never {
  throw sqliteWriteFailure(error, singletonCreation, runtime);
}

export function sqliteWriteFailure(
  error: unknown,
  singletonCreation: boolean,
  runtime: string,
): LaceError {
  if (error instanceof LaceError) return error;
  const message = error instanceof Error ? error.message : "";
  if (
    singletonCreation &&
    (message.includes("content_entries_singleton_idx") ||
      message.includes("UNIQUE constraint failed: content_entries.model_key"))
  ) {
    return new DomainError(
      "CONTENT_MODEL_CARDINALITY_CONFLICT",
      "A page or global model already has its singleton entry.",
    );
  }
  if (message.includes("UNIQUE constraint failed: published_routes.path")) {
    return new DomainError("CONTENT_ROUTE_CONFLICT", "The public path belongs to another entry.");
  }
  if (message.includes("NOT NULL constraint failed: content_media_references.media_id")) {
    return new DomainError("CONTENT_INVALID_STATE", "Media is unavailable for reference.");
  }
  return new DomainError("CONTENT_INVALID_STATE", `${runtime} content write failed.`);
}
