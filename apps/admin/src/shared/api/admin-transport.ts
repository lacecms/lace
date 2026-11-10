import {
  contractValidationIssueSchema,
  errorEnvelopeSchema,
  type ContractValidationIssue,
} from "@lacecms/contracts";
import * as v from "valibot";

export class AdminClientError extends Error {
  readonly code: string | undefined;
  readonly requestId: string | undefined;
  readonly status: number | undefined;
  readonly issues: readonly ContractValidationIssue[] | undefined;

  constructor(input: {
    readonly code?: string;
    readonly message: string;
    readonly requestId?: string;
    readonly status?: number;
    readonly issues?: readonly ContractValidationIssue[];
  }) {
    super(input.message);
    this.name = "AdminClientError";
    this.code = input.code;
    this.requestId = input.requestId;
    this.status = input.status;
    this.issues = input.issues;
  }
}

/** Per-upload callbacks; `onProgress` receives the sent fraction (0–1) when the browser reports it. */
export interface MediaUploadOptions {
  readonly tags?: readonly string[];
  readonly onProgress?: (fraction: number) => void;
}

/** A completed upload exchange, independent of the browser API that performed it. */
export interface UploadExchange {
  readonly body: unknown;
  readonly requestId: string | undefined;
  readonly status: number;
}

/**
 * Sends a multipart upload to a same-origin API path. Rejects only when the
 * API cannot be reached; HTTP errors resolve with their status and body.
 */
export type MediaUploader = (
  path: string,
  body: FormData,
  options: MediaUploadOptions,
) => Promise<UploadExchange>;

export type Fetcher = typeof fetch;

export function responseError(status: number, requestId: string | undefined, body: unknown) {
  const parsed = v.safeParse(errorEnvelopeSchema, body);
  const issues = parsed.success ? parseIssues(parsed.output.error.details?.issues) : undefined;
  return parsed.success
    ? new AdminClientError({
        code: parsed.output.error.code,
        message: parsed.output.error.message,
        ...(requestId === undefined ? {} : { requestId }),
        status,
        ...(issues === undefined ? {} : { issues }),
      })
    : new AdminClientError({
        message: `The Lace API request failed (${status}).`,
        ...(requestId === undefined ? {} : { requestId }),
        status,
      });
}

function unreachable(): AdminClientError {
  return new AdminClientError({ message: "The Lace API could not be reached." });
}

function parseIssues(value: unknown): readonly ContractValidationIssue[] | undefined {
  const parsed = v.safeParse(v.array(contractValidationIssueSchema), value);
  return parsed.success ? parsed.output : undefined;
}

async function json(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

export async function request(
  fetcher: Fetcher,
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(path, {
      ...init,
      credentials: "same-origin",
      headers: { accept: "application/json", ...init.headers },
    });
  } catch {
    throw unreachable();
  }
  const body = response.status === 204 ? undefined : await json(response);
  if (!response.ok)
    throw responseError(response.status, response.headers.get("x-request-id") ?? undefined, body);
  return body;
}

export function postJson(fetcher: Fetcher, path: string, body: unknown): Promise<unknown> {
  return request(fetcher, path, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

/**
 * Drops validation issues from failures of requests that carry a secret
 * (an account token or a password), so no echoed input can reach the screen.
 */
export async function withoutIssues(pending: Promise<unknown>): Promise<unknown> {
  try {
    return await pending;
  } catch (error) {
    if (!(error instanceof AdminClientError) || error.issues === undefined) throw error;
    throw new AdminClientError({
      ...(error.code === undefined ? {} : { code: error.code }),
      message: error.message,
      ...(error.requestId === undefined ? {} : { requestId: error.requestId }),
      ...(error.status === undefined ? {} : { status: error.status }),
    });
  }
}

/** Uploads through `fetch`, which cannot report intermediate upload progress. */
export function fetchUploader(fetcher: Fetcher): MediaUploader {
  return async (path, body) => {
    let response: Response;
    try {
      response = await fetcher(path, {
        body,
        credentials: "same-origin",
        headers: { accept: "application/json" },
        method: "POST",
      });
    } catch {
      throw unreachable();
    }
    return {
      body: await json(response),
      requestId: response.headers.get("x-request-id") ?? undefined,
      status: response.status,
    };
  };
}

/** Uploads through same-origin `XMLHttpRequest` (cookies included) so the browser reports bytes sent. */
export const xhrUploader: MediaUploader = (path, body, options) =>
  new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", path);
    request.setRequestHeader("accept", "application/json");
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && event.total > 0)
        options.onProgress?.(Math.min(1, event.loaded / event.total));
    });
    request.addEventListener("load", () => {
      let parsed: unknown;
      try {
        parsed = request.responseText === "" ? undefined : JSON.parse(request.responseText);
      } catch {
        parsed = undefined;
      }
      resolve({
        body: parsed,
        requestId: request.getResponseHeader("x-request-id") ?? undefined,
        status: request.status,
      });
    });
    request.addEventListener("error", () => reject(unreachable()));
    request.addEventListener("abort", () => reject(unreachable()));
    request.send(body);
  });

export function parse<T>(schema: v.BaseSchema<unknown, T, v.BaseIssue<unknown>>, body: unknown): T {
  const result = v.safeParse(schema, body);
  if (!result.success)
    throw new AdminClientError({ message: "The Lace API returned an invalid response." });
  return result.output;
}
