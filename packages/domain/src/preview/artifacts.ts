import { isPreviewArtifactPath } from "./state.js";

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

export interface PreviewPackageFile {
  readonly bytes: number;
  readonly sha256: string;
  readonly path: string;
  readonly contentType: string;
}

export interface PreviewPackageManifest {
  readonly schemaVersion: 1;
  readonly html: string;
  readonly files: readonly PreviewPackageFile[];
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
