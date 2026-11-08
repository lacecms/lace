import { isMediaFocalCoordinate, normalizeMediaText, normalizeMediaTags } from "@lacecms/domain";
import type { MediaFocalPoint, MediaTextKind } from "@lacecms/domain";
import type { MediaMetadataPatch, NormalizedMediaMetadataPatch } from "./types.js";
import { failure } from "./helpers.js";

function normalizeText(value: unknown, kind: MediaTextKind): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const normalized = typeof value === "string" ? normalizeMediaText(value, kind) : undefined;
  if (normalized === undefined) {
    failure(
      kind === "alt"
        ? "Alt text must be single-line plain text of at most 1,000 characters."
        : "A caption must be plain text of at most 2,000 characters.",
    );
  }
  return normalized;
}

/**
 * Validates a metadata patch with the shared domain rules: trims text, maps
 * empty text to `null`, normalizes caption line breaks, and requires a focal
 * point of two finite coordinates from 0 to 1.
 */
export function normalizeMediaMetadataPatch(
  patch: MediaMetadataPatch,
): NormalizedMediaMetadataPatch {
  if (typeof patch !== "object" || patch === null) failure("Media metadata patch is invalid.");
  const keys = Object.keys(patch);
  if (
    keys.some((key) => key !== "alt" && key !== "caption" && key !== "focalPoint" && key !== "tags")
  ) {
    failure("Media metadata patch contains an unknown value.");
  }
  if (keys.every((key) => patch[key as keyof MediaMetadataPatch] === undefined)) {
    failure("Supply at least one of alt, caption, focalPoint, or tags.");
  }
  const tags = patch.tags === undefined ? undefined : validatedTags(patch.tags);
  const alt = normalizeText(patch.alt, "alt");
  const caption = normalizeText(patch.caption, "caption");
  let focalPoint: MediaFocalPoint | null | undefined;
  if (patch.focalPoint === null) focalPoint = null;
  else if (patch.focalPoint !== undefined) {
    const point = patch.focalPoint as unknown;
    if (
      typeof point !== "object" ||
      point === null ||
      Object.keys(point).length !== 2 ||
      !isMediaFocalCoordinate((point as { x?: unknown }).x) ||
      !isMediaFocalCoordinate((point as { y?: unknown }).y)
    ) {
      failure("A focal point must have x and y coordinates from 0 to 1.");
    }
    focalPoint = Object.freeze({
      x: (point as MediaFocalPoint).x,
      y: (point as MediaFocalPoint).y,
    });
  }
  return Object.freeze({
    ...(tags === undefined ? {} : { tags }),
    ...(alt === undefined ? {} : { alt }),
    ...(caption === undefined ? {} : { caption }),
    ...(focalPoint === undefined ? {} : { focalPoint }),
  });
}

export function validatedTags(values: readonly string[], maxInputs?: number): readonly string[] {
  if (!Array.isArray(values)) failure("Media tags must be an array.");
  if (maxInputs !== undefined && values.length > maxInputs)
    failure("Supply at most five filter tags.");
  const result = normalizeMediaTags(values);
  if ("issue" in result) failure(`Invalid media tag at /tags/${result.issue}.`);
  return result.tags;
}

export function sameFocalPoint(
  left: MediaFocalPoint | null,
  right: MediaFocalPoint | null,
): boolean {
  return left === null || right === null
    ? left === right
    : left.x === right.x && left.y === right.y;
}
