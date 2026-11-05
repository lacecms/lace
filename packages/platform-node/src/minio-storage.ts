import { ObjectStorageError } from "@lacecms/application";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import {
  MAX_MEDIA_BYTES,
  type ByteStream,
  type ObjectStorage,
  type PutObjectInput,
  type StoredObject,
} from "@lacecms/application";

export interface NodeMinioSettings {
  readonly accessKeyId: string;
  readonly bucket: string;
  readonly endpoint: URL;
  readonly publicBaseUrl: URL;
  readonly region: string;
  readonly secretAccessKey: string;
  readonly timeoutMs: number;
}

export interface S3CommandClient {
  send(command: object, options?: { readonly abortSignal?: AbortSignal }): Promise<unknown>;
}

export class NodeObjectStorageError extends ObjectStorageError {
  public constructor() {
    super("Object storage operation failed.");
    this.name = "NodeObjectStorageError";
  }
}

function isMissingObject(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const record = error as {
    readonly $metadata?: { readonly httpStatusCode?: unknown };
    readonly name?: unknown;
  };
  return (
    record.name === "NoSuchKey" ||
    record.name === "NotFound" ||
    record.$metadata?.httpStatusCode === 404
  );
}

function streamFromNode(value: unknown): ByteStream {
  if (value === null || typeof value !== "object" || !(Symbol.asyncIterator in value)) {
    throw new NodeObjectStorageError();
  }
  const iterable = value as AsyncIterable<unknown>;
  return {
    async *[Symbol.asyncIterator](): AsyncGenerator<Uint8Array> {
      for await (const chunk of iterable) {
        if (!(chunk instanceof Uint8Array)) throw new NodeObjectStorageError();
        yield new Uint8Array(chunk);
      }
    },
  };
}

function clientConfig(settings: NodeMinioSettings): S3ClientConfig {
  return {
    credentials: {
      accessKeyId: settings.accessKeyId,
      secretAccessKey: settings.secretAccessKey,
    },
    endpoint: settings.endpoint.href,
    forcePathStyle: true,
    region: settings.region,
  };
}

/** Maps the portable object-storage port to a private MinIO/S3-compatible bucket. */
export class NodeMinioObjectStorage implements ObjectStorage {
  private readonly client: S3CommandClient;

  public constructor(
    private readonly settings: NodeMinioSettings,
    client: S3CommandClient = new S3Client(clientConfig(settings)),
  ) {
    this.client = client;
  }

  public async assertReady(): Promise<void> {
    await this.send(new HeadBucketCommand({ Bucket: this.settings.bucket }));
  }

  public async createReadUrl(key: string): Promise<string> {
    const mediaId = key.startsWith("media/") ? key.slice("media/".length) : key;
    return new URL(
      `api/v1/public/media/${encodeURIComponent(mediaId)}`,
      this.settings.publicBaseUrl,
    ).href;
  }

  public async delete(key: string): Promise<void> {
    await this.send(new DeleteObjectCommand({ Bucket: this.settings.bucket, Key: key }));
  }

  public async get(key: string): Promise<ByteStream | null> {
    let result: unknown;
    try {
      result = await this.send(
        new GetObjectCommand({ Bucket: this.settings.bucket, Key: key }),
        true,
      );
    } catch (error) {
      if (isMissingObject(error)) return null;
      throw error;
    }
    const body = (result as { readonly Body?: unknown }).Body;
    return streamFromNode(body);
  }

  public async put(input: PutObjectInput): Promise<StoredObject> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of input.body) {
      if (!(chunk instanceof Uint8Array)) throw new NodeObjectStorageError();
      size += chunk.byteLength;
      if (size > MAX_MEDIA_BYTES) throw new NodeObjectStorageError();
      chunks.push(Buffer.from(chunk));
    }
    const body = Buffer.concat(chunks, size);
    await this.send(
      new PutObjectCommand({
        Body: body,
        Bucket: this.settings.bucket,
        ContentLength: size,
        ContentType: input.contentType,
        Key: input.key,
      }),
    );
    return { contentType: input.contentType, key: input.key, size };
  }

  private async send(command: object, preserveMissingObject = false): Promise<unknown> {
    try {
      return await this.client.send(command, {
        abortSignal: AbortSignal.timeout(this.settings.timeoutMs),
      });
    } catch (error) {
      if (preserveMissingObject && isMissingObject(error)) throw error;
      if (error instanceof NodeObjectStorageError) throw error;
      throw new NodeObjectStorageError();
    }
  }
}
