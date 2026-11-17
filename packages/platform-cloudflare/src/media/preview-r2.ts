import type { PreviewBlobStorage, PreviewByteRange } from "@lacecms/application";
import { bounded, CloudflareObjectStorageError, streamFromReadable } from "./r2-storage.js";
import type { R2Bucket, R2ObjectBody } from "./r2-storage.js";

interface PreviewR2Bucket extends R2Bucket {
  delete(key: string | string[]): Promise<void>;
  get(
    key: string,
    options?: { readonly range: PreviewByteRange },
  ): Promise<
    | (R2ObjectBody & {
        readonly size: number;
      })
    | null
  >;
  put(
    key: string,
    value: Uint8Array | ReadableStream<Uint8Array>,
    options?: {
      readonly httpMetadata?: { readonly contentType?: string; readonly cacheControl?: string };
      readonly onlyIf?: { readonly etagDoesNotMatch: "*" };
      readonly sha256?: string;
    },
  ): Promise<unknown>;
  head(key: string): Promise<{ readonly size: number } | null>;
  list(options: {
    readonly prefix: string;
    readonly limit: number;
    readonly cursor?: string;
  }): Promise<{
    readonly objects: readonly { readonly key: string; readonly size: number }[];
    readonly truncated: boolean;
    readonly cursor?: string;
  }>;
}

const streams = globalThis as typeof globalThis & {
  readonly FixedLengthStream?: new (length: number) => TransformStream<Uint8Array, Uint8Array>;
};

export class CloudflarePreviewBlobStorage implements PreviewBlobStorage {
  private readonly bucket: PreviewR2Bucket;

  public constructor(
    bucket: R2Bucket,
    private readonly timeoutMs: number,
  ) {
    if (!("list" in bucket) || typeof bucket.list !== "function")
      throw new TypeError("Preview requires a private R2 bucket with listing support.");
    this.bucket = bucket as PreviewR2Bucket;
  }

  public readonly put: PreviewBlobStorage["put"] = async ({ key, body, bytes, sha256 }) => {
    const options = {
      onlyIf: { etagDoesNotMatch: "*" as const },
      sha256,
      httpMetadata: { cacheControl: "private, no-store" },
    };
    if (body instanceof Uint8Array) {
      if (body.byteLength !== bytes) throw new CloudflareObjectStorageError();
      const value = await this.call(() => this.bucket.put(key, body, options));
      return value === null ? "exists" : "created";
    }
    if (!streams.FixedLengthStream) throw new CloudflareObjectStorageError();
    const pipe = new streams.FixedLengthStream(bytes);
    const iterator = body[Symbol.asyncIterator]();
    const source = new ReadableStream<Uint8Array>({
      async pull(controller) {
        const next = await iterator.next();
        if (next.done) controller.close();
        else controller.enqueue(next.value);
      },
      async cancel() {
        await iterator.return?.();
      },
    });
    const abort = new AbortController();
    try {
      const [result] = await this.call(() =>
        Promise.all([
          this.bucket.put(key, pipe.readable, options).then((value) => {
            if (value === null) abort.abort();
            return value;
          }),
          source.pipeTo(pipe.writable, { signal: abort.signal }).catch((error: unknown) => {
            if (!abort.signal.aborted) throw error;
          }),
        ]),
      );
      return result === null ? "exists" : "created";
    } finally {
      abort.abort();
    }
  };

  public async get(key: string, range?: PreviewByteRange) {
    const object = await this.call(() => this.bucket.get(key, range && { range }));
    if (!object) return null;
    if (range && range.offset + range.length > object.size) {
      await object.body.cancel();
      throw new CloudflareObjectStorageError();
    }
    return {
      body: streamFromReadable(object.body, this.timeoutMs),
      bytes: range?.length ?? object.size,
    };
  }

  public async head(key: string) {
    return (await this.call(() => this.bucket.head(key)))?.size ?? null;
  }

  public async list(prefix: string, limit: number, cursor?: string) {
    const result = await this.call(() =>
      this.bucket.list({ prefix, limit, ...(cursor && { cursor }) }),
    );
    if (result.truncated && !result.cursor) throw new CloudflareObjectStorageError();
    return {
      objects: result.objects.map(({ key, size }) => ({ key, bytes: size })),
      ...(result.truncated && { cursor: result.cursor! }),
    };
  }

  public async delete(keys: readonly string[]) {
    if (keys.length > 0) await this.call(() => this.bucket.delete([...keys]));
  }

  private async call<Value>(operation: () => Promise<Value>): Promise<Value> {
    try {
      return await bounded(operation(), this.timeoutMs);
    } catch {
      throw new CloudflareObjectStorageError();
    }
  }
}
