export const previewStates = [
  "preparing",
  "dispatched",
  "running",
  "ready",
  "failed",
  "timed_out",
  "invalidated",
  "expired",
] as const;
export type PreviewState = (typeof previewStates)[number];

export const previewFailureReasons = [
  "PREVIEW_CONFIGURATION_UNAVAILABLE",
  "PREVIEW_INELIGIBLE",
  "PREVIEW_REVISION_CONFLICT",
  "PREVIEW_IDEMPOTENCY_CONFLICT",
  "PREVIEW_BUSY",
  "PREVIEW_CONTEXT_CHANGED",
  "PREVIEW_VALIDATION_FAILED",
  "PREVIEW_SOURCE_UNAVAILABLE",
  "PREVIEW_DEPENDENCY_FAILED",
  "PREVIEW_ROUTE_CONFLICT",
  "PREVIEW_RENDER_FAILED",
  "PREVIEW_STORAGE_FAILED",
  "PREVIEW_RESOURCE_LIMIT",
  "PREVIEW_PROVIDER_UNAVAILABLE",
  "PREVIEW_TIMED_OUT",
] as const;
export type PreviewFailureReason = (typeof previewFailureReasons)[number];

export const PREVIEW_OVERALL_MS = 15 * 60_000;
export const PREVIEW_EXECUTION_MS = 10 * 60_000;
export const PREVIEW_READY_MS = 24 * 60 * 60_000;

/** A path already normalized by the caller. Never decode it again at the storage boundary. */
export function isPreviewArtifactPath(path: string): boolean {
  return (
    path.length > 0 &&
    path.length <= 512 &&
    path
      .split("/")
      .every(
        (segment) =>
          /^[A-Za-z0-9_-][A-Za-z0-9._-]*(?![\s\S])/u.test(segment) &&
          !segment.endsWith(".") &&
          !segment.toLowerCase().endsWith(".map"),
      )
  );
}

/** Preview's portable capture limit keeps its configuration and first page bounded. */
export const PREVIEW_MAX_MODELS = 128;

export class PreviewContextLimitError extends Error {
  public constructor() {
    super("Published context exceeds the preview capture limit.");
    this.name = "PreviewContextLimitError";
  }
}
