import { mediaId, type MediaId } from "@lacecms/domain";
import {
  ObjectStorageError,
  type ContentMediaReadPort,
  type ObjectStorage,
} from "../ports/media.js";
import type { ThumbnailStorage } from "../ports/media-thumbnails.js";
import { MEDIA_THUMBNAIL_PREFIX, mediaThumbnailKey } from "../shared/media-thumbnail-key.js";
import { streamBytes } from "./upload.js";

const checkpointKey = "media-thumbnails/maintenance/v1.cursor";
const pageSize = 8;
const maxCheckpointBytes = 8_192;

function ownerOf(key: string): MediaId | undefined {
  if (!key.startsWith(MEDIA_THUMBNAIL_PREFIX) || !key.endsWith(".webp")) return undefined;
  try {
    const id = mediaId(decodeURIComponent(key.slice(MEDIA_THUMBNAIL_PREFIX.length, -5)));
    return mediaThumbnailKey(id) === key ? id : undefined;
  } catch {
    return undefined;
  }
}

async function loadCheckpoint(storage: Pick<ObjectStorage, "get">) {
  const stream = await storage.get(checkpointKey);
  if (stream === null) return undefined;
  let text = "";
  for await (const chunk of stream) {
    if (text.length + chunk.byteLength > maxCheckpointBytes) return undefined;
    text += String.fromCharCode(...chunk);
  }
  try {
    return text === "" ? undefined : decodeURIComponent(text);
  } catch {
    return undefined;
  }
}

/** One resumable page. A failed authoritative read prevents every delete on that page. */
export async function reconcileMediaThumbnails(deps: {
  readonly media: Pick<ContentMediaReadPort, "loadMediaMany">;
  readonly objects: Pick<ObjectStorage, "get" | "put" | "delete">;
  readonly storage: Pick<ThumbnailStorage, "list" | "delete">;
}): Promise<number> {
  const cursor = await loadCheckpoint(deps.objects);
  let requestedCursor = cursor;
  const page = await deps.storage.list(pageSize, cursor).catch((error: unknown) => {
    if (cursor === undefined) throw error;
    // A cursor from a restored bucket may no longer be accepted by storage.
    requestedCursor = undefined;
    return deps.storage.list(pageSize);
  });
  if (page.keys.length > pageSize || (page.cursor !== undefined && page.cursor === requestedCursor))
    throw new ObjectStorageError("Invalid thumbnail storage listing.");

  const ids = page.keys.flatMap((key) => {
    const owner = ownerOf(key);
    return owner === undefined ? [] : [owner];
  });
  let failures = 0;
  if (ids.length > 0) {
    const media = await deps.media.loadMediaMany(ids);
    const active = new Set(media.filter(({ status }) => status === "active").map(({ id }) => id));
    const results = await Promise.allSettled(
      ids.filter((id) => !active.has(id)).map((id) => deps.storage.delete(mediaThumbnailKey(id))),
    );
    failures = results.filter(({ status }) => status === "rejected").length;
  }

  if (page.cursor === undefined) {
    if (cursor !== undefined) await deps.objects.delete(checkpointKey);
  } else {
    const encoded = encodeURIComponent(page.cursor);
    if (encoded.length > maxCheckpointBytes)
      throw new ObjectStorageError("Invalid thumbnail storage cursor.");
    await deps.objects.put({
      key: checkpointKey,
      contentType: "text/plain",
      body: streamBytes(Uint8Array.from(encoded, (char) => char.charCodeAt(0))),
    });
  }
  return failures;
}
