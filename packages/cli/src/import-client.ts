import { errorEnvelopeSchema } from "@lacecms/contracts";
import * as v from "valibot";
import { ImportError } from "./import-format.js";

export const MAX_RETRY_WAIT_SECONDS = 300;
export const MAX_RETRY_WAITS = 10;
const DEFAULT_RETRY_WAIT_SECONDS = 5;

function usageError(message: string): never {
  throw new ImportError("IMPORT_USAGE", message);
}

function loopback(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]"
  );
}

/**
 * Accepts an API origin: HTTPS, or HTTP only for loopback hosts, with no
 * credentials, path, query or fragment. The value is never echoed.
 */
export function parseApiOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    usageError("The API URL must be an absolute URL such as https://cms.example.com.");
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback(url.hostname)))
    usageError("The API URL must use https (http is allowed only for localhost).");
  if (url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "")
    usageError("The API URL must not contain credentials, a query or a fragment.");
  if (url.pathname !== "/" && url.pathname !== "")
    usageError("The API URL must be the API origin without a path.");
  return url.origin;
}

/** Seconds from `Retry-After` (delta seconds or an HTTP date), clamped to 1–300. */
export function retryAfterSeconds(header: string | null, now: number): number {
  let seconds = DEFAULT_RETRY_WAIT_SECONDS;
  if (header !== null && /^\d+$/u.test(header.trim())) seconds = Number(header.trim());
  else if (header !== null && !Number.isNaN(Date.parse(header)))
    seconds = Math.ceil((Date.parse(header) - now) / 1000);
  return Math.min(MAX_RETRY_WAIT_SECONDS, Math.max(1, seconds));
}

export interface ImportClientOptions {
  readonly origin: string;
  readonly token: string;
  readonly fetch?: typeof fetch;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  readonly now?: () => number;
  readonly onWait?: (seconds: number, what: string) => void;
}

export interface ImportRequest<Schema extends v.GenericSchema | undefined> {
  readonly method: "GET" | "POST" | "PUT" | "PATCH";
  readonly path: string;
  /** Human description used in errors and waits, never containing values. */
  readonly what: string;
  readonly query?: Readonly<Record<string, string>>;
  readonly json?: unknown;
  readonly form?: FormData;
  readonly headers?: Readonly<Record<string, string>>;
  readonly schema: Schema;
  readonly expect: readonly number[];
  /** Return an undefined body for 404 instead of failing. */
  readonly allowNotFound?: boolean;
}

export interface ImportResponse<Value> {
  readonly status: number;
  readonly body: Value;
  readonly headers: Headers;
}

/** Sends one admin REST request with the import token; never retries except on 429. */
export class ImportClient {
  readonly #options: ImportClientOptions;

  public constructor(options: ImportClientOptions) {
    this.#options = options;
  }

  public get origin(): string {
    return this.#options.origin;
  }

  public async request<Schema extends v.GenericSchema | undefined>(
    request: ImportRequest<Schema>,
  ): Promise<ImportResponse<Schema extends v.GenericSchema ? v.InferOutput<Schema> : undefined>> {
    const fetcher = this.#options.fetch ?? fetch;
    const sleep =
      this.#options.sleep ??
      ((milliseconds: number) => new Promise<void>((done) => setTimeout(done, milliseconds)));
    const now = this.#options.now ?? Date.now;
    const url = new URL(request.path, this.#options.origin);
    for (const [name, value] of Object.entries(request.query ?? {}))
      url.searchParams.set(name, value);
    for (let waits = 0; ; waits += 1) {
      let response: Response;
      try {
        response = await fetcher(url, {
          method: request.method,
          headers: {
            accept: "application/json",
            authorization: `Bearer ${this.#options.token}`,
            ...(request.json === undefined ? {} : { "content-type": "application/json" }),
            ...request.headers,
          },
          ...(request.json === undefined
            ? request.form === undefined
              ? {}
              : { body: request.form }
            : { body: JSON.stringify(request.json) }),
          redirect: "error",
        });
      } catch {
        throw new ImportError(
          "IMPORT_FAILED",
          `${request.what} failed: the API could not be reached.`,
        );
      }
      if (response.status === 429) {
        if (waits >= MAX_RETRY_WAITS)
          throw new ImportError(
            "IMPORT_RATE_LIMITED",
            `${request.what} is still rate limited after ${MAX_RETRY_WAITS} waits.`,
          );
        const seconds = retryAfterSeconds(response.headers.get("retry-after"), now());
        await response.body?.cancel();
        this.#options.onWait?.(seconds, request.what);
        await sleep(seconds * 1000);
        continue;
      }
      return this.#result(request, response);
    }
  }

  async #result<Schema extends v.GenericSchema | undefined>(
    request: ImportRequest<Schema>,
    response: Response,
  ): Promise<ImportResponse<Schema extends v.GenericSchema ? v.InferOutput<Schema> : undefined>> {
    let body: unknown;
    try {
      const text = await response.text();
      body = text.length === 0 ? undefined : (JSON.parse(text) as unknown);
    } catch {
      body = undefined;
    }
    if (request.allowNotFound === true && response.status === 404)
      return { status: 404, body: undefined as never, headers: response.headers };
    if (!request.expect.includes(response.status)) {
      const envelope = v.safeParse(errorEnvelopeSchema, body);
      const code = envelope.success ? ` ${envelope.output.error.code}` : "";
      if (response.status === 401 || response.status === 403)
        throw new ImportError(
          "IMPORT_UNAUTHORIZED",
          `${request.what} was denied (HTTP ${response.status}${code}). Check that LACE_IMPORT_TOKEN is a current, unrevoked import token with the needed permissions.`,
        );
      throw new ImportError(
        "IMPORT_FAILED",
        `${request.what} failed (HTTP ${response.status}${code}).`,
      );
    }
    if (request.schema === undefined)
      return { status: response.status, body: undefined as never, headers: response.headers };
    const parsed = v.safeParse(request.schema, body);
    if (!parsed.success)
      throw new ImportError(
        "IMPORT_FAILED",
        `${request.what} returned an unexpected response; use @lacecms/cli from the same release as the server.`,
      );
    return { status: response.status, body: parsed.output as never, headers: response.headers };
  }
}
