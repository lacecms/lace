import type { BuildTriggerResult, SiteBuildTrigger } from "@lacecms/application";

export const DEFAULT_DEPLOY_HOOK_TIMEOUT_MS = 10_000;
/** Deploy-hook responses are small envelopes; anything larger carries no usable ID. */
export const DEPLOY_HOOK_MAX_RESPONSE_BYTES = 16 * 1024;

const PROVIDER_ID_PATTERN = /^[A-Za-z0-9._:-]{1,200}$/u;
const RETRYABLE_STATUSES = new Set([408, 425, 429]);

export interface DeployHookSiteBuildTriggerSettings {
  readonly fetch?: (input: URL, init: RequestInit) => Promise<Response>;
  readonly timeoutMs?: number;
  readonly url: URL;
}

const unavailable: BuildTriggerResult = Object.freeze({
  reason: "trigger_unavailable",
  status: "failed",
});
const rejected: BuildTriggerResult = Object.freeze({ reason: "provider_failed", status: "failed" });

/** Reads at most the byte limit; a larger body yields `undefined` and is cancelled. */
async function boundedText(response: Response): Promise<string | undefined> {
  if (response.body === null) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > DEPLOY_HOOK_MAX_RESPONSE_BYTES) {
        await reader.cancel();
        return undefined;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function parseEnvelope(text: string | undefined): Record<string, unknown> | undefined {
  if (text === undefined || text.length === 0) return undefined;
  try {
    const value = JSON.parse(text) as unknown;
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function providerId(envelope: Record<string, unknown> | undefined): string | undefined {
  const result = envelope?.result;
  if (result === null || typeof result !== "object" || Array.isArray(result)) return undefined;
  const id = (result as Record<string, unknown>).id;
  return typeof id === "string" && PROVIDER_ID_PATTERN.test(id) ? id : undefined;
}

/**
 * The Cloudflare `SiteBuildTrigger`: one bodiless POST to a deploy hook held in
 * a Worker secret. The URL is the credential, so it never reaches a result or log.
 */
export class DeployHookSiteBuildTrigger implements SiteBuildTrigger {
  private readonly timeoutMs: number;

  public constructor(private readonly settings: DeployHookSiteBuildTriggerSettings) {
    this.timeoutMs = settings.timeoutMs ?? DEFAULT_DEPLOY_HOOK_TIMEOUT_MS;
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 1 || this.timeoutMs > 60_000)
      throw new TypeError("Deploy-hook timeout is invalid.");
    if (settings.url.protocol !== "https:") throw new TypeError("Deploy-hook URL must use HTTPS.");
  }

  public async trigger(): Promise<BuildTriggerResult> {
    const call = this.settings.fetch ?? ((input, init) => fetch(input, init));
    let response: Response;
    try {
      response = await call(this.settings.url, {
        headers: { accept: "application/json" },
        method: "POST",
        redirect: "manual",
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      return unavailable;
    }
    let text: string | undefined;
    try {
      text = await boundedText(response);
    } catch {
      text = undefined;
    }
    if (response.status >= 500 || RETRYABLE_STATUSES.has(response.status)) return unavailable;
    if (response.status < 200 || response.status > 299) return rejected;
    const envelope = parseEnvelope(text);
    if (envelope?.success === false) return rejected;
    // Acceptance never proves publication; without tracking it is terminal `accepted`.
    const id = providerId(envelope);
    return id === undefined
      ? Object.freeze({ status: "accepted" })
      : Object.freeze({ providerBuildId: id, status: "accepted" });
  }
}
