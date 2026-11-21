import type { ByteStream } from "./media.js";
import type { PreviewObject } from "./preview.js";

export interface PreviewByteRange {
  readonly offset: number;
  readonly length: number;
}

/** Private storage with create-only writes that verify the supplied SHA-256 and length. */
export interface PreviewBlobStorage {
  readonly put: (
    input: PreviewObject & {
      readonly key: string;
      readonly body: Uint8Array | ByteStream;
    },
  ) => Promise<"created" | "exists">;
  readonly get: (
    key: string,
    range?: PreviewByteRange,
  ) => Promise<{ readonly body: ByteStream; readonly bytes: number } | null>;
  readonly head: (key: string) => Promise<number | null>;
  readonly list: (
    prefix: string,
    limit: number,
    cursor?: string,
  ) => Promise<{
    readonly objects: readonly { readonly key: string; readonly bytes: number }[];
    readonly cursor?: string;
  }>;
  readonly delete: (keys: readonly string[]) => Promise<void>;
}
