import { previewFrameMessageType } from "@lacecms/contracts";

export function isPreviewFrameRequest(request: Request): boolean {
  const destination = request.headers.get("sec-fetch-dest");
  return destination === "iframe" || destination === "frame";
}

/** Only Lace-owned documents use this signal. It controls presentation in the admin. */
export function previewFrameSignal(adminOrigin: string): string {
  return `const notify = (generationId, status) => {
    if (window.parent !== window)
      window.parent.postMessage({type: ${JSON.stringify(previewFrameMessageType)}, generationId, status}, ${JSON.stringify(adminOrigin)});
  };`;
}
