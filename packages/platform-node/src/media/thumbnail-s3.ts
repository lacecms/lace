import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  MEDIA_THUMBNAIL_PREFIX,
  type ByteStream,
  type ThumbnailStorage,
} from "@lacecms/application";
import { Readable } from "node:stream";
import {
  isPreconditionFailure,
  nodeS3ClientConfig,
  NodeObjectStorageError,
  streamFromNode,
  type NodeMinioSettings,
} from "./minio-storage.js";

function requireThumbnailKey(key: string): void {
  if (!key.startsWith(MEDIA_THUMBNAIL_PREFIX)) throw new NodeObjectStorageError();
}

export class NodeThumbnailStorage implements ThumbnailStorage {
  public constructor(
    private readonly settings: NodeMinioSettings,
    private readonly client: Pick<S3Client, "send"> = new S3Client(nodeS3ClientConfig(settings)),
  ) {}

  public async get(key: string): Promise<ByteStream | null> {
    requireThumbnailKey(key);
    const abortSignal = AbortSignal.timeout(this.settings.timeoutMs);
    try {
      const object = await this.client.send(
        new GetObjectCommand({ Bucket: this.settings.bucket, Key: key }),
        { abortSignal },
      );
      if (!(object.Body instanceof Readable)) throw new NodeObjectStorageError();
      const body = object.Body;
      const stop = () => body.destroy(new NodeObjectStorageError());
      abortSignal.addEventListener("abort", stop, { once: true });
      body.once("close", () => abortSignal.removeEventListener("abort", stop));
      if (abortSignal.aborted) stop();
      return streamFromNode(body);
    } catch (error) {
      if (error instanceof Error && error.name === "NoSuchKey") return null;
      throw new NodeObjectStorageError();
    }
  }

  public readonly putIfAbsent: ThumbnailStorage["putIfAbsent"] = async ({ key, bytes, sha256 }) => {
    requireThumbnailKey(key);
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.settings.bucket,
          Key: key,
          Body: bytes,
          ContentLength: bytes.byteLength,
          ContentType: "image/webp",
          ChecksumSHA256: Buffer.from(sha256, "hex").toString("base64"),
          IfNoneMatch: "*",
          CacheControl: "private, no-store",
        }),
        this.options(),
      );
      return "created";
    } catch (error) {
      if (isPreconditionFailure(error)) return "exists";
      throw new NodeObjectStorageError();
    }
  };

  public async delete(key: string): Promise<void> {
    requireThumbnailKey(key);
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.settings.bucket,
          Key: key,
        }),
        this.options(),
      );
    } catch {
      throw new NodeObjectStorageError();
    }
  }

  public async list(limit: number, cursor?: string) {
    try {
      const result = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.settings.bucket,
          Prefix: MEDIA_THUMBNAIL_PREFIX,
          MaxKeys: limit,
          ContinuationToken: cursor,
        }),
        this.options(),
      );
      const keys = (result.Contents ?? []).map(({ Key }) => {
        if (!Key) throw new NodeObjectStorageError();
        requireThumbnailKey(Key);
        return Key;
      });
      if (result.IsTruncated && !result.NextContinuationToken) throw new NodeObjectStorageError();
      return { keys, ...(result.IsTruncated && { cursor: result.NextContinuationToken! }) };
    } catch {
      throw new NodeObjectStorageError();
    }
  }

  private options() {
    return { abortSignal: AbortSignal.timeout(this.settings.timeoutMs) };
  }
}
