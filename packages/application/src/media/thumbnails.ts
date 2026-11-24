import { LaceError } from "@lacecms/content";
import { requirePermission, type MediaId, type MediaMetadata } from "@lacecms/domain";
import type { ByteStream, ImageDimensions, MediaReadPort, ObjectStorage } from "../ports/media.js";
import type {
  ThumbnailCancellation,
  ThumbnailGenerator,
  ThumbnailStorage,
} from "../ports/media-thumbnails.js";
import { sha256Bytes } from "../shared/sha256.js";
import { mediaThumbnailKey } from "../shared/media-thumbnail-key.js";
import { CompleteImageContainerInspector, inspectStaticWebp } from "./image-container.js";
import { MAX_MEDIA_BYTES } from "./limits.js";
import { validateDimensions } from "./projection.js";
import { ThumbnailAdmission, withThumbnailDeadline } from "./thumbnail-admission.js";
import type { GetMediaUseCaseInput, PublicMediaBinaryUseCaseInput } from "./types.js";
import { collectMediaBytes, detectMediaMimeType } from "./upload.js";
import type { MediaUseCases } from "./use-cases.js";

export const MAX_MEDIA_THUMBNAIL_EDGE = 320;
export const MAX_MEDIA_THUMBNAIL_BYTES = 96 * 1024;
export const MEDIA_THUMBNAIL_ENCODINGS = Object.freeze([
  { edge: MAX_MEDIA_THUMBNAIL_EDGE, quality: 76 },
  { edge: MAX_MEDIA_THUMBNAIL_EDGE, quality: 58 },
  { edge: 240, quality: 54 },
]);

export class MediaThumbnailUnavailableError extends LaceError<"MEDIA_THUMBNAIL_UNAVAILABLE"> {
  public constructor(
    public readonly reason: "busy" | "timeout" | "source" | "storage" | "transform",
  ) {
    super("MEDIA_THUMBNAIL_UNAVAILABLE", "The media thumbnail is unavailable.");
  }
}

export interface MediaThumbnail extends ImageDimensions {
  readonly bytes: Uint8Array;
  readonly mimeType: "image/webp";
  readonly sha256: string;
}

const timeout = new MediaThumbnailUnavailableError("timeout");
const inspector = new CompleteImageContainerInspector();

function checkDeadline(cancellation: ThumbnailCancellation): void {
  if (cancellation.aborted) throw timeout;
}

async function readThumbnailBytes(body: ByteStream): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of body) {
    if (!(chunk instanceof Uint8Array) || size + chunk.byteLength > MAX_MEDIA_THUMBNAIL_BYTES)
      throw new MediaThumbnailUnavailableError("storage");
    if (chunk.byteLength === 0) continue;
    chunks.push(chunk.slice());
    size += chunk.byteLength;
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function describeThumbnail(bytes: Uint8Array): Promise<MediaThumbnail> {
  if (bytes.byteLength > MAX_MEDIA_THUMBNAIL_BYTES)
    throw new MediaThumbnailUnavailableError("transform");
  const dimensions = inspectStaticWebp(bytes);
  if (Math.max(dimensions.height, dimensions.width) > MAX_MEDIA_THUMBNAIL_EDGE)
    throw new MediaThumbnailUnavailableError("transform");
  return { ...dimensions, bytes, mimeType: "image/webp", sha256: await sha256Bytes(bytes) };
}

function fitsOriginal(thumbnail: ImageDimensions, original: ImageDimensions): boolean {
  if (thumbnail.width > original.width || thumbnail.height > original.height) return false;
  const horizontal = original.width >= original.height;
  const scale = horizontal ? thumbnail.width / original.width : thumbnail.height / original.height;
  const delta = horizontal
    ? thumbnail.height - original.height * scale
    : thumbnail.width - original.width * scale;
  return Math.abs(delta) <= 1;
}

export class MediaThumbnails {
  private readonly admission = new ThumbnailAdmission();

  public constructor(
    private readonly dependencies: {
      readonly media: MediaReadPort;
      readonly publishedMedia?: Pick<MediaUseCases, "resolvePublic">;
      readonly originals: Pick<ObjectStorage, "get">;
      readonly storage: ThumbnailStorage;
      readonly generator?: ThumbnailGenerator;
      readonly timeoutMs?: number;
    },
  ) {}

  public async read(input: GetMediaUseCaseInput): Promise<MediaThumbnail | null> {
    requirePermission(input.actor, "content:read");
    return this.readOrCreate(input.mediaId);
  }

  public async readPublished(input: PublicMediaBinaryUseCaseInput): Promise<MediaThumbnail | null> {
    const { publishedMedia } = this.dependencies;
    if (!publishedMedia || !(await publishedMedia.resolvePublic(input))) return null;
    const thumbnail = await this.readOrCreate(input.mediaId);
    return thumbnail && (await publishedMedia.resolvePublic(input)) ? thumbnail : null;
  }

  public get canGenerate(): boolean {
    return this.dependencies.generator !== undefined;
  }

  /** Call only for a committed upload. On-demand reads recover from any failed attempt. */
  public async prepare(mediaId: MediaId): Promise<void> {
    if (!this.canGenerate) return;
    await this.readOrCreate(mediaId);
  }

  private async readOrCreate(id: MediaId): Promise<MediaThumbnail | null> {
    const key = mediaThumbnailKey(id);
    return withThumbnailDeadline(
      this.dependencies.timeoutMs ?? 20_000,
      timeout,
      async (cancellation) => {
        const media = await this.activeMedia(id);
        checkDeadline(cancellation);
        if (media === null) return null;
        const stored = await this.readStored(key);
        if (stored !== null) return (await this.activeMedia(id)) ? stored : null;
        const { generator } = this.dependencies;
        if (!generator) throw new MediaThumbnailUnavailableError("transform");
        return this.admission.run(
          key,
          cancellation,
          new MediaThumbnailUnavailableError("busy"),
          timeout,
          async () => {
            const current = await this.activeMedia(id);
            checkDeadline(cancellation);
            if (current === null) return null;
            const winner = await this.readStored(key);
            checkDeadline(cancellation);
            if (winner !== null) return (await this.activeMedia(id)) ? winner : null;
            const thumbnail = await this.generate(current, generator, cancellation).catch(
              async (error: unknown) => {
                checkDeadline(cancellation);
                if ((await this.activeMedia(id).catch(() => undefined)) === null) return null;
                throw error;
              },
            );
            if (thumbnail === null) return null;
            checkDeadline(cancellation);
            if (!(await this.activeMedia(id))) return null;
            checkDeadline(cancellation);
            return this.persist(id, key, thumbnail, cancellation);
          },
        );
      },
    );
  }

  private async activeMedia(id: MediaId): Promise<MediaMetadata | null> {
    const media = await this.dependencies.media.loadMedia(id);
    return media?.status === "active" ? media : null;
  }

  private async readStored(key: string): Promise<MediaThumbnail | null> {
    try {
      const stored = await this.dependencies.storage.get(key);
      return stored === null ? null : await describeThumbnail(await readThumbnailBytes(stored));
    } catch {
      throw new MediaThumbnailUnavailableError("storage");
    }
  }

  private async generate(
    media: MediaMetadata,
    generator: ThumbnailGenerator,
    cancellation: ThumbnailCancellation,
  ): Promise<MediaThumbnail> {
    let source: Parameters<ThumbnailGenerator["generate"]>[0];
    try {
      if (media.size > MAX_MEDIA_BYTES) throw new MediaThumbnailUnavailableError("source");
      const body = await this.dependencies.originals.get(media.storageKey);
      if (body === null) throw new MediaThumbnailUnavailableError("source");
      const bytes = await collectMediaBytes(body);
      const mimeType = detectMediaMimeType(bytes);
      if (mimeType !== media.mimeType) throw new MediaThumbnailUnavailableError("source");
      const dimensions = await inspector.inspect(bytes, mimeType);
      validateDimensions(dimensions.width, dimensions.height);
      source = { ...dimensions, bytes, mimeType, cancellation };
    } catch {
      throw new MediaThumbnailUnavailableError("source");
    }
    checkDeadline(cancellation);
    try {
      const thumbnail = await describeThumbnail(await generator.generate(source));
      if (!fitsOriginal(thumbnail, source)) throw new MediaThumbnailUnavailableError("transform");
      return thumbnail;
    } catch {
      throw new MediaThumbnailUnavailableError("transform");
    }
  }

  private async persist(
    id: MediaId,
    key: string,
    thumbnail: MediaThumbnail,
    cancellation: ThumbnailCancellation,
  ): Promise<MediaThumbnail | null> {
    const { storage } = this.dependencies;
    let created = false;
    try {
      const { bytes, sha256 } = thumbnail;
      created = (await storage.putIfAbsent({ key, bytes, sha256 })) === "created";
    } catch {
      // A missed acknowledgment can leave a committed object at this key.
    }
    if (!(await this.activeMedia(id))) {
      await storage.delete(key).catch(() => undefined);
      return null;
    }
    checkDeadline(cancellation);
    if (created) return thumbnail;
    const winner = await this.readStored(key);
    if (!(await this.activeMedia(id))) return null;
    if (!winner) throw new MediaThumbnailUnavailableError("storage");
    return winner;
  }
}
