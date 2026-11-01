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

/**
 * The server's message for a rejected tag, naming it: issue `/tags/<i>` refers
 * to position `i` of the tag set that was sent.
 */
export function metadataTagIssue(
  error: unknown,
  sent: readonly string[] | undefined,
): string | undefined {
  if (!(error instanceof AdminClientError)) return undefined;
  const issue = error.issues?.find((item) => /^\/tags(\/\d+)?$/.test(item.path));
  if (issue === undefined) return undefined;
  const tag = sent?.[Number(issue.path.split("/")[2])];
  return tag === undefined ? issue.message : `Tag "${tag}": ${issue.message}`;
}
