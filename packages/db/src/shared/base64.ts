declare function atob(data: string): string;
declare function btoa(data: string): string;
declare const TextDecoder: new () => { decode(input: Uint8Array): string };
declare const TextEncoder: new () => { encode(input: string): Uint8Array };
/** Base64url without padding, byte-identical to Node's `Buffer` `base64url` encoding. */
export function encodeBase64Url(text: string): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

export function decodeBase64Url(value: string): string {
  const base64 = value.replace(/-/gu, "+").replace(/_/gu, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return new TextDecoder().decode(
    Uint8Array.from(binary, (character: string) => character.charCodeAt(0)),
  );
}
