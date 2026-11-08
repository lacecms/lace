import { LaceError } from "@lacecms/content";
import { DomainError } from "@lacecms/domain";
import { failure } from "./failures.js";
/** Maps SQLite and D1 constraint failures to stable domain errors. */
export function sqliteWriteError(
  error: unknown,
  singletonCreation: boolean,
  runtime: string,
): never {
  if (error instanceof LaceError) throw error;
  const message = error instanceof Error ? error.message : "";
  if (
    singletonCreation &&
    (message.includes("content_entries_singleton_idx") ||
      message.includes("UNIQUE constraint failed: content_entries.model_key"))
  ) {
    throw new DomainError(
      "CONTENT_MODEL_CARDINALITY_CONFLICT",
      "A page or global model already has its singleton entry.",
    );
  }
  if (message.includes("UNIQUE constraint failed: published_routes.path")) {
    throw new DomainError("CONTENT_ROUTE_CONFLICT", "The public path belongs to another entry.");
  }
  if (message.includes("NOT NULL constraint failed: content_media_references.media_id")) {
    failure("Media is unavailable for reference.");
  }
  throw new DomainError("CONTENT_INVALID_STATE", `${runtime} content write failed.`);
}
