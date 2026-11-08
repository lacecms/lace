import type { MediaCatalogItem, MediaMimeType } from "../ports/media.js";
import type { MediaView } from "./types.js";
import { ALLOWED_MEDIA_MIME_TYPES, MAX_IMAGE_DIMENSION, MAX_IMAGE_PIXELS } from "./limits.js";
import { failure } from "./helpers.js";

export function toMediaView(item: MediaCatalogItem): MediaView {
  const value = item.media;
  const mimeType = value.mimeType;
  if (!ALLOWED_MEDIA_MIME_TYPES.includes(mimeType as MediaMimeType)) {
    failure("Media metadata has an unsupported MIME type.");
  }
  return Object.freeze({
    ...(value.alt === undefined ? {} : { alt: value.alt }),
    ...(value.caption === undefined ? {} : { caption: value.caption }),
    createdAt: value.createdAt,
    createdBy: Object.freeze({ displayName: item.createdBy.displayName, id: item.createdBy.id }),
    tags: Object.freeze([...(value.tags ?? [])]),
    filename: value.filename,
    ...(value.focalPoint === undefined
      ? {}
      : { focalPoint: Object.freeze({ x: value.focalPoint.x, y: value.focalPoint.y }) }),
    ...(value.height === undefined ? {} : { height: value.height }),
    id: value.id,
    mimeType: mimeType as MediaMimeType,
    ...(value.sha256 === undefined ? {} : { sha256: value.sha256 }),
    size: value.size,
    status: value.status,
    updatedAt: value.updatedAt,
    usageCount: item.usageCount,
    ...(value.width === undefined ? {} : { width: value.width }),
  });
}

export function validateDimensions(width: number, height: number): void {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > MAX_IMAGE_DIMENSION ||
    height > MAX_IMAGE_DIMENSION ||
    width * height > MAX_IMAGE_PIXELS
  ) {
    failure("Image dimensions exceed the allowed limits.");
  }
}
