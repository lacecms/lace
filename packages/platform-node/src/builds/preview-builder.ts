import { createHmac } from "node:crypto";
import type { PreviewRunner, PreviewSourceReservation } from "@lacecms/application";
import type { NodeBuilderTriggerSettings } from "./builder-trigger.js";

export const nodePreviewExecutor = "vps";

export class NodePreviewBuilder implements PreviewRunner {
  public constructor(private readonly settings: NodeBuilderTriggerSettings) {}

  public reservationId(generationId: string) {
    return createHmac("sha256", this.settings.secret)
      .update(`preview/${generationId}`)
      .digest("hex");
  }

  public async reserve(id: string): Promise<PreviewSourceReservation> {
    const release = async () => {
      await this.stop({ id });
    };
    try {
      const response = await this.request("PUT", id, 45_000);
      if (response.status === 200) {
        const result = (await response.json()) as { status?: unknown; commit?: unknown };
        if (result.status === "reserved" && typeof result.commit === "string")
          return { source: { commit: result.commit, executor: nodePreviewExecutor }, release };
      } else {
        await response.body?.cancel();
        if (response.status === 409) return { reason: "PREVIEW_BUSY" };
        if (response.status === 503) return { reason: "PREVIEW_SOURCE_UNAVAILABLE" };
      }
    } catch {
      // A lost response can leave a provisional reservation on the builder.
    }
    await release();
    return { reason: "PREVIEW_PROVIDER_UNAVAILABLE" };
  }

  public async dispatch({ id }: Parameters<PreviewRunner["dispatch"]>[0]): Promise<void> {
    const response = await this.request("POST", id, 30_000);
    await response.body?.cancel();
    if (response.status !== 202)
      throw new Error(response.status === 409 ? "PREVIEW_BUSY" : "PREVIEW_PROVIDER_UNAVAILABLE");
  }

  public async stop({ id }: { readonly id: string }): Promise<"stopped" | "unconfirmed"> {
    try {
      const response = await this.request("DELETE", id, 30_000);
      await response.body?.cancel();
      return response.status === 200 ? "stopped" : "unconfirmed";
    } catch {
      return "unconfirmed";
    }
  }

  private request(method: string, generationId: string, timeout: number) {
    return (this.settings.fetch ?? fetch)(new URL("preview", this.settings.baseUrl), {
      method,
      headers: {
        authorization: `Bearer ${this.settings.secret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ generationId, reservationId: this.reservationId(generationId) }),
      redirect: "error",
      signal: AbortSignal.timeout(timeout),
    });
  }
}
