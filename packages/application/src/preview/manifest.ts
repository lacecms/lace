import { isPreviewArtifactPath } from "@lacecms/domain";
import { sha256Bytes } from "../shared/sha256.js";
import type { ByteStream } from "../ports/media.js";
import type { PreviewObject } from "../ports/preview.js";

export const PREVIEW_MANIFEST_BYTES = 1024 * 1024;
export const PREVIEW_FILE_BYTES = 32 * 1024 * 1024;
export const PREVIEW_PACKAGE_BYTES = 100 * 1024 * 1024;
export const PREVIEW_PACKAGE_FILES = 2000;

export interface PreviewPackageLimits {
  readonly manifestBytes: number;
  readonly perFileBytes: number;
  readonly totalBytes: number;
  readonly files: number;
}

export const defaultPreviewPackageLimits = Object.freeze({
  manifestBytes: PREVIEW_MANIFEST_BYTES,
  perFileBytes: PREVIEW_FILE_BYTES,
  totalBytes: PREVIEW_PACKAGE_BYTES,
  files: PREVIEW_PACKAGE_FILES,
});

const contentTypes: Readonly<Record<string, string>> = Object.freeze({
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  json: "application/json",
  wasm: "application/wasm",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  wav: "audio/wav",
  vtt: "text/vtt; charset=utf-8",
  pdf: "application/pdf",
});
const reservedNames =
  /^(?:node_modules|package(?:-lock)?\.json|(?:ts|js)config(?:\..*)?\.json|deno\.json|(?:astro|vite|lace)\.config\..*|lace\.site\.json|(?:credential|secret|environment|input)[s]?\.json)$/iu;
const sha256 = /^[0-9a-f]{64}(?![\s\S])/u;
const generationId = /^[A-Za-z0-9_-]{1,128}(?![\s\S])/u;

export interface PreviewPackageFile extends PreviewObject {
  readonly path: string;
  readonly contentType: string;
}

export interface PreviewPackageManifest {
  readonly schemaVersion: 1;
  readonly html: string;
  readonly files: readonly PreviewPackageFile[];
}

export function previewGenerationKey(id: string): string {
  if (!generationId.test(id)) throw new TypeError("Invalid preview generation identifier.");
  return `preview/${id}/`;
}

export function previewArtifactContentType(path: string): string | undefined {
  if (!isPreviewArtifactPath(path) || path.split("/").some((part) => reservedNames.test(part)))
    return undefined;
  const extension = /\.([a-z0-9]+)$/iu.exec(path)?.[1]?.toLowerCase();
  return extension && Object.hasOwn(contentTypes, extension) ? contentTypes[extension] : undefined;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function parsePreviewManifest(
  value: unknown,
  limits: PreviewPackageLimits = defaultPreviewPackageLimits,
): PreviewPackageManifest | null {
  const manifest = record(value);
  if (
    manifest === null ||
    Object.keys(manifest).length !== 3 ||
    manifest.schemaVersion !== 1 ||
    typeof manifest.html !== "string" ||
    !Array.isArray(manifest.files) ||
    manifest.files.length < 1 ||
    manifest.files.length > limits.files
  )
    return null;
  const paths = new Set<string>();
  const byDigest = new Map<string, number>();
  const files: PreviewPackageFile[] = [];
  let total = 0;
  let html = 0;
  for (const value of manifest.files as unknown[]) {
    const file = record(value);
    if (
      file === null ||
      Object.keys(file).length !== 4 ||
      typeof file.path !== "string" ||
      typeof file.sha256 !== "string" ||
      !sha256.test(file.sha256) ||
      typeof file.bytes !== "number" ||
      !Number.isSafeInteger(file.bytes) ||
      file.bytes < 0 ||
      file.bytes > limits.perFileBytes
    )
      return null;
    const { path, bytes, sha256: digest } = file;
    const contentType = previewArtifactContentType(path);
    if (contentType === undefined || file.contentType !== contentType || paths.has(path))
      return null;
    if (contentType.startsWith("text/html")) {
      if (path !== manifest.html || bytes === 0) return null;
      html++;
    }
    const priorSize = byDigest.get(digest);
    if (priorSize !== undefined && priorSize !== bytes) return null;
    byDigest.set(digest, bytes);
    paths.add(path);
    total += bytes;
    if (total > limits.totalBytes) return null;
    files.push({ path, bytes, sha256: digest, contentType });
  }
  return html === 1 ? { schemaVersion: 1, html: manifest.html, files } : null;
}

// TextEncoder and TextDecoder exist in all supported runtimes, but not in the portable lib.
const utf8 = globalThis as unknown as {
  readonly TextEncoder: new () => { encode(text: string): Uint8Array };
  readonly TextDecoder: new (
    label: string,
    options: { fatal: true },
  ) => {
    decode(bytes: Uint8Array): string;
  };
};

export function encodePreviewJson(value: unknown): Uint8Array {
  return new utf8.TextEncoder().encode(JSON.stringify(value));
}

export async function describePreviewBytes(body: Uint8Array): Promise<PreviewObject> {
  return { bytes: body.byteLength, sha256: await sha256Bytes(body) };
}

export async function readPreviewManifest(
  stream: ByteStream,
  bytes: number,
  limit: number,
  expectedSha256?: string,
  limits: PreviewPackageLimits = defaultPreviewPackageLimits,
): Promise<PreviewPackageManifest | null> {
  if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > limit) return null;
  const buffer = new Uint8Array(bytes);
  let size = 0;
  for await (const chunk of stream) {
    if (size + chunk.byteLength > bytes) return null;
    buffer.set(chunk, size);
    size += chunk.byteLength;
  }
  if (size !== bytes || (expectedSha256 && (await sha256Bytes(buffer)) !== expectedSha256))
    return null;
  try {
    const decoded: unknown = JSON.parse(
      new utf8.TextDecoder("utf-8", { fatal: true }).decode(buffer),
    );
    return parsePreviewManifest(decoded, limits);
  } catch {
    return null;
  }
}
