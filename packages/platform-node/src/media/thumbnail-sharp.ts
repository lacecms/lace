import {
  MAX_IMAGE_PIXELS,
  MAX_MEDIA_THUMBNAIL_BYTES,
  MEDIA_THUMBNAIL_ENCODINGS,
  MediaThumbnailUnavailableError,
  type ThumbnailGenerator,
} from "@lacecms/application";
import sharp from "sharp";

export class NodeSharpThumbnailGenerator implements ThumbnailGenerator {
  public readonly generate: ThumbnailGenerator["generate"] = async ({ bytes, cancellation }) => {
    for (const { edge, quality } of MEDIA_THUMBNAIL_ENCODINGS) {
      if (cancellation.aborted) break;
      const pipeline = sharp(bytes, {
        failOn: "error",
        limitInputPixels: MAX_IMAGE_PIXELS,
        pages: 1,
      })
        .autoOrient()
        .resize({ width: edge, height: edge, fit: "inside", withoutEnlargement: true })
        .webp({ quality })
        .timeout({ seconds: 10 });
      const removeAbort = cancellation.onAbort(() => pipeline.destroy());
      try {
        const output = await pipeline.toBuffer();
        if (!cancellation.aborted && output.length <= MAX_MEDIA_THUMBNAIL_BYTES) return output;
      } finally {
        removeAbort();
      }
    }
    throw new MediaThumbnailUnavailableError("transform");
  };
}
