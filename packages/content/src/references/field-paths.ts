import type { ValidationPathSegment } from "../shared/errors.js";

/** Keeps legacy scalar keys; nested locations are relative JSON Pointers. */
export function encodeFieldPath(path: readonly ValidationPathSegment[]): string {
  if (path.length === 1) return String(path[0]);
  return (
    "/" + path.map((part) => String(part).replaceAll("~", "~0").replaceAll("/", "~1")).join("/")
  );
}

/** Reads a stored reference path; numeric tokens are list indices under the field-key grammar. */
export function decodeFieldPath(path: string): readonly ValidationPathSegment[] {
  if (!path.startsWith("/")) return [path];
  return path
    .slice(1)
    .split("/")
    .map((part) => {
      const decoded = part.replaceAll("~1", "/").replaceAll("~0", "~");
      return /^(?:0|[1-9][0-9]*)$/u.test(decoded) ? Number(decoded) : decoded;
    });
}
