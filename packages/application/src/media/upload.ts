import type { ByteStream, MediaMimeType } from "../ports/media.js";
import { MAX_MEDIA_BYTES } from "./limits.js";
import { failure } from "./helpers.js";

function isPrefix(bytes: Uint8Array, prefix: readonly number[]): boolean {
  return prefix.every((value, index) => bytes[index] === value);
}

/** Detects format only; ImageInspector validates container structure and dimensions. */
export function detectMediaMimeType(bytes: Uint8Array): MediaMimeType {
  if (bytes.byteLength === 0) failure("Media upload must not be empty.");
  if (isPrefix(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (isPrefix(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  // GIF87a or GIF89a.
  if (
    isPrefix(bytes, [0x47, 0x49, 0x46, 0x38]) &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return "image/gif";
  }
  if (
    bytes.byteLength >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  if (
    bytes.byteLength >= 16 &&
    String.fromCharCode(...bytes.slice(4, 8)) === "ftyp" &&
    ["avif", "avis"].includes(String.fromCharCode(...bytes.slice(8, 12)))
  ) {
    return "image/avif";
  }
  failure("Media upload is not an allowed image format.");
}

export function sanitizeMediaFilename(value: string): string {
  const withoutUnsafeCharacters = [...value.normalize("NFKC")]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code <= 0x1f ||
        (code >= 0x7f && code <= 0x9f) ||
        character === "/" ||
        character === "\\"
        ? " "
        : character;
    })
    .join("");
  const normalized = withoutUnsafeCharacters.replace(/\s+/gu, " ").trim().slice(0, 255);
  return normalized.length === 0 ? "upload" : normalized;
}

export async function collectMediaBytes(body: ByteStream): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of body) {
    if (!(chunk instanceof Uint8Array)) failure("Media stream yielded invalid binary data.");
    size += chunk.byteLength;
    if (size > MAX_MEDIA_BYTES) failure("Media upload exceeds the 10 MiB limit.");
    chunks.push(chunk.slice());
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export function streamBytes(bytes: Uint8Array): ByteStream {
  return {
    async *[Symbol.asyncIterator](): AsyncGenerator<Uint8Array> {
      yield bytes.slice();
    },
  };
}

/** WebCrypto exists in every supported runtime but not in this package's portable lib types. */
const webCrypto = globalThis as unknown as {
  readonly crypto: {
    readonly subtle: { digest(algorithm: "SHA-256", data: Uint8Array): Promise<ArrayBuffer> };
  };
};

/** Lowercase-hex SHA-256 of the exact bytes that object storage receives. */
export async function mediaSha256(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await webCrypto.crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (value) => value.toString(16).padStart(2, "0")).join("");
}
