import type { BuildTriggerResult, SiteBuildRequest, SiteBuildTrigger } from "@lacecms/application";

import { siteBuildFailureReasons, normalizeBuildFailure } from "@lacecms/domain";
const FAILURE_REASONS = new Set<string>(siteBuildFailureReasons.slice(0, 8));
async function boundedText(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (reader === undefined) throw new Error("invalid_response");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1024) {
        await reader.cancel();
        throw new Error("invalid_response");
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
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export interface NodeBuilderTriggerSettings {
  readonly baseUrl: URL;
  readonly secret: string;
  readonly fetch?: typeof fetch;
}

/** The only Node/VPS transport for the fixed-command builder. */
export class NodeBuilderSiteBuildTrigger implements SiteBuildTrigger {
  public constructor(private readonly settings: NodeBuilderTriggerSettings) {
    if (settings.secret.length < 32)
      throw new TypeError("Builder secret must be at least 32 characters.");
    if (settings.baseUrl.pathname !== "/" || settings.baseUrl.search || settings.baseUrl.hash)
      throw new TypeError("Builder URL must be an origin.");
  }

  public async trigger(input: SiteBuildRequest): Promise<BuildTriggerResult> {
    try {
      const response = await (this.settings.fetch ?? fetch)(
        new URL("build", this.settings.baseUrl),
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${this.settings.secret}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ buildId: input.buildId, targetVersion: input.targetVersion }),
          signal: AbortSignal.timeout(25 * 60_000),
        },
      );
      const text = await boundedText(response);
      const value = JSON.parse(text) as unknown;
      if (value === null || typeof value !== "object" || Array.isArray(value))
        return { status: "failed", reason: "trigger_unavailable" };
      const record = value as Record<string, unknown>;
      if (
        response.status === 200 &&
        Object.keys(record).length === 2 &&
        record.status === "succeeded" &&
        record.log === "Static build succeeded."
      )
        return { status: "succeeded" };
      if (
        response.status === 503 &&
        Object.keys(record).every((key) => ["status", "reason", "log", "path"].includes(key)) &&
        (!Object.hasOwn(record, "path") || typeof record.path === "string") &&
        record.status === "failed" &&
        typeof record.reason === "string" &&
        FAILURE_REASONS.has(record.reason) &&
        record.log === `Static build failed: ${record.reason}.`
      )
        return { status: "failed", ...normalizeBuildFailure(record.reason, record.path) };
      return { status: "failed", reason: "trigger_unavailable" };
    } catch {
      return { status: "failed", reason: "trigger_unavailable" };
    }
  }
}
