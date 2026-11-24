import {
  MEDIA_THUMBNAIL_PREFIX,
  type ByteStream,
  type ThumbnailStorage,
} from "@lacecms/application";
import {
  bounded,
  CloudflareObjectStorageError,
  streamFromReadable,
  type R2Bucket,
} from "./r2-storage.js";

function requireThumbnailKey(key: string): void {
  if (!key.startsWith(MEDIA_THUMBNAIL_PREFIX)) throw new CloudflareObjectStorageError();
}

export class CloudflareThumbnailStorage implements ThumbnailStorage {
  public constructor(
    private readonly bucket: R2Bucket,
    private readonly timeoutMs: number,
  ) {}

  public async get(key: string): Promise<ByteStream | null> {
    requireThumbnailKey(key);
    const object = await this.call(() => this.bucket.get(key));
    if (object === null) return null;
    if (typeof object?.body?.getReader !== "function") throw new CloudflareObjectStorageError();
    return streamFromReadable(object.body, this.timeoutMs);
  }

  public readonly putIfAbsent: ThumbnailStorage["putIfAbsent"] = async ({ key, bytes, sha256 }) => {
    requireThumbnailKey(key);
    const result = await this.call(() =>
      this.bucket.put(key, bytes, {
        onlyIf: { etagDoesNotMatch: "*" },
        sha256,
        httpMetadata: { contentType: "image/webp", cacheControl: "private, no-store" },
      }),
    );
    return result === null ? "exists" : "created";
  };

  public async delete(key: string): Promise<void> {
    requireThumbnailKey(key);
    await this.call(() => this.bucket.delete(key));
  }

  public async list(limit: number, cursor?: string) {
    const bucket = this.bucket;
    if (!bucket.list) throw new CloudflareObjectStorageError();
    const result = await this.call(() =>
      bucket.list!({
        prefix: MEDIA_THUMBNAIL_PREFIX,
        limit,
        ...(cursor !== undefined && { cursor }),
      }),
    );
    if (result.truncated && !result.cursor) throw new CloudflareObjectStorageError();
    const keys = result.objects.map(({ key }) => {
      requireThumbnailKey(key);
      return key;
    });
    return { keys, ...(result.truncated && { cursor: result.cursor! }) };
  }

  private async call<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await bounded(operation(), this.timeoutMs);
    } catch {
      throw new CloudflareObjectStorageError();
    }
  }
}
