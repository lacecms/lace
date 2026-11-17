import { frozenPreviewInputSchema, previewGenerationIdSchema } from "@lacecms/contracts/preview";
import type { FrozenPreviewInput } from "@lacecms/contracts/preview";
import * as v from "valibot";
import type { LaceFetch } from "../client/client.js";
import { immutable } from "../site/internal-links.js";
import { normalizeSiteUrl } from "../site/seo.js";

const maxInputBytes = 8 * 1024 * 1024;

export function parseFrozenPreviewInput(value: unknown): FrozenPreviewInput {
  const parsed = v.safeParse(frozenPreviewInputSchema, value);
  if (!parsed.success || normalizeSiteUrl(parsed.output.siteUrl) === undefined)
    throw new Error("Invalid frozen Lace preview input.");
  return immutable(parsed.output);
}

export interface PreviewInputClientOptions {
  readonly apiBaseUrl: string;
  readonly generationId: string;
  readonly claim: string;
  readonly fetch?: LaceFetch;
}

async function readInput(response: Response): Promise<FrozenPreviewInput> {
  const reader = response.body?.getReader();
  if (reader === undefined) throw new Error("Lace preview input is empty.");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxInputBytes) throw new Error("Lace preview input exceeds the capture limit.");
      chunks.push(chunk.value);
    }
    const content = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      content.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return parseFrozenPreviewInput(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(content)),
    );
  } catch {
    await reader.cancel().catch(() => undefined);
    throw new Error("Invalid or oversized frozen Lace preview input.");
  } finally {
    reader.releaseLock();
  }
}

/** For the trusted runner. The site subprocess receives the detached input, without the claim. */
export function createPreviewInputClient(options: PreviewInputClientOptions) {
  const baseUrl = normalizeSiteUrl(options.apiBaseUrl);
  if (
    baseUrl === undefined ||
    !v.is(previewGenerationIdSchema, options.generationId) ||
    !/^[\x21-\x7e]+$/u.test(options.claim)
  )
    throw new TypeError("Invalid Lace preview runner configuration.");
  const endpoint = new URL(`api/v1/preview-runner/${options.generationId}/input`, baseUrl);
  const fetcher = options.fetch ?? fetch;
  async function request(url: URL, signal?: AbortSignal): Promise<Response> {
    let response: Response;
    try {
      response = await fetcher(url, {
        headers: { authorization: `Bearer ${options.claim}` },
        redirect: "error",
        cache: "no-store",
        credentials: "omit",
        signal: signal ?? AbortSignal.timeout(30_000),
      });
    } catch {
      throw new Error("Lace preview input request failed.");
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error(`Lace preview input request failed (HTTP ${response.status}).`);
    }
    return response;
  }
  let loaded: Promise<FrozenPreviewInput> | undefined;
  const input = (signal?: AbortSignal) =>
    (loaded ??= request(endpoint, signal).then(async (response) => {
      const frozen = await readInput(response);
      if (frozen.generationId !== options.generationId)
        throw new Error("Frozen Lace preview input belongs to a different generation.");
      return frozen;
    }));
  return Object.freeze({
    input,
    async original(mediaId: string, signal?: AbortSignal): Promise<Response> {
      const frozen = await input(signal);
      if (
        !Object.hasOwn(frozen.targetMedia, mediaId) &&
        !Object.hasOwn(frozen.context.media, mediaId)
      )
        throw new Error("Requested media is outside the frozen Lace preview input.");
      const url = new URL(endpoint);
      url.searchParams.set("mediaId", mediaId);
      return request(url, signal);
    },
  });
}
