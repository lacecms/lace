import {
  MAX_MEDIA_THUMBNAIL_BYTES,
  MEDIA_THUMBNAIL_ENCODINGS,
  MediaThumbnailUnavailableError,
  type ThumbnailCancellation,
  type ThumbnailGenerator,
} from "@lacecms/application";

/** The portion of the Images binding used for private static WebP transformations. */
export interface ImagesBinding {
  input(stream: ReadableStream<Uint8Array>): {
    transform(options: {
      readonly width: number;
      readonly height: number;
      readonly fit: "scale-down";
    }): {
      output(options: {
        readonly format: "image/webp";
        readonly quality: number;
        readonly anim: false;
      }): Promise<{
        response(): Response;
      }>;
    };
  };
}

async function readWebp(response: Response, cancellation: ThumbnailCancellation) {
  if (!response.body) throw new MediaThumbnailUnavailableError("transform");
  if (
    !response.ok ||
    response.headers.get("content-type") !== "image/webp" ||
    cancellation.aborted
  ) {
    await response.body.cancel();
    throw new MediaThumbnailUnavailableError("transform");
  }
  const reader = response.body.getReader();
  const removeAbort = cancellation.onAbort(() => {
    void reader.cancel().catch(() => undefined);
  });
  const bytes = new Uint8Array(MAX_MEDIA_THUMBNAIL_BYTES);
  let offset = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (cancellation.aborted) throw new MediaThumbnailUnavailableError("timeout");
      if (next.done) return bytes.slice(0, offset);
      if (offset + next.value.length > bytes.length) return null;
      bytes.set(next.value, offset);
      offset += next.value.length;
    }
  } finally {
    removeAbort();
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export class CloudflareImagesThumbnailGenerator implements ThumbnailGenerator {
  public constructor(private readonly images: ImagesBinding) {}

  public readonly generate: ThumbnailGenerator["generate"] = async ({ bytes, cancellation }) => {
    for (const { edge, quality } of MEDIA_THUMBNAIL_ENCODINGS) {
      if (cancellation.aborted) break;
      const source = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      });
      const result = await this.images
        .input(source)
        .transform({ width: edge, height: edge, fit: "scale-down" })
        .output({ format: "image/webp", quality, anim: false });
      const thumbnail = await readWebp(result.response(), cancellation);
      if (thumbnail !== null) return thumbnail;
    }
    throw new MediaThumbnailUnavailableError("transform");
  };
}
