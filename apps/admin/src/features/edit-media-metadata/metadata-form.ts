import type {
  MediaFocalPointDto,
  MediaMetadataDto,
  UpdateMediaMetadataRequestDto,
} from "@lacecms/contracts";

/** Editable descriptive metadata as form values; empty text means "not set". */
export interface MediaMetadataValues {
  readonly alt: string;
  readonly caption: string;
  readonly focalPoint: MediaFocalPointDto | null;
}

/** Arrow keys that move the focal point. */
export type FocalPointKey = "ArrowDown" | "ArrowLeft" | "ArrowRight" | "ArrowUp";

const centre: MediaFocalPointDto = { x: 0.5, y: 0.5 };

export function metadataValues(item: MediaMetadataDto): MediaMetadataValues {
  return {
    alt: item.alt ?? "",
    caption: item.caption ?? "",
    focalPoint: item.focalPoint ?? null,
  };
}

function sameFocalPoint(left: MediaFocalPointDto | null, right: MediaFocalPointDto | null) {
  return left === null || right === null
    ? left === right
    : left.x === right.x && left.y === right.y;
}

/**
 * The update that turns `base` into `values`: only differing keys, with empty
 * text and a reset focal point sent as `null` (clear). Empty when unchanged.
 */
export function metadataPatch(
  base: MediaMetadataValues,
  values: MediaMetadataValues,
): UpdateMediaMetadataRequestDto {
  return {
    ...(values.alt === base.alt ? {} : { alt: values.alt === "" ? null : values.alt }),
    ...(values.caption === base.caption
      ? {}
      : { caption: values.caption === "" ? null : values.caption }),
    ...(sameFocalPoint(base.focalPoint, values.focalPoint)
      ? {}
      : { focalPoint: values.focalPoint }),
  };
}

export function isMetadataChanged(base: MediaMetadataValues, values: MediaMetadataValues) {
  return Object.keys(metadataPatch(base, values)).length > 0;
}

const clampPercent = (value: number) => Math.min(100, Math.max(0, value));

/**
 * Moves the point by one percentage point, or ten with Shift, starting from the
 * centre when unset. Integer percent arithmetic keeps exact two-decimal values.
 */
export function stepFocalPoint(
  point: MediaFocalPointDto | null,
  key: FocalPointKey,
  shift: boolean,
): MediaFocalPointDto {
  const { x, y } = point ?? centre;
  const step = shift ? 10 : 1;
  const dx = key === "ArrowLeft" ? -step : key === "ArrowRight" ? step : 0;
  const dy = key === "ArrowUp" ? -step : key === "ArrowDown" ? step : 0;
  return {
    x: clampPercent(Math.round(x * 100) + dx) / 100,
    y: clampPercent(Math.round(y * 100) + dy) / 100,
  };
}

const fraction = (offset: number, size: number) =>
  size <= 0 ? 0.5 : Math.round(Math.min(1, Math.max(0, offset / size)) * 1000) / 1000;

/** The focal point under a pointer, as clamped fractions of the image box rounded to 0.1 %. */
export function pointerFocalPoint(
  box: Pick<DOMRect, "height" | "left" | "top" | "width">,
  clientX: number,
  clientY: number,
): MediaFocalPointDto {
  return { x: fraction(clientX - box.left, box.width), y: fraction(clientY - box.top, box.height) };
}

/** States the point as percentages for people and assistive technology. */
export function focalPointText(point: MediaFocalPointDto | null): string {
  return point === null
    ? "Not set, image centred"
    : `${Math.round(point.x * 100)}% from left, ${Math.round(point.y * 100)}% from top`;
}
