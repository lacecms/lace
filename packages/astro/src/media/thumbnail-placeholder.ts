import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ImageThumbnailReader } from "@lacecms/render";
import { blurredPlaceholder, opaqueWebpDimensions } from "./placeholder-image.js";

const recipe = "build-thumbnail-v1";
const edge = 64;
const maxBlurBytes = 4 * 1024;
const timeoutMs = 5_000;
const maxConcurrentReads = 4;

type Dimensions = { readonly width: number; readonly height: number };
type Transform = (bytes: Uint8Array, dimensions: Dimensions) => Promise<Uint8Array>;

function placeholder(bytes: Uint8Array): string | undefined {
  if (bytes.byteLength > maxBlurBytes) return undefined;
  const image = opaqueWebpDimensions(bytes);
  if (!image || Math.max(image.width, image.height) > edge) return undefined;
  return blurredPlaceholder(bytes, image.width, image.height);
}

async function readCache(file: string) {
  try {
    const { etag, webp } = JSON.parse(await readFile(file, "utf8")) as {
      etag?: unknown;
      webp?: unknown;
    };
    if (
      typeof etag !== "string" ||
      !/^"[\x21\x23-\x7e\u0080-\u00ff]*"$/u.test(etag) ||
      typeof webp !== "string" ||
      webp.length > Math.ceil(maxBlurBytes / 3) * 4 ||
      !/^[A-Za-z0-9+/]+={0,2}$/u.test(webp)
    )
      return undefined;
    const value = placeholder(Buffer.from(webp, "base64"));
    if (value !== undefined) return { etag, value };
  } catch {
    // Missing, unreadable and malformed entries are cache misses.
  }
  return undefined;
}

async function saveCache(directory: string, file: string, etag: string, bytes: Uint8Array) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await mkdir(directory, { recursive: true });
    await writeFile(
      temporary,
      JSON.stringify({ etag, webp: Buffer.from(bytes).toString("base64") }),
    );
    await rename(temporary, file);
  } catch {
    await rm(temporary, { force: true }).catch(() => {});
  }
}

/** Shares work per published view and revalidates persisted results for each new reader. */
export function createThumbnailPlaceholderResolver(directory: string) {
  const pending = new WeakMap<ImageThumbnailReader, Promise<string | undefined>>();
  const waiting: (() => void)[] = [];
  let active = 0;

  async function read(reader: ImageThumbnailReader, etag: string | undefined) {
    if (active >= maxConcurrentReads) await new Promise<void>((ready) => waiting.push(ready));
    else active++;
    let cancelDeadline: (() => void) | undefined;
    try {
      const deadline = new Promise<undefined>((done) => {
        const timer = setTimeout(done, timeoutMs);
        cancelDeadline = () => clearTimeout(timer);
      });
      return await Promise.race([reader.read(etag === undefined ? undefined : { etag }), deadline]);
    } finally {
      cancelDeadline?.();
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  }

  async function compute(reader: ImageThumbnailReader, transform: Transform) {
    const key = createHash("sha256").update(reader.cacheKey).digest("hex");
    const file = join(directory, `${recipe}-${key}.json`);
    const cached = await readCache(file);
    const result = await read(reader, cached?.etag);
    if (result === undefined) return undefined;
    if (!result.changed) return result.etag === cached?.etag ? cached?.value : undefined;
    if (result.bytes.byteLength > 96 * 1024) return undefined;
    const source = opaqueWebpDimensions(result.bytes);
    if (!source || Math.max(source.width, source.height) > 320) return undefined;
    const scale = Math.min(1, edge / Math.max(source.width, source.height));
    const bounds = {
      width: Math.max(1, Math.round(source.width * scale)),
      height: Math.max(1, Math.round(source.height * scale)),
    };
    const bytes = await transform(result.bytes, bounds);
    if (bytes.byteLength > maxBlurBytes) return undefined;
    const output = opaqueWebpDimensions(bytes);
    if (!output || output.width > bounds.width || output.height > bounds.height) return undefined;
    const scaled =
      source.width >= source.height
        ? (output.width * source.height) / source.width - output.height
        : (output.height * source.width) / source.height - output.width;
    if (Math.abs(scaled) > 1) return undefined;
    await saveCache(directory, file, result.etag, bytes);
    return blurredPlaceholder(bytes, output.width, output.height);
  }

  return (reader: ImageThumbnailReader, transform: Transform) => {
    let result = pending.get(reader);
    if (result === undefined) {
      result = compute(reader, transform).catch(() => undefined);
      pending.set(reader, result);
    }
    return result;
  };
}
