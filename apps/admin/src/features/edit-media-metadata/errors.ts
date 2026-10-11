import { AdminClientError } from "../../shared/api/index.js";

/** Whether a failed save lost the race against another change of the same item. */
export function isMediaUpdateConflict(error: unknown): boolean {
  return error instanceof AdminClientError && error.code === "MEDIA_UPDATE_CONFLICT";
}

/** The server's message for one metadata input (`/alt` or `/caption`), if it reported one. */
export function metadataIssue(error: unknown, field: "alt" | "caption"): string | undefined {
  return error instanceof AdminClientError
    ? error.issues?.find((issue) => issue.path === `/${field}`)?.message
    : undefined;
}
