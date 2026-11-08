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

const entityTagMember = /^(?:W\/)?"[\x21\x23-\x7e\x80-\xff]*"$/u;

/**
 * Reports whether `If-None-Match` lists `tag` using weak comparison, or is
 * `*`. A malformed header is ignored (`false`), so the full response is sent.
 */
function ifNoneMatchMatches(header: string | undefined, tag: string): boolean {
  if (header === undefined) return false;
  const value = header.trim();
  if (value === "*") return true;
  const members = value
    .split(",")
    .map((member) => member.trim())
    .filter((member) => member !== "");
  if (members.length === 0 || !members.every((member) => entityTagMember.test(member)))
    return false;
  return members.some((member) => (member.startsWith("W/") ? member.slice(2) : member) === tag);
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
): Promise<Response> {
  const headers = { "cache-control": cacheControl, etag: mediaBinaryEntityTag(media.id) };
  if (ifNoneMatchMatches(request.headers.get("if-none-match") ?? undefined, headers.etag))
    return new Response(null, { headers, status: 304 });
  return binaryResponse(await open(media), headers);
}

function binaryResponse(value: MediaBinary, headers: Readonly<Record<string, string>>): Response {
  const iterator = value.body[Symbol.asyncIterator]();
  const body = new ReadableStream<Uint8Array>({
    async cancel() {
      await iterator.return?.();
    },
    async pull(controller) {
      const next = await iterator.next();
      if (next.done) controller.close();
      else controller.enqueue(next.value);
    },
  });
  return new Response(body, {
    headers: {
      ...headers,
      "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(value.filename)}`,
      "content-type": value.mimeType,
    },
  });
}
