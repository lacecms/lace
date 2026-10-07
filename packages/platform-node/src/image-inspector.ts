import {
  CompleteImageContainerInspector,
  type ImageDimensions,
  type ImageInspector,
  type MediaMimeType,
} from "@lacecms/application";
import { DomainError } from "@lacecms/domain";
import sharp from "sharp";

function expectedFormat(mimeType: MediaMimeType): "avif" | "jpeg" | "png" | "webp" {
  switch (mimeType) {
    case "image/avif":
      return "avif";
    case "image/jpeg":
      return "jpeg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
  }
}

/**
 * Node image inspector used only after the portable media policy identifies a
 * candidate format. It reports orientation-applied (displayed) dimensions.
 */
export class NodeSharpImageInspector implements ImageInspector {
  public async inspect(bytes: Uint8Array, mimeType: MediaMimeType): Promise<ImageDimensions> {
    try {
      await new CompleteImageContainerInspector().inspect(bytes, mimeType);
      const metadata = await sharp(bytes, { failOn: "error", limitInputPixels: false }).metadata();
      const format =
        mimeType === "image/avif" && metadata.format === "heif" ? "avif" : metadata.format;
      // Display dimensions: EXIF orientation 5-8 swaps the stored width and height.
      const { height, width } = metadata.autoOrient ?? {};
      if (
        format !== expectedFormat(mimeType) ||
        !Number.isSafeInteger(width) ||
        !Number.isSafeInteger(height) ||
        width! < 1 ||
        height! < 1
      ) {
        throw new DomainError("CONTENT_INVALID_STATE", "Media image data is invalid.");
      }
      return { height: height!, width: width! };
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError("CONTENT_INVALID_STATE", "Media image data is invalid.");
    }
  }
}
