import {
  BUILD_EXPORT_FORMAT_VERSION,
  entityTagSchema,
  versionFromEntityTag,
  identifierSchemaPublic,
  opaqueCursorSchema,
  tolerantPublicSchemas,
} from "@lacecms/contracts";
import type {
  BuildExportContinuationPageDto,
  BuildExportDto,
  BuildExportFirstPageDto,
  EntityTag,
  PublicContentEntryDto,
  PublicContentListDto,
  PublicEntryDto,
  PublicGlobalContentDto,
  PublicMediaDictionaryDto,
  PublicMediaDto,
  ReportedLaceErrorCode,
  TolerantErrorEnvelope,
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
  /** Prior entity tag, sent as `If-None-Match` on the first page only. */
  readonly etag?: EntityTag;
  /**
   * Called with the first page of each traversal before any continuation page
   * is requested; a rejection ends the traversal without further requests.
   */
  readonly onFirstPage?: (page: BuildExportFirstPageDto) => void | Promise<void>;
  /** Entries per page from 1 to 100, sent on every page request. */
  readonly pageSize?: number;
  /**
   * Restarts from an unconditional first page when published content changes
   * during the traversal, at most two traversals in total. Defaults to `true`.
   */
  readonly restart?: boolean;
}

export interface BuildExportPageOptions extends LaceRequestOptions {
  /** `nextCursor` of the previous page; absent for the first page. */
  readonly after?: string;
  /** Prior entity tag for a conditional first-page read. */
  readonly etag?: EntityTag;
  readonly limit?: number;
}

/** One build-export page as delivered by the API. */
export type BuildExportPage = BuildExportFirstPageDto | BuildExportContinuationPageDto;

export type BuildExportPageResult =
  | { readonly changed: false; readonly etag: EntityTag }
  | { readonly changed: true; readonly etag: EntityTag; readonly page: BuildExportPage };

/** Every published item of a collection with the media all of them reference. */
export interface AllCollectionResult {
  readonly items: PublicEntryDto[];
  readonly media: PublicMediaDictionaryDto;
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
  /** A known Lace error code, or a code introduced by a newer API. */
  public readonly code: ReportedLaceErrorCode;
  public readonly details: TolerantErrorEnvelope["error"]["details"];
  public readonly status: number;

  public constructor(status: number, error: TolerantErrorEnvelope["error"]) {
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

/** The API sent a build export in a format newer than this SDK supports. */
export class LaceUnsupportedExportFormatError extends LaceContractError {
  public readonly received: number;
  public readonly supported: number;

  public constructor(received: number, supported: number) {
    super(
      `The Lace API sent build-export format ${received}, but this @lacecms/sdk supports format ${supported} at most. Upgrade @lacecms/sdk to a release compatible with the Lace API.`,
    );
    this.name = "LaceUnsupportedExportFormatError";
    this.received = received;
    this.supported = supported;
  }
}

export interface LaceClient {
  getAllCollection(modelKey: string, options?: AllCollectionOptions): Promise<AllCollectionResult>;
  /** Follows every export page and returns the assembled export. */
  getBuildExport(options?: BuildExportOptions): Promise<BuildExportResult>;
  /** Reads one tolerant-validated export page; a first page may be conditional. */
  getBuildExportPage(options?: BuildExportPageOptions): Promise<BuildExportPageResult>;
  getByPath(path: string, options?: LaceRequestOptions): Promise<PublicContentEntryDto>;
  getCollection(modelKey: string, options?: CollectionOptions): Promise<PublicContentListDto>;
  getCollectionBySlug(
    modelKey: string,
    slug: string,
    options?: LaceRequestOptions,
  ): Promise<PublicContentEntryDto>;
  /** Reads a published route-less global by model key. */
  getGlobal(modelKey: string, options?: LaceRequestOptions): Promise<PublicGlobalContentDto>;
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

function parseResponseEtag(response: Response, token?: string): EntityTag {
  const value = response.headers.get("etag");
  const guidance =
    'Expected "N" or W/"N" with a non-negative safe integer version. Upgrade the Lace API and SDK to compatible versions and check that the proxy preserves ETag headers.';
  if (value === null)
    throw new LaceContractError(`The build-export response is missing its ETag. ${guidance}`);
  try {
    return assertEntityTag(value);
  } catch (cause) {
    const redacted = token === undefined ? value : value.replaceAll(token, "[redacted]");
    const preview = JSON.stringify(redacted.slice(0, 80));
    throw new LaceContractError(
      `The build-export response has an invalid ETag: ${preview}${redacted.length > 80 ? " (truncated)" : ""}. ${guidance}`,
      { cause },
    );
  }
}

/** Orders strings by code point, which matches SQLite's byte order for UTF-8 paths. */
function compareCodePoints(left: string, right: string): number {
  const a = [...left];
  const b = [...right];
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const difference = a[index]!.codePointAt(0)! - b[index]!.codePointAt(0)!;
    if (difference !== 0) return difference;
  }
  return a.length - b.length;
}

function sameJson(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (typeof left !== "object" || typeof right !== "object" || left === null || right === null)
    return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) =>
        Object.hasOwn(right, key) &&
        sameJson((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]),
    )
  );
}

function isVersionChanged(error: unknown): boolean {
  return (
    error instanceof LaceHttpError &&
    error.status === 409 &&
    error.code === "BUILD_EXPORT_VERSION_CHANGED"
  );
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
  const envelope = v.safeParse(tolerantPublicSchemas.errorEnvelope, value);
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

  async function readBuildExportPage(
    requestOptions: BuildExportPageOptions,
  ): Promise<BuildExportPageResult> {
    const etag =
      requestOptions.etag === undefined ? undefined : assertEntityTag(requestOptions.etag);
    const url = publicUrl(baseUrl, ["build-export"]);
    if (requestOptions.after !== undefined) {
      if (etag !== undefined) throw new TypeError("etag applies to the first export page only.");
      url.searchParams.set("after", assertCursor(requestOptions.after));
    }
    if (requestOptions.limit !== undefined)
      url.searchParams.set("limit", String(assertLimit(requestOptions.limit)));
    const response = await send(url, {
      buildExport: true,
      ...(etag === undefined ? {} : { etag }),
      ...(requestOptions.signal === undefined ? {} : { signal: requestOptions.signal }),
    });
    if (response.status !== 304 && !response.ok) return parseFailure(response);
    const responseEtag = parseResponseEtag(response, token);
    const responseVersion = versionFromEntityTag(responseEtag);
    if (response.status === 304) {
      if (requestOptions.after !== undefined)
        throw new LaceContractError(
          "The Lace API answered a build-export continuation page with 304. Upgrade the Lace API and SDK to compatible versions and check the proxy conditional-response configuration.",
        );
      if (etag !== undefined && responseVersion !== versionFromEntityTag(etag))
        throw new LaceContractError(
          "The build-export 304 ETag does not match the requested version. Check the API and proxy conditional-response configuration.",
        );
      return { changed: false, etag: responseEtag };
    }
    const body = await parseJson(response);
    let page: BuildExportPage;
    if (requestOptions.after === undefined) {
      page = parseSchema(tolerantPublicSchemas.buildExportFirstPage, body);
    } else {
      // The tolerant schema would strip these keys; a continuation must not carry them.
      if (
        typeof body === "object" &&
        body !== null &&
        (Object.hasOwn(body, "globals") || Object.hasOwn(body, "seo"))
      )
        throw new LaceContractError(
          "A build-export continuation page carried first-page keys. Upgrade the Lace API and SDK to compatible versions.",
        );
      page = parseSchema(tolerantPublicSchemas.buildExportContinuationPage, body);
    }
    if (page.formatVersion > BUILD_EXPORT_FORMAT_VERSION)
      throw new LaceUnsupportedExportFormatError(page.formatVersion, BUILD_EXPORT_FORMAT_VERSION);
    if (responseVersion !== page.version)
      throw new LaceContractError(
        "The build-export ETag does not match the export version. Upgrade the Lace API and SDK to compatible versions and check the proxy configuration.",
      );
    return { changed: true, etag: responseEtag, page };
  }

  /** One complete traversal; a 409 from any page propagates to the caller. */
  async function traverseBuildExport(
    requestOptions: BuildExportOptions,
    etag: EntityTag | undefined,
  ): Promise<BuildExportResult> {
    const shared = {
      ...(requestOptions.pageSize === undefined ? {} : { limit: requestOptions.pageSize }),
      ...(requestOptions.signal === undefined ? {} : { signal: requestOptions.signal }),
    };
    const result = await readBuildExportPage({
      ...shared,
      ...(etag === undefined ? {} : { etag }),
    });
    if (!result.changed) return result;
    const first = result.page as BuildExportFirstPageDto;
    const violation = (detail: string) =>
      new LaceContractError(
        `The build-export pages are inconsistent: ${detail}. Upgrade the Lace API and SDK to compatible versions.`,
      );
    const entries: BuildExportFirstPageDto["entries"] = [];
    const media = new Map<string, PublicMediaDto>();
    // The highest path delivered so far; a continuation page starts strictly after it.
    let floor: string | undefined;
    const collect = (page: BuildExportPage) => {
      if (page.nextCursor !== undefined && page.entries.length === 0)
        throw violation("a page with a continuation cursor holds no entry");
      const previous = floor;
      for (const entry of page.entries) {
        if (previous !== undefined && compareCodePoints(entry.path, previous) <= 0)
          throw violation("entry paths do not continue after the previous page");
        if (floor === undefined || compareCodePoints(entry.path, floor) > 0) floor = entry.path;
        entries.push(entry);
      }
      for (const [id, item] of Object.entries(page.media)) {
        const known = media.get(id);
        if (known !== undefined && !sameJson(known, item))
          throw violation(`media ${JSON.stringify(id.slice(0, 80))} differs between pages`);
        media.set(id, item);
      }
    };
    collect(first);
    await requestOptions.onFirstPage?.(first);
    let after = first.nextCursor;
    while (after !== undefined) {
      const next = await readBuildExportPage({ ...shared, after });
      if (!next.changed) throw violation("a continuation page was not returned");
      const page = next.page;
      if (page.version !== first.version || page.formatVersion !== first.formatVersion)
        throw violation("pages report different versions or formats");
      collect(page);
      after = page.nextCursor;
    }
    const merged: Record<string, PublicMediaDto> = {};
    for (const id of [...media.keys()].sort((left, right) =>
      left < right ? -1 : left > right ? 1 : 0,
    ))
      merged[id] = media.get(id)!;
    return {
      changed: true,
      etag: result.etag,
      export: {
        entries,
        formatVersion: first.formatVersion,
        globals: first.globals,
        media: merged,
        seo: first.seo,
        version: first.version,
      },
    };
  }

  async function readBuildExport(requestOptions: BuildExportOptions): Promise<BuildExportResult> {
    const etag =
      requestOptions.etag === undefined ? undefined : assertEntityTag(requestOptions.etag);
    if (requestOptions.pageSize !== undefined) assertLimit(requestOptions.pageSize);
    const attempts = requestOptions.restart === false ? 1 : 2;
    for (let attempt = 1; ; attempt += 1) {
      try {
        // A restart reads the first page unconditionally.
        return await traverseBuildExport(requestOptions, attempt === 1 ? etag : undefined);
      } catch (error) {
        if (attempt >= attempts || !isVersionChanged(error)) throw error;
      }
    }
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
      const items: PublicEntryDto[] = [];
      const media = new Map<string, PublicMediaDto>();
      let after: string | undefined;
      do {
        const page = await read(
          collectionUrl(modelKey, {
            ...(after === undefined ? {} : { after }),
            ...(requestOptions.limit === undefined ? {} : { limit: requestOptions.limit }),
          }),
          tolerantPublicSchemas.publicContentList,
          requestOptions,
        );
        items.push(...page.items);
        for (const [id, item] of Object.entries(page.media)) media.set(id, item);
        after = page.nextCursor;
      } while (after !== undefined);
      const merged: Record<string, PublicMediaDto> = {};
      for (const id of [...media.keys()].sort((left, right) =>
        left < right ? -1 : left > right ? 1 : 0,
      ))
        merged[id] = media.get(id)!;
      return { items, media: merged };
    },

    getBuildExport(requestOptions = {}) {
      return readBuildExport(requestOptions);
    },

    getBuildExportPage(requestOptions = {}) {
      return readBuildExportPage(requestOptions);
    },

    getByPath(path, requestOptions = {}) {
      if (!path.startsWith("/")) throw new TypeError("path must start with a slash.");
      const url = publicUrl(baseUrl, ["content", "by-path"]);
      url.searchParams.set("path", path);
      return read(url, tolerantPublicSchemas.publicContentEntry, requestOptions);
    },

    getCollection(modelKey, requestOptions = {}) {
      return read(
        collectionUrl(modelKey, requestOptions),
        tolerantPublicSchemas.publicContentList,
        requestOptions,
      );
    },

    getCollectionBySlug(modelKey, slug, requestOptions = {}) {
      return read(
        publicUrl(baseUrl, [
          "collections",
          assertIdentifier(modelKey, "modelKey"),
          assertIdentifier(slug, "slug"),
        ]),
        tolerantPublicSchemas.publicContentEntry,
        requestOptions,
      );
    },

    getGlobal(modelKey, requestOptions = {}) {
      return read(
        publicUrl(baseUrl, ["globals", assertIdentifier(modelKey, "modelKey")]),
        tolerantPublicSchemas.publicGlobalContent,
        requestOptions,
      );
    },

    getPage(modelKey, requestOptions = {}) {
      return read(
        publicUrl(baseUrl, ["pages", assertIdentifier(modelKey, "modelKey")]),
        tolerantPublicSchemas.publicContentEntry,
        requestOptions,
      );
    },

    getPublicMediaUrl(mediaId) {
      return publicUrl(baseUrl, ["media", assertIdentifier(mediaId, "mediaId")]).toString();
    },
  };
}
