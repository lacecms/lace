import { defaultPreviewPackageLimits, parsePreviewManifest } from "@lacecms/domain";
import type { PreviewPackageLimits, PreviewPackageManifest } from "@lacecms/domain";
import { sha256Bytes } from "../shared/sha256.js";
import type { ByteStream } from "../ports/media.js";
import type { PreviewObject } from "../ports/preview.js";

export {
  PREVIEW_MANIFEST_BYTES,
  PREVIEW_FILE_BYTES,
  PREVIEW_PACKAGE_BYTES,
  PREVIEW_PACKAGE_FILES,
  defaultPreviewPackageLimits,
  parsePreviewManifest,
  previewArtifactContentType,
} from "@lacecms/domain";
export type {
  PreviewPackageFile,
  PreviewPackageLimits,
  PreviewPackageManifest,
} from "@lacecms/domain";

const generationId = /^[A-Za-z0-9_-]{1,128}(?![\s\S])/u;

export function previewGenerationKey(id: string): string {
  if (!generationId.test(id)) throw new TypeError("Invalid preview generation identifier.");
  return `preview/${id}/`;
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
