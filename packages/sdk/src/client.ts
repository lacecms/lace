import {
  buildExportSchema,
  entityTagSchema,
  errorEnvelopeSchema,
  identifierSchemaPublic,
  opaqueCursorSchema,
  publicContentEntrySchema,
  publicContentListSchema,
} from "@lacecms/contracts";
import type {
  BuildExportDto,
  EntityTag,
  ErrorEnvelope,
  PublicContentEntryDto,
  PublicContentListDto,
  LaceErrorCode,
} from "@lacecms/contracts";
import * as v from "valibot";

export const packageName = "@lacecms/sdk";
export const userAgent = "@lacecms/sdk/0.0.0";

export type LaceFetch = (input: URL, init: RequestInit) => Promise<Response>;

export interface LaceClientOptions {
  readonly baseUrl: string;
  readonly fetch?: LaceFetch;
  readonly timeoutMs?: number;
  readonly token?: string;
}

export interface LaceRequestOptions {
  readonly signal?: AbortSignal;
}

export interface CollectionOptions extends LaceRequestOptions {
  readonly after?: string;
  readonly limit?: number;
}

export interface AllCollectionOptions extends LaceRequestOptions {
  readonly limit?: number;
}

export interface BuildExportOptions extends LaceRequestOptions {
  readonly etag?: EntityTag;
}

export type BuildExportResult =
  | { readonly changed: false; readonly etag: EntityTag }
  | { readonly changed: true; readonly etag: EntityTag; readonly export: BuildExportDto };

export class LaceSdkError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "LaceSdkError";
  }
}

export class LaceTransportError extends LaceSdkError {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "LaceTransportError";
  }
}

export class LaceTimeoutError extends LaceTransportError {
  public constructor(timeoutMs: number) {
    super(`The Lace request timed out after ${timeoutMs}ms.`);
    this.name = "LaceTimeoutError";
  }
}

export class LaceHttpError extends LaceSdkError {
  public readonly code: LaceErrorCode;
  public readonly details: ErrorEnvelope["error"]["details"];
  public readonly status: number;

  public constructor(status: number, error: ErrorEnvelope["error"]) {
    super(error.message);
    this.name = "LaceHttpError";
    this.code = error.code;
    this.details = error.details;
    this.status = status;
  }
}

export class LaceContractError extends LaceSdkError {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "LaceContractError";
  }
}

export interface LaceClient {
  getAllCollection(
    modelKey: string,
    options?: AllCollectionOptions,
  ): Promise<PublicContentEntryDto[]>;
  getBuildExport(options?: BuildExportOptions): Promise<BuildExportResult>;
  getByPath(path: string, options?: LaceRequestOptions): Promise<PublicContentEntryDto>;
  getCollection(modelKey: string, options?: CollectionOptions): Promise<PublicContentListDto>;
  getCollectionBySlug(
    modelKey: string,
    slug: string,
    options?: LaceRequestOptions,
  ): Promise<PublicContentEntryDto>;
  getPage(modelKey: string, options?: LaceRequestOptions): Promise<PublicContentEntryDto>;
  getPublicMediaUrl(mediaId: string): string;
}

interface RequestContext {
  readonly buildExport?: boolean;
  readonly etag?: EntityTag;
  readonly signal?: AbortSignal;
}

interface CombinedSignal {
  readonly cleanup: () => void;
  readonly signal?: AbortSignal;
}

function assertIdentifier(value: string, name: string): string {
  const parsed = v.safeParse(identifierSchemaPublic, value);
  if (!parsed.success)
    throw new TypeError(`${name} must be a non-empty identifier up to 255 characters.`);
  return parsed.output;
}

function assertCursor(value: string): string {
  const parsed = v.safeParse(opaqueCursorSchema, value);
  if (!parsed.success) throw new TypeError("after must be an opaque non-empty cursor.");
  return parsed.output;
}

function assertEntityTag(value: string): EntityTag {
  const parsed = v.safeParse(entityTagSchema, value);
  if (!parsed.success) throw new TypeError("etag must be a supported quoted entity tag.");
  return parsed.output;
}

function assertLimit(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 100) {
    throw new TypeError("limit must be an integer between 1 and 100.");
  }
  return value;
}

function normalizeBaseUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch (cause) {
    throw new TypeError("baseUrl must be an absolute HTTP(S) URL.", { cause });
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError("baseUrl must use the HTTP or HTTPS protocol.");
  }
  if (url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "") {
    throw new TypeError("baseUrl must not contain credentials, a query string, or a fragment.");
  }
  url.pathname = `${url.pathname.replace(/\/+$/u, "")}/`;
  return url;
}

function resolveFetch(value: LaceFetch | undefined): LaceFetch {
  if (value !== undefined) return value;
  if (typeof globalThis.fetch !== "function") {
    throw new TypeError("No fetch implementation is available. Provide options.fetch.");
  }
  return globalThis.fetch.bind(globalThis) as LaceFetch;
}

function combineSignal(
  signal: AbortSignal | undefined,
  timeoutMs: number | undefined,
): CombinedSignal {
  if (timeoutMs === undefined) {
    return signal === undefined ? { cleanup: () => {} } : { cleanup: () => {}, signal };
  }

  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(signal?.reason);
  if (signal?.aborted) abortFromCaller();
  else signal?.addEventListener("abort", abortFromCaller, { once: true });

  const timeout = setTimeout(() => controller.abort(new LaceTimeoutError(timeoutMs)), timeoutMs);
  return {
    cleanup: () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abortFromCaller);
    },
    signal: controller.signal,
  };
}

function jsonHeaders(): Headers {
  const headers = new Headers({ accept: "application/json" });
  try {
    headers.set("user-agent", userAgent);
  } catch {
    // Some browser-like runtimes forbid this header; builds still use the client safely.
  }
  return headers;
}

function publicUrl(baseUrl: URL, segments: readonly string[]): URL {
  const path = segments.map((segment) => encodeURIComponent(segment)).join("/");
  return new URL(`api/v1/public/${path}`, baseUrl);
}

function parseResponseEtag(response: Response): EntityTag {
  const value = response.headers.get("etag");
  if (value === null) throw new LaceContractError("The build-export response is missing its ETag.");
  try {
    return assertEntityTag(value);
  } catch (cause) {
    throw new LaceContractError("The build-export response has an invalid ETag.", { cause });
  }
}

async function parseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (cause) {
    throw new LaceContractError("The Lace response did not contain valid JSON.", { cause });
  }
}

function parseSchema<Schema extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>>(
  schema: Schema,
  value: unknown,
): v.InferOutput<Schema> {
  const parsed = v.safeParse(schema, value);
  if (!parsed.success)
    throw new LaceContractError("The Lace response violated its public contract.");
  return parsed.output;
}

async function parseFailure(response: Response): Promise<never> {
  const value = await parseJson(response);
  const envelope = v.safeParse(errorEnvelopeSchema, value);
  if (!envelope.success) {
    throw new LaceContractError("The failed Lace response violated the error contract.");
  }
  throw new LaceHttpError(response.status, envelope.output.error);
}

export function createLaceClient(options: LaceClientOptions): LaceClient {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const fetchImplementation = resolveFetch(options.fetch);
  const timeoutMs = options.timeoutMs;
  if (timeoutMs !== undefined && (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1)) {
    throw new TypeError("timeoutMs must be a positive safe integer.");
  }
  const token = options.token;
  if (token !== undefined && token.length === 0) throw new TypeError("token must not be empty.");

  async function send(url: URL, context: RequestContext = {}): Promise<Response> {
    const headers = jsonHeaders();
    if (context.buildExport && token !== undefined) headers.set("authorization", `Bearer ${token}`);
    if (context.etag !== undefined) headers.set("if-none-match", context.etag);
    const combined = combineSignal(context.signal, timeoutMs);
    try {
      return await fetchImplementation(url, {
        headers,
        ...(combined.signal === undefined ? {} : { signal: combined.signal }),
      });
    } catch (cause) {
      if (combined.signal?.aborted) {
        const reason = combined.signal.reason;
        if (reason instanceof LaceTimeoutError) throw reason;
        throw new LaceTransportError("The Lace request was aborted.", { cause: reason ?? cause });
      }
      throw new LaceTransportError("The Lace request failed before receiving a response.", {
        cause,
      });
    } finally {
      combined.cleanup();
    }
  }

  async function read<Schema extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>>(
    url: URL,
    schema: Schema,
    context?: RequestContext,
  ): Promise<v.InferOutput<Schema>> {
    const response = await send(url, context);
    if (!response.ok) return parseFailure(response);
    return parseSchema(schema, await parseJson(response));
  }

  function collectionUrl(modelKey: string, requestOptions: CollectionOptions = {}): URL {
    const url = publicUrl(baseUrl, ["collections", assertIdentifier(modelKey, "modelKey")]);
    if (requestOptions.after !== undefined)
      url.searchParams.set("after", assertCursor(requestOptions.after));
    if (requestOptions.limit !== undefined) {
      url.searchParams.set("limit", String(assertLimit(requestOptions.limit)));
    }
    return url;
  }

  return {
    async getAllCollection(modelKey, requestOptions = {}) {
      const items: PublicContentEntryDto[] = [];
      let after: string | undefined;
      do {
        const page = await read(
          collectionUrl(modelKey, {
            ...(after === undefined ? {} : { after }),
            ...(requestOptions.limit === undefined ? {} : { limit: requestOptions.limit }),
          }),
          publicContentListSchema,
          requestOptions,
        );
        items.push(...page.items);
        after = page.nextCursor;
      } while (after !== undefined);
      return items;
    },

    async getBuildExport(requestOptions = {}) {
      const etag =
        requestOptions.etag === undefined ? undefined : assertEntityTag(requestOptions.etag);
      const response = await send(publicUrl(baseUrl, ["build-export"]), {
        buildExport: true,
        ...(etag === undefined ? {} : { etag }),
        ...(requestOptions.signal === undefined ? {} : { signal: requestOptions.signal }),
      });
      if (response.status !== 304 && !response.ok) return parseFailure(response);
      const responseEtag = parseResponseEtag(response);
      if (response.status === 304) return { changed: false, etag: responseEtag };
      return {
        changed: true,
        etag: responseEtag,
        export: parseSchema(buildExportSchema, await parseJson(response)),
      };
    },

    getByPath(path, requestOptions = {}) {
      if (!path.startsWith("/")) throw new TypeError("path must start with a slash.");
      const url = publicUrl(baseUrl, ["content", "by-path"]);
      url.searchParams.set("path", path);
      return read(url, publicContentEntrySchema, requestOptions);
    },

    getCollection(modelKey, requestOptions = {}) {
      return read(collectionUrl(modelKey, requestOptions), publicContentListSchema, requestOptions);
    },

    getCollectionBySlug(modelKey, slug, requestOptions = {}) {
      return read(
        publicUrl(baseUrl, [
          "collections",
          assertIdentifier(modelKey, "modelKey"),
          assertIdentifier(slug, "slug"),
        ]),
        publicContentEntrySchema,
        requestOptions,
      );
    },

    getPage(modelKey, requestOptions = {}) {
      return read(
        publicUrl(baseUrl, ["pages", assertIdentifier(modelKey, "modelKey")]),
        publicContentEntrySchema,
        requestOptions,
      );
    },

    getPublicMediaUrl(mediaId) {
      return publicUrl(baseUrl, ["media", assertIdentifier(mediaId, "mediaId")]).toString();
    },
  };
}
