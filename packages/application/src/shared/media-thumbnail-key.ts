import type { MediaId } from "@lacecms/domain";

export const MEDIA_THUMBNAIL_PREFIX = "media-thumbnails/v1/";

export function mediaThumbnailKey(id: MediaId): string {
  return `${MEDIA_THUMBNAIL_PREFIX}${encodeURIComponent(id)}.webp`;
}
