import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { ByteStream, PreviewBlobStorage, PreviewByteRange } from "@lacecms/application";
import { Readable } from "node:stream";
import {
  isMissingObject,
  isPreconditionFailure,
  nodeS3ClientConfig,
  NodeObjectStorageError,
  streamFromNode,
} from "./minio-storage.js";
import type { NodeMinioSettings } from "./minio-storage.js";

type PreviewS3Client = Pick<S3Client, "send">;

async function* exactLength(body: ByteStream, expected: number) {
  let transmitted = 0;
  for await (const chunk of body) {
    if (!(chunk instanceof Uint8Array)) throw new NodeObjectStorageError();
    transmitted += chunk.byteLength;
    if (transmitted > expected) throw new NodeObjectStorageError();
    yield chunk;
  }
  if (transmitted !== expected) throw new NodeObjectStorageError();
}

export class NodePreviewBlobStorage implements PreviewBlobStorage {
  public constructor(
    private readonly settings: NodeMinioSettings,
    private readonly client: PreviewS3Client = new S3Client(nodeS3ClientConfig(settings)),
  ) {}

  public readonly put: PreviewBlobStorage["put"] = async (input) => {
    if (input.body instanceof Uint8Array && input.body.byteLength !== input.bytes)
      throw new NodeObjectStorageError();
    const stream =
      input.body instanceof Uint8Array
        ? undefined
        : Readable.from(exactLength(input.body, input.bytes));
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.settings.bucket,
          Key: input.key,
          Body: stream ?? (input.body as Uint8Array),
          ContentLength: input.bytes,
          ChecksumSHA256: Buffer.from(input.sha256, "hex").toString("base64"),
          IfNoneMatch: "*",
          CacheControl: "private, no-store",
        }),
        this.options(),
      );
      return "created";
    } catch (error) {
      if (isPreconditionFailure(error)) return "exists";
      throw new NodeObjectStorageError();
    } finally {
      stream?.destroy();
    }
  };

  public async get(key: string, range?: PreviewByteRange) {
    try {
      const object = await this.client.send(
        new GetObjectCommand({
          Bucket: this.settings.bucket,
          Key: key,
          ...(range && { Range: `bytes=${range.offset}-${range.offset + range.length - 1}` }),
        }),
        this.options(),
      );
      if (object.ContentLength === undefined || (range && object.ContentLength !== range.length)) {
        if (object.Body instanceof Readable) object.Body.destroy();
        throw new NodeObjectStorageError();
      }
      return { body: streamFromNode(object.Body), bytes: object.ContentLength };
    } catch (error) {
      if (isMissingObject(error)) return null;
      throw new NodeObjectStorageError();
    }
  }

  public async head(key: string) {
    try {
      const object = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.settings.bucket,
          Key: key,
        }),
        this.options(),
      );
      if (object.ContentLength === undefined) throw new NodeObjectStorageError();
      return object.ContentLength;
    } catch (error) {
      if (isMissingObject(error)) return null;
      throw new NodeObjectStorageError();
    }
  }

  public async list(prefix: string, limit: number, cursor?: string) {
    try {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.settings.bucket,
          Prefix: prefix,
          MaxKeys: limit,
          ContinuationToken: cursor,
        }),
        this.options(),
      );
      const objects = (response.Contents ?? []).map(({ Key, Size }) => {
        if (!Key?.startsWith(prefix) || Size === undefined) throw new NodeObjectStorageError();
        return { key: Key, bytes: Size };
      });
      if (response.IsTruncated && !response.NextContinuationToken)
        throw new NodeObjectStorageError();
      return { objects, ...(response.IsTruncated && { cursor: response.NextContinuationToken! }) };
    } catch {
      throw new NodeObjectStorageError();
    }
  }

  public async delete(keys: readonly string[]) {
    if (keys.length === 0) return;
    try {
      const result = await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.settings.bucket,
          Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
        }),
        this.options(),
      );
      if (result.Errors?.some(({ Code }) => Code !== "NoSuchKey"))
        throw new NodeObjectStorageError();
    } catch {
      throw new NodeObjectStorageError();
    }
  }

  private options() {
    return { abortSignal: AbortSignal.timeout(this.settings.timeoutMs) };
  }
}
