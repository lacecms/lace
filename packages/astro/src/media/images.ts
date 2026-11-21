import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ImageDescription } from "@lacecms/render";

/** The variant widths Lace renders, each capped at the original width. */
export const IMAGE_VARIANT_WIDTHS = Object.freeze([960, 1920] as const);
/** The width of the inline placeholder, capped at the original width. */
export const IMAGE_PLACEHOLDER_WIDTH = 64;

const PLACEHOLDER_CACHE_VERSION = "v1";
const MEDIA_PATH = "api/v1/public/media/*";

/** One Astro `image.remotePatterns` entry. */
export interface LaceRemotePattern {
  readonly hostname: string;
  readonly pathname: string;
  readonly port?: string;
  readonly protocol: string;
}

/** The Astro `image` configuration that lets the build fetch Lace media originals. */
export interface LaceImageConfig {
  readonly remotePatterns: readonly LaceRemotePattern[];
}

/**
 * Returns Astro image options that allow exactly the public media path under
 * `LACE_API_BASE_URL`, or no remote at all without a valid HTTP(S) URL.
 */
export function laceImageConfig(
  env: Readonly<Record<string, string | undefined>> = {},
): LaceImageConfig {
  const value = env.LACE_API_BASE_URL?.trim();
  if (value === undefined || value === "") return { remotePatterns: [] };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { remotePatterns: [] };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { remotePatterns: [] };
  const basePath = url.pathname.replace(/\/+$/u, "");
  return {
    remotePatterns: [
      {
        hostname: url.hostname,
        pathname: `${basePath}/${MEDIA_PATH}`,
        ...(url.port === "" ? {} : { port: url.port }),
        protocol: url.protocol.slice(0, -1),
      },
    ],
  };
}

/** The distinct variant widths for an original width, ascending. */
export function variantWidths(originalWidth: number): readonly number[] {
  return [...new Set(IMAGE_VARIANT_WIDTHS.map((width) => Math.min(width, originalWidth)))].sort(
    (left, right) => left - right,
  );
}

function scaledHeight(width: number, original: { width: number; height: number }): number {
  return Math.max(1, Math.round((width * original.height) / original.width));
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}

/**
 * Reports whether a WebP file carries an alpha channel. Unknown or malformed
 * input counts as transparent, so no placeholder is drawn behind it.
 */
export function webpHasAlpha(bytes: Uint8Array): boolean {
  if (bytes.length < 21 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 12) !== "WEBP")
    return true;
  const chunk = ascii(bytes, 12, 16);
  if (chunk === "VP8 ") return false;
  if (chunk === "VP8X") return ((bytes[20] ?? 0) & 0x10) !== 0;
  if (chunk === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f) {
    const bits =
      (bytes[21] ?? 0) |
      ((bytes[22] ?? 0) << 8) |
      ((bytes[23] ?? 0) << 16) |
      ((bytes[24] ?? 0) << 24);
    return ((bits >>> 28) & 1) === 1;
  }
  return true;
}

/** An SVG data URL that draws a small WebP blurred to its full box. */
export function blurredPlaceholder(webp: Uint8Array, width: number, height: number): string {
  const deviation = Math.max(1, Math.round((width / 24) * 10) / 10);
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${width} ${height}'>` +
    `<filter id='b' color-interpolation-filters='sRGB'><feGaussianBlur stdDeviation='${deviation}'/>` +
    "<feComponentTransfer><feFuncA type='discrete' tableValues='1 1'/></feComponentTransfer></filter>" +
    "<image width='100%' height='100%' preserveAspectRatio='none' filter='url(#b)' " +
    `href='data:image/webp;base64,${Buffer.from(webp).toString("base64")}'/></svg>`;
  // Percent-encode only what a CSS url() data URL needs; `%` goes first.
  let escaped = svg;
  for (const character of ["%", "\u0023", "<", ">"])
    escaped = escaped.replaceAll(character, encodeURIComponent(character));
  return `data:image/svg+xml,${escaped}`;
}

/** The structural part of an Astro local image service that placeholders use. */
export interface LaceImageService {
  readonly transform?: (
    inputBuffer: Uint8Array,
    transform: Readonly<Record<string, unknown>>,
    imageConfig: never,
    logger: LaceImageLogger,
  ) => Promise<{ readonly data: Uint8Array }>;
}

interface LaceImageLogger {
  readonly error: (message: string) => void;
  readonly info: (message: string) => void;
  readonly warn: (message: string) => void;
}

const logger: LaceImageLogger = Object.freeze({
  error: (message: string) => console.error(`[lace] ${message}`),
  info: () => {},
  warn: (message: string) => console.warn(`[lace] ${message}`),
});

export interface PlaceholderResolverOptions {
  /** Directory of the on-disk cache; defaults to Astro's default cache directory. */
  readonly cacheDirectory?: string;
  readonly fetch?: typeof fetch;
  readonly imageConfig: unknown;
  readonly service: LaceImageService;
}

/** The image fields a placeholder needs. */
export type PlaceholderSource = Pick<
  ImageDescription,
  "height" | "mimeType" | "sourceUrl" | "width"
>;

/** Resolves the placeholder data URL of an image, or `undefined` when it has none. */
export type PlaceholderResolver = (image: PlaceholderSource) => Promise<string | undefined>;

/**
 * Creates a placeholder resolver that fetches each original at most once per
 * resolver and caches results on disk by source URL; media bytes never change
 * for a media identifier, so cached placeholders never go stale.
 */
export function createPlaceholderResolver(
  options: PlaceholderResolverOptions,
): PlaceholderResolver {
  const cacheDirectory =
    options.cacheDirectory ?? join(process.cwd(), "node_modules", ".astro", "lace", "placeholders");
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const pending = new Map<string, Promise<string | null>>();

  async function compute(
    sourceUrl: string,
    original: { width: number; height: number },
    transform: NonNullable<LaceImageService["transform"]>,
  ): Promise<string | null> {
    const key = createHash("sha256")
      .update(`${sourceUrl}|${PLACEHOLDER_CACHE_VERSION}`)
      .digest("hex");
    const file = join(cacheDirectory, `${key}.txt`);
    try {
      const cached = await readFile(file, "utf8");
      return cached === "none" ? null : cached;
    } catch {
      // Not cached yet.
    }
    let response: Response;
    try {
      response = await fetchImpl(sourceUrl);
    } catch (cause) {
      throw new Error(`Lace could not fetch the image ${sourceUrl} for its placeholder.`, {
        cause,
      });
    }
    if (!response.ok)
      throw new Error(
        `Lace could not fetch the image ${sourceUrl} for its placeholder: HTTP ${response.status}.`,
      );
    const bytes = new Uint8Array(await response.arrayBuffer());
    const width = Math.min(IMAGE_PLACEHOLDER_WIDTH, original.width);
    const height = scaledHeight(width, original);
    const { data } = await transform(
      bytes,
      { format: "webp", height, quality: 50, src: sourceUrl, width },
      options.imageConfig as never,
      logger,
    );
    const value = webpHasAlpha(data) ? null : blurredPlaceholder(data, width, height);
    try {
      await mkdir(cacheDirectory, { recursive: true });
      const temporary = `${file}.${process.pid}.tmp`;
      await writeFile(temporary, value ?? "none");
      await rename(temporary, file);
    } catch (error) {
      logger.warn(`could not cache the placeholder of ${sourceUrl}: ${String(error)}`);
    }
    return value;
  }

  return async (image) => {
    const { height, mimeType, sourceUrl, width } = image;
    const transform = options.service.transform;
    if (
      sourceUrl === undefined ||
      width === undefined ||
      height === undefined ||
      mimeType === "image/gif" ||
      typeof transform !== "function"
    )
      return undefined;
    let result = pending.get(sourceUrl);
    if (result === undefined) {
      result = compute(sourceUrl, { height, width }, transform.bind(options.service));
      pending.set(sourceUrl, result);
      result.catch(() => pending.delete(sourceUrl));
    }
    return (await result) ?? undefined;
  };
}

let sharedResolver:
  | { readonly resolver: PlaceholderResolver; readonly service: unknown }
  | undefined;

function sharedPlaceholderResolver(service: LaceImageService, imageConfig: unknown) {
  if (sharedResolver?.service !== service)
    sharedResolver = { resolver: createPlaceholderResolver({ imageConfig, service }), service };
  return sharedResolver.resolver;
}

/** The structural `getImage` of `astro:assets`. */
export type LaceGetImage = (options: {
  readonly format: "webp";
  readonly height: number;
  readonly src: string;
  readonly width: number;
}) => Promise<{ readonly src: string }>;

export interface PrepareLaceImageOptions {
  readonly getImage: LaceGetImage;
  readonly imageConfig: unknown;
  /** Overrides the shared per-process resolver, for tests. */
  readonly placeholder?: PlaceholderResolver;
  readonly service: LaceImageService;
}

/** The attributes `LaceImage.astro` renders on the image element. */
export interface PreparedLaceImage {
  readonly src: string;
  readonly srcset?: string;
  readonly style?: Readonly<Record<string, string>>;
}

/**
 * Produces the WebP variants and placeholder of a described image. Without a
 * build source or dimensions it returns the public URL unchanged.
 */
export async function prepareLaceImage(
  image: ImageDescription,
  options: PrepareLaceImageOptions,
): Promise<PreparedLaceImage> {
  const position = image.objectPosition;
  const positionStyle = position === undefined ? {} : { "object-position": position };
  const { height, sourceUrl, width } = image;
  if (sourceUrl === undefined || width === undefined || height === undefined) {
    return position === undefined ? { src: image.src } : { src: image.src, style: positionStyle };
  }
  const original = { height, width };
  const variants = await Promise.all(
    variantWidths(width).map(async (variantWidth) => {
      const result = await options.getImage({
        format: "webp",
        height: scaledHeight(variantWidth, original),
        src: sourceUrl,
        width: variantWidth,
      });
      return { url: result.src, width: variantWidth };
    }),
  );
  const resolver =
    options.placeholder ?? sharedPlaceholderResolver(options.service, options.imageConfig);
  const placeholder = await resolver(image);
  const style: Record<string, string> = { ...positionStyle };
  if (placeholder !== undefined) {
    style["background-image"] = `url("${placeholder}")`;
    style["background-position"] = position ?? "50% 50%";
    style["background-repeat"] = "no-repeat";
    style["background-size"] = "cover";
  }
  return {
    src: variants[0]?.url ?? image.src,
    srcset: variants.map((variant) => `${variant.url} ${variant.width}w`).join(", "),
    ...(Object.keys(style).length === 0 ? {} : { style }),
  };
}
