import type { ByteStream, ImageDimensions, MediaMimeType } from "./media.js";

export interface ThumbnailCancellation {
  readonly aborted: boolean;
  onAbort(callback: () => void): () => void;
}

export interface ThumbnailGenerator {
  generate(
    input: ImageDimensions & {
      readonly bytes: Uint8Array;
      readonly mimeType: MediaMimeType;
      readonly cancellation: ThumbnailCancellation;
    },
  ): Promise<Uint8Array>;
}

/** Storage operations are confined to the private thumbnail recipe prefix by the caller. */
export interface ThumbnailStorage {
  get(key: string): Promise<ByteStream | null>;
  putIfAbsent(input: {
    readonly key: string;
    readonly bytes: Uint8Array;
    readonly sha256: string;
  }): Promise<"created" | "exists">;
  delete(key: string): Promise<void>;
  list(
    limit: number,
    cursor?: string,
  ): Promise<{
    readonly keys: readonly string[];
    readonly cursor?: string;
  }>;
}
