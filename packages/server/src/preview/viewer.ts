import { previewReturnGeneration } from "@lacecms/application";
import type { PreviewBrowserAccess } from "@lacecms/application";
import {
  freshPreviewAccess,
  previewCookie,
  previewRedirect,
  previewResponse,
  privatePreviewHeaders,
} from "./handoff.js";

/** Standalone first-party viewer. Site markup is a separate frame on the restricted origin. */
export async function previewViewer(
  request: Request,
  pathname: string,
  access: PreviewBrowserAccess<Request>,
) {
  const id = previewReturnGeneration(pathname);
  if (!id) return previewResponse(404);
  const delivery = await access.delivery(previewCookie(request), id);
  if (delivery === "denied") {
    if (["iframe", "frame"].includes(request.headers.get("sec-fetch-dest") ?? ""))
      return previewResponse(401);
    return previewRedirect(freshPreviewAccess(access, pathname));
  }
  if (!delivery) return previewResponse(404);
  const expires = new Date(delivery.expiresAt).toISOString();
  const headers = privatePreviewHeaders();
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set(
    "content-security-policy",
    "default-src 'none'; frame-src 'self'; frame-ancestors 'none'; style-src 'unsafe-inline'; base-uri 'none'",
  );
  return new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1"><title>Draft preview</title>
    <style>
      body{margin:0;font:1rem system-ui,sans-serif;display:grid;grid-template-rows:auto 1fr;min-height:100vh}
      header{padding:.65rem 1rem;background:#f6f6f6;color:#171717}
      iframe{border:0;width:100%;height:100%}
    </style>
    <header><strong>Draft preview · Revision ${delivery.revision}</strong>
    <span> · Expires <time datetime="${expires}">${expires.replace("T", " ").slice(0, 16)} UTC</time></span></header>
    <iframe title="Draft site page" src="/p/${id}/" referrerpolicy="no-referrer"
      sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"></iframe>
    </html>`,
    { headers },
  );
}
