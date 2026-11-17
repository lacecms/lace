import { bodyResponse } from "../shared/http.js";
import { binaryStream, isNotModified } from "../shared/binary.js";
import type { MediaUseCases, MediaBinary } from "@lacecms/application";

type EligibleMedia = Exclude<Awaited<ReturnType<MediaUseCases["resolvePublic"]>>, null>;

export const PUBLIC_MEDIA_CACHE_CONTROL = "public, max-age=86400";
export const PREVIEW_MEDIA_CACHE_CONTROL = "private, no-cache";

/**
 * Stored media bytes never change, so the binary tag identifies the item
 * alone; metadata edits keep it. Media IDs are UUIDs, for which the encoding
 * is a no-op.
 */
function mediaBinaryEntityTag(mediaId: string): string {
  return `"m-${encodeURIComponent(mediaId)}"`;
}

/**
 * Answers a media binary request after eligibility was decided: `304` for a
 * matching validator without opening object storage, otherwise the stream.
 */
export async function conditionalMediaResponse(
  request: Request,
  media: EligibleMedia,
  cacheControl: string,
  open: (media: EligibleMedia) => Promise<MediaBinary>,
) {
  const headers = { "cache-control": cacheControl, etag: mediaBinaryEntityTag(media.id) };
  if (isNotModified(request.headers.get("if-none-match"), headers.etag))
    return bodyResponse(null, 304, headers);
  return binaryResponse(await open(media), headers);
}

function binaryResponse(value: MediaBinary, headers: Readonly<Record<string, string>>) {
  return bodyResponse(binaryStream(value.body), 200, {
    ...headers,
    "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(value.filename)}`,
    "content-type": value.mimeType,
  });
}
