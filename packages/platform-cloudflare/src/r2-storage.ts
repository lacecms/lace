import { ObjectStorageError } from "@lacecms/application";
import {
  MAX_MEDIA_BYTES,
  type ByteStream,
  type ObjectStorage,
  type PutObjectInput,
  type StoredObject,
} from "@lacecms/application";

/** Structural subset of an R2 object body returned by the Worker binding. */
export interface R2ObjectBody {
  readonly body: ReadableStream<Uint8Array>;
}

/** Structural subset of the Cloudflare R2 bucket binding used by Lace. */
export interface R2Bucket {
  delete(key: string): Promise<void>;
  get(key: string): Promise<R2ObjectBody | null>;
  head(key: string): Promise<unknown>;
  put(
    key: string,
    value: Uint8Array,
    options?: { readonly httpMetadata?: { readonly contentType?: string } },
  ): Promise<unknown>;
}

export interface CloudflareR2Settings {
  readonly publicBaseUrl: URL;
  readonly timeoutMs: number;
}

export const DEFAULT_R2_TIMEOUT_MS = 10_000;

export class CloudflareObjectStorageError extends ObjectStorageError {
  public constructor() {
    super("Object storage operation failed.");
    this.name = "CloudflareObjectStorageError";
  }
}

const timers = globalThis as unknown as {
  clearTimeout(handle: unknown): void;
  setTimeout(callback: () => void, delayMs: number): unknown;
};

function streamFromReadable(body: ReadableStream<Uint8Array>, timeoutMs: number): ByteStream {
  return {
    async *[Symbol.asyncIterator](): AsyncGenerator<Uint8Array> {
      const reader = body.getReader();
      try {
        for (;;) {
          let result: ReadableStreamReadResult<Uint8Array>;
          try {
            result = await bounded(reader.read(), timeoutMs);
          } catch {
            throw new CloudflareObjectStorageError();
          }
          if (result.done) return;
          if (!(result.value instanceof Uint8Array)) throw new CloudflareObjectStorageError();
          yield result.value;
        }
      } finally {
        reader.releaseLock();
      }
    },
  };
}

function bounded<Value>(operation: Promise<Value>, timeoutMs: number): Promise<Value> {
  let handle: unknown;
  const timeout = new Promise<never>((_resolve, reject) => {
    handle = timers.setTimeout(() => reject(new CloudflareObjectStorageError()), timeoutMs);
  });
  return Promise.race([operation, timeout]).finally(() => timers.clearTimeout(handle));
}

/** Maps the portable object-storage port to a private native R2 bucket binding. */
export class CloudflareR2ObjectStorage implements ObjectStorage {
  public constructor(
    private readonly bucket: R2Bucket,
    private readonly settings: CloudflareR2Settings,
  ) {}

  public async createReadUrl(key: string): Promise<string> {
    const mediaId = key.startsWith("media/") ? key.slice("media/".length) : key;
    return new URL(
      `api/v1/public/media/${encodeURIComponent(mediaId)}`,
      this.settings.publicBaseUrl,
    ).href;
  }

  public async delete(key: string): Promise<void> {
    await this.call(() => this.bucket.delete(key));
  }

  public async get(key: string): Promise<ByteStream | null> {
    const object = await this.call(() => this.bucket.get(key));
    if (object === null) return null;
    if (typeof object?.body?.getReader !== "function") throw new CloudflareObjectStorageError();
    return streamFromReadable(object.body, this.settings.timeoutMs);
  }

  public async put(input: PutObjectInput): Promise<StoredObject> {
    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const chunk of input.body) {
      if (!(chunk instanceof Uint8Array)) throw new CloudflareObjectStorageError();
      size += chunk.byteLength;
      if (size > MAX_MEDIA_BYTES) throw new CloudflareObjectStorageError();
      chunks.push(chunk);
    }
    const body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    await this.call(() =>
      this.bucket.put(input.key, body, { httpMetadata: { contentType: input.contentType } }),
    );
    return { contentType: input.contentType, key: input.key, size };
  }

  private async call<Value>(operation: () => Promise<Value>): Promise<Value> {
    try {
      return await bounded(operation(), this.settings.timeoutMs);
    } catch {
      throw new CloudflareObjectStorageError();
    }
  }
}
