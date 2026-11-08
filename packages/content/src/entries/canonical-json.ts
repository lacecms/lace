import type { JsonValue, JsonObject } from "../shared/json.js";
import { InvariantError } from "../shared/errors.js";

/** Returns canonical JSON with recursively sorted object keys. */
export function canonicalizeJson(value: JsonValue): string {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalizeJson).join(",")}]`;
  }
  const object = value as JsonObject;
  const entries = Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalizeJson(object[key]!)}`);
  return `{${entries.join(",")}}`;
}

interface TextEncoderLike {
  encode(input: string): Uint8Array;
}

interface TextEncoderConstructorLike {
  new (): TextEncoderLike;
}

/** Gets the UTF-8 byte count of portable JSON through canonical serialization. */
export function canonicalJsonByteLength(value: JsonValue): number {
  const TextEncoderConstructor = (
    globalThis as unknown as { readonly TextEncoder?: TextEncoderConstructorLike }
  ).TextEncoder;
  if (TextEncoderConstructor === undefined) {
    throw new InvariantError("TextEncoder is required for canonical JSON byte measurement.");
  }
  return new TextEncoderConstructor().encode(canonicalizeJson(value)).byteLength;
}

/** Minimal portable shape used by the SHA-256 helper. */
export interface WebCryptoLike {
  readonly subtle: {
    digest(algorithm: "SHA-256", data: Uint8Array): Promise<ArrayBuffer>;
  };
}

function getWebCrypto(): WebCryptoLike {
  const crypto = (globalThis as unknown as { readonly crypto?: WebCryptoLike }).crypto;
  if (crypto === undefined) {
    throw new InvariantError("Web Crypto is required for canonical JSON hashing.");
  }
  return crypto;
}

/** Hashes canonical JSON UTF-8 bytes with Web Crypto SHA-256 as lowercase hexadecimal. */
export async function sha256CanonicalJson(
  value: JsonValue,
  webCrypto: WebCryptoLike = getWebCrypto(),
): Promise<string> {
  const TextEncoderConstructor = (
    globalThis as unknown as { readonly TextEncoder?: TextEncoderConstructorLike }
  ).TextEncoder;
  if (TextEncoderConstructor === undefined) {
    throw new InvariantError("TextEncoder is required for canonical JSON hashing.");
  }
  const digest = new Uint8Array(
    await webCrypto.subtle.digest(
      "SHA-256",
      new TextEncoderConstructor().encode(canonicalizeJson(value)),
    ),
  );
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
