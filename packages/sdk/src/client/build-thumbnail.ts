import {
  LaceContractError,
  LaceHttpError,
  LaceTimeoutError,
  LaceTransportError,
} from "./errors.js";

const maxBytes = 96 * 1024;
const defaultTimeoutMs = 5_000;

export interface BuildThumbnailOptions {
  readonly etag?: string;
  readonly signal?: AbortSignal;
}

export type BuildThumbnailResult =
  | { readonly changed: false; readonly etag: string }
  | { readonly changed: true; readonly etag: string; readonly bytes: Uint8Array };

/** Lazy server-side media access, with a cache identity scoped to its API base and media ID. */
export interface BuildThumbnailReader {
  readonly cacheKey: string;
  read(options?: BuildThumbnailOptions): Promise<BuildThumbnailResult>;
}

function strongValidator(value: string | null): value is string {
  return value !== null && /^"[\x21\x23-\x7e\u0080-\u00ff]*"$/u.test(value);
}

async function readBody(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): Promise<Uint8Array> {
  const reader = body.getReader();
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  const next = () =>
    reader.read().catch(() => {
      throw new LaceTransportError("The build thumbnail body could not be read.");
    });
  signal.addEventListener("abort", cancel, { once: true });
  const buffer = new Uint8Array(maxBytes);
  let size = 0;
  try {
    let chunk = await next();
    while (!chunk.done) {
      if (chunk.value.byteLength > maxBytes - size)
        throw new LaceContractError("The build thumbnail exceeds 96 KiB.");
      buffer.set(chunk.value, size);
      size += chunk.value.byteLength;
      chunk = await next();
    }
    if (size === 0) throw new LaceContractError("The build thumbnail is empty.");
    return buffer.slice(0, size);
  } finally {
    signal.removeEventListener("abort", cancel);
    cancel();
    reader.releaseLock();
  }
}

async function readResponse(
  response: Response,
  prior: string | undefined,
  signal: AbortSignal,
): Promise<BuildThumbnailResult> {
  try {
    signal.throwIfAborted();
    if (
      response.redirected ||
      (response.status >= 300 && response.status < 400 && response.status !== 304)
    )
      throw new LaceContractError("The build thumbnail request was redirected.");
    const etag = response.headers.get("etag");
    if (response.status === 304) {
      if (prior === undefined || etag !== prior || response.body !== null)
        throw new LaceContractError(
          "The build thumbnail returned an invalid conditional response.",
        );
      return { changed: false, etag };
    }
    if (!response.ok)
      throw new LaceHttpError(response.status, {
        code: "MEDIA_THUMBNAIL_UNAVAILABLE",
        message: `The build thumbnail is unavailable (HTTP ${response.status}).`,
      });
    if (
      response.status !== 200 ||
      response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "image/webp"
    )
      throw new LaceContractError("The build thumbnail response is not WebP.");
    if (!strongValidator(etag))
      throw new LaceContractError("The build thumbnail has an invalid ETag.");
    const length = response.headers.get("content-length");
    if (length !== null && /^\d+$/u.test(length) && Number(length) > maxBytes)
      throw new LaceContractError("The build thumbnail exceeds 96 KiB.");
    if (response.body === null) throw new LaceContractError("The build thumbnail is empty.");
    return { changed: true, etag, bytes: await readBody(response.body, signal) };
  } finally {
    if (!response.bodyUsed) void response.body?.cancel().catch(() => {});
  }
}

export async function requestBuildThumbnail(
  fetchResponse: (init: RequestInit) => Promise<Response>,
  token: string | undefined,
  options: BuildThumbnailOptions,
  timeoutMs = defaultTimeoutMs,
): Promise<BuildThumbnailResult> {
  const { etag } = options;
  if (etag !== undefined && !strongValidator(etag))
    throw new LaceContractError("The prior build thumbnail ETag must be strong.");
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), timeoutMs);
  const signal =
    options.signal === undefined
      ? timeout.signal
      : AbortSignal.any([timeout.signal, options.signal]);
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () =>
      reject(
        timeout.signal.aborted
          ? new LaceTimeoutError(timeoutMs)
          : new LaceTransportError("The build thumbnail request was aborted."),
      );
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  });
  const read = async () => {
    let response: Response;
    try {
      signal.throwIfAborted();
      const headers = new Headers({ accept: "image/webp" });
      if (token !== undefined) headers.set("authorization", `Bearer ${token}`);
      if (etag !== undefined) headers.set("if-none-match", etag);
      response = await fetchResponse({ headers, signal, redirect: "error" });
    } catch {
      throw new LaceTransportError(
        "The build thumbnail request failed before receiving a response.",
      );
    }
    return readResponse(response, etag, signal);
  };
  try {
    return await Promise.race([aborted, read()]);
  } catch (error) {
    if (signal.aborted) {
      if (timeout.signal.aborted) throw new LaceTimeoutError(timeoutMs);
      throw new LaceTransportError("The build thumbnail request was aborted.");
    }
    if (
      error instanceof LaceContractError ||
      error instanceof LaceHttpError ||
      error instanceof LaceTransportError
    )
      throw error;
    throw new LaceTransportError("The build thumbnail response could not be read.");
  } finally {
    clearTimeout(timer);
    if (onAbort !== undefined) signal.removeEventListener("abort", onAbort);
  }
}
