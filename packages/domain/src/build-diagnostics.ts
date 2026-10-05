/** Closed diagnostic data; never accepts an Error message as a path. */
export const siteBuildFailureReasons = [
  "source_invalid",
  "source_symlink",
  "source_unreadable",
  "source_missing",
  "source_special_file",
  "install_failed",
  "build_failed",
  "version_changed",
  "trigger_unavailable",
  "build_timeout",
  "invalid_build_event",
  "provider_failed",
] as const;
export type SiteBuildFailureReason = (typeof siteBuildFailureReasons)[number];
export const sourceFailureReasons = siteBuildFailureReasons.slice(0, 5);
export const BUILD_SOURCE_PATH_PATTERN =
  /^(?!.*(?:^|\/)(?:\.{1,2})(?:\/|$))[A-Za-z0-9_.][A-Za-z0-9_. -]*(?:\/[A-Za-z0-9_.][A-Za-z0-9_. -]*)*$/u;
const privateSegments = new Set([
  ".git",
  ".npmrc",
  ".pnpmfile.cjs",
  ".aws",
  ".ssh",
  ".agents",
  ".codex",
  ".claude",
]);
export function safeBuildSourcePath(value: unknown): string | undefined {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 512 ||
    !BUILD_SOURCE_PATH_PATTERN.test(value)
  )
    return undefined;
  const parts = value.split("/");
  if (
    parts.some(
      (part, index) =>
        privateSegments.has(part) ||
        part === ".env" ||
        part.startsWith(".env.") ||
        (part === ".lace" && parts[index + 1] === "data"),
    )
  )
    return undefined;
  return value;
}
export function normalizeBuildFailure(
  reason: unknown,
  path?: unknown,
): { reason: SiteBuildFailureReason; path?: string } {
  const known = siteBuildFailureReasons.find((candidate) => candidate === reason);
  const safeReason = known ?? "provider_failed";
  const safePath = sourceFailureReasons.includes(safeReason)
    ? safeBuildSourcePath(path)
    : undefined;
  return { reason: safeReason, ...(safePath === undefined ? {} : { path: safePath }) };
}
