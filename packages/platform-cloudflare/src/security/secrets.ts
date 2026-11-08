import { opaqueTokenSecret, type OpaqueTokenSecret } from "@lacecms/application";

export const encoder = new TextEncoder();

export function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

/** SHA-256 hex digest under which tokens are stored and compared. */
export async function digest(value: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const value of bytes) binary += String.fromCharCode(value);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

export function randomHex(length: number): string {
  return hex(crypto.getRandomValues(new Uint8Array(length)).buffer);
}

/** A fresh 256-bit opaque token, base64url encoded. */
export function tokenSecret(): OpaqueTokenSecret {
  return opaqueTokenSecret(base64Url(crypto.getRandomValues(new Uint8Array(32))));
}

/** Compares equal-length digests without an early exit on the first differing byte. */
export function constantTimeEqual(left: string, right: string): boolean {
  let difference = left.length ^ right.length;
  for (let index = 0; index < left.length; index += 1)
    difference |= left.charCodeAt(index) ^ (right.charCodeAt(index % right.length) || 0);
  return difference === 0;
}
