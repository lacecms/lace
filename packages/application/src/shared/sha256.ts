/** WebCrypto exists in every supported runtime and stays out of the portable lib types. */
const webCrypto = globalThis as unknown as {
  readonly crypto: {
    readonly subtle: { digest(algorithm: "SHA-256", data: Uint8Array): Promise<ArrayBuffer> };
  };
};

export async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await webCrypto.crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (value) => value.toString(16).padStart(2, "0")).join("");
}
