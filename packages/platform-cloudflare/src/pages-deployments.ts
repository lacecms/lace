import type { ProviderDeploymentObservation, ProviderDeploymentReader } from "@lacecms/application";
import { isSiteBuildProviderStage, type SiteBuildProviderStage } from "@lacecms/domain";
import { boundedText } from "./bounded-body.js";

export const DEFAULT_PAGES_API_BASE_URL = "https://api.cloudflare.com/client/v4/";
export const DEFAULT_PAGES_API_TIMEOUT_MS = 10_000;
/** Deployment bodies include build configuration and environment variables; never kept. */
export const PAGES_API_MAX_RESPONSE_BYTES = 256 * 1024;

const TRANSIENT_STATUSES = new Set([408, 425, 429]);
const PAGES_STAGE_STATUSES = new Set([
  "idle",
  "active",
  "success",
  "failure",
  "canceled",
  "skipped",
]);

export interface PagesDeploymentStatusReaderSettings {
  readonly accountId: string;
  readonly apiBaseUrl?: URL;
  readonly apiToken: string;
  readonly fetch?: (input: URL, init: RequestInit) => Promise<Response>;
  readonly projectName: string;
  readonly timeoutMs?: number;
}

const transient: ProviderDeploymentObservation = Object.freeze({ kind: "transient" });

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function parse(text: string | undefined): Record<string, unknown> | undefined {
  if (text === undefined || text.length === 0) return undefined;
  try {
    return record(JSON.parse(text) as unknown);
  } catch {
    return undefined;
  }
}

function outcome(
  outcomeValue: "succeeded" | "failed" | "cancelled",
  stage: SiteBuildProviderStage,
  reason?: Extract<ProviderDeploymentObservation, { kind: "outcome" }>["reason"],
): ProviderDeploymentObservation {
  return Object.freeze({
    kind: "outcome",
    outcome: outcomeValue,
    stage,
    ...(reason === undefined ? {} : { reason }),
  });
}

/** Maps one deployment `result` to closed facts; unexpected shapes are transient. */
export function pagesDeploymentObservation(
  result: Record<string, unknown>,
): ProviderDeploymentObservation {
  const latest = record(result.latest_stage);
  const name = latest?.name;
  const status = latest?.status;
  if (!isSiteBuildProviderStage(name) || typeof status !== "string") return transient;
  if (!PAGES_STAGE_STATUSES.has(status)) return transient;
  if (result.is_skipped === true || status === "skipped")
    return outcome("cancelled", name, "provider_skipped");
  if (status === "canceled") return outcome("cancelled", name, "provider_cancelled");
  if (status === "failure")
    return outcome(
      "failed",
      name,
      name === "build"
        ? "provider_build_failed"
        : name === "deploy"
          ? "provider_deploy_failed"
          : "provider_failed",
    );
  if (status === "success" && name === "deploy") return outcome("succeeded", name);
  return Object.freeze({ kind: "progress", stage: name });
}

/**
 * Reads the exact Cloudflare Pages deployment named by a stored provider ID.
 * The token is sent only to the configured API origin and nothing from the
 * response beyond the closed stage facts leaves this adapter.
 */
export class PagesDeploymentStatusReader implements ProviderDeploymentReader {
  private readonly base: URL;
  private readonly timeoutMs: number;

  public constructor(private readonly settings: PagesDeploymentStatusReaderSettings) {
    this.base = settings.apiBaseUrl ?? new URL(DEFAULT_PAGES_API_BASE_URL);
    this.timeoutMs = settings.timeoutMs ?? DEFAULT_PAGES_API_TIMEOUT_MS;
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 1 || this.timeoutMs > 60_000)
      throw new TypeError("Pages API timeout is invalid.");
  }

  public async read(providerBuildId: string): Promise<ProviderDeploymentObservation> {
    const url = new URL(
      `accounts/${encodeURIComponent(this.settings.accountId)}/pages/projects/${encodeURIComponent(
        this.settings.projectName,
      )}/deployments/${encodeURIComponent(providerBuildId)}`,
      this.base,
    );
    const call = this.settings.fetch ?? ((input, init) => fetch(input, init));
    let response: Response;
    try {
      response = await call(url, {
        headers: {
          accept: "application/json",
          authorization: `Bearer ${this.settings.apiToken}`,
        },
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      return transient;
    }
    let text: string | undefined;
    try {
      text = await boundedText(response, PAGES_API_MAX_RESPONSE_BYTES);
    } catch {
      text = undefined;
    }
    if (response.status === 401 || response.status === 403)
      return Object.freeze({ kind: "forbidden" });
    if (response.status === 404) return Object.freeze({ kind: "not_found" });
    if (response.status >= 500 || TRANSIENT_STATUSES.has(response.status)) return transient;
    if (response.status < 200 || response.status > 299) return Object.freeze({ kind: "rejected" });
    const envelope = parse(text);
    const result = record(envelope?.result);
    if (envelope?.success !== true || result === undefined || result.id !== providerBuildId)
      return transient;
    return pagesDeploymentObservation(result);
  }
}
