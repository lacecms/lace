import {
  isPreviewAccessToken,
  previewReturnGeneration,
  PREVIEW_HANDOFF_SECONDS,
} from "@lacecms/application";
import type { PreviewBrowserAccess } from "@lacecms/application";
import { previewRoutes } from "../routing/preview-routes.js";
import { API_V1 } from "../routing/v1-routes.js";
import { isPreviewFrameRequest, previewFrameSignal } from "./frame.js";

export const PREVIEW_COOKIE = "__Host-lace-preview";
const nonceCookie = (id: string) => `${PREVIEW_COOKIE}-${id}`;
const cookieScope = "Path=/; Secure; HttpOnly; SameSite=Lax";
const authorizePath = API_V1 + previewRoutes.admin.authorize.path;
const callbackPath = previewRoutes.host.callback.path;

export function previewCookie(request: Request, name = PREVIEW_COOKIE): string {
  const prefix = `${name}=`;
  const matches = request.headers
    .get("cookie")
    ?.split(";")
    .filter((part) => part.trimStart().startsWith(prefix));
  return matches?.length === 1 ? matches[0]!.trimStart().slice(prefix.length) : "";
}

export function privatePreviewHeaders() {
  return new Headers({
    "cache-control": "private, no-store",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-robots-tag": "noindex, nofollow, noarchive",
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  });
}

export function previewResponse(status: number): Response {
  return new Response(null, { status, headers: privatePreviewHeaders() });
}

export function previewUnavailable(): Response {
  const headers = privatePreviewHeaders();
  headers.set("content-type", "text/html; charset=utf-8");
  return new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1"><title>Preview unavailable</title>
    <main><h1>Preview unavailable</h1><p>Return to the entry editor to check the preview or create a new one.</p></main></html>`,
    { status: 404, headers },
  );
}

export function previewRedirect(target: URL, cookies: readonly string[] = []): Response {
  const headers = privatePreviewHeaders();
  headers.set("location", target.href);
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return new Response(null, { status: 303, headers });
}

function query(request: Request, allowed: readonly string[]): URLSearchParams | null {
  const params = new URL(request.url).searchParams;
  return [...params.keys()].every((key) => allowed.includes(key) && params.getAll(key).length === 1)
    ? params
    : null;
}

export function freshPreviewAccess(access: PreviewBrowserAccess<Request>, path: string): URL {
  const target = new URL(previewRoutes.host.start.path, access.previewOrigin);
  target.searchParams.set("return", path);
  return target;
}

function frameBootstrap(
  access: PreviewBrowserAccess<Request>,
  authorize: URL,
  path: string,
  cookie: string,
) {
  const headers = privatePreviewHeaders();
  const nonce = crypto.randomUUID();
  headers.set("set-cookie", cookie);
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set(
    "content-security-policy",
    `default-src 'none'; script-src 'nonce-${nonce}'; connect-src ${access.adminOrigin}; frame-ancestors ${access.adminOrigin}; base-uri 'none'`,
  );
  const generation = previewReturnGeneration(path);
  const fallback = freshPreviewAccess(access, `/view/${generation}`);
  return new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><title>Opening preview</title>
    <p id="status">Opening preview…</p>
    <a id="fallback" hidden href="${fallback.href}" target="_blank" rel="noopener noreferrer">Open preview in a new tab</a>
    <script nonce="${nonce}">
    ${previewFrameSignal(access.adminOrigin)}
    const denied = (status = "unavailable") => {
      document.getElementById("status").textContent = "This preview could not be opened in the frame.";
      document.getElementById("fallback").hidden = false;
      notify(${JSON.stringify(generation)}, status);
    };
    fetch(${JSON.stringify(authorize.href)}, {
      credentials: "include", redirect: "error", headers: {Accept: "application/json"}
    }).then(async response => {
      if (!response.ok) return denied(response.status === 401 ? "sign-in" : "unavailable");
      const callback = await response.json();
      if (typeof callback !== "string" || !callback.startsWith(${JSON.stringify(callbackPath + "#")})) return denied();
      location.replace(callback);
    }).catch(() => denied());
    </script></html>`,
    { headers },
  );
}

export function previewHandoffRoutes(access: PreviewBrowserAccess<Request>) {
  return {
    async start(request: Request) {
      const path = query(request, ["return"])?.get("return");
      if (path == null) return previewResponse(400);
      const handoff = await access.start(path);
      if (!handoff) return previewResponse(400);
      const target = new URL(authorizePath, access.adminOrigin);
      target.searchParams.set("state", handoff.state);
      const cookie = `${nonceCookie(handoff.id)}=${handoff.nonce}; ${cookieScope}; Max-Age=${PREVIEW_HANDOFF_SECONDS}`;
      return isPreviewFrameRequest(request)
        ? frameBootstrap(access, target, path, cookie)
        : previewRedirect(target, [cookie]);
    },
    async authorize(request: Request) {
      if (request.method !== "GET") return previewResponse(404);
      const origin = request.headers.get("origin");
      if (origin !== null && origin !== access.adminOrigin && origin !== access.previewOrigin)
        return previewResponse(403);
      const params = query(request, ["state", "resume"]);
      if (params?.size !== 1 || request.headers.has("authorization")) return previewResponse(401);
      const json =
        origin === access.previewOrigin && request.headers.get("accept") === "application/json";
      const resume = params.get("resume");
      if (resume !== null) {
        return previewReturnGeneration(resume) && !isPreviewFrameRequest(request)
          ? previewRedirect(freshPreviewAccess(access, resume))
          : previewResponse(400);
      }
      const state = params.get("state") ?? "";
      if (state.length > 440) return previewResponse(400);
      const result = await access.authorize(request, state);
      const cors = privatePreviewHeaders();
      if (json) {
        cors.set("access-control-allow-origin", access.previewOrigin);
        cors.set("access-control-allow-credentials", "true");
        cors.set("vary", "Origin, Accept");
      }
      if (result.kind === "issued") {
        const target = new URL(callbackPath, access.previewOrigin);
        target.hash = new URLSearchParams({
          flow: result.id,
          code: result.code,
          generation: result.generationId,
        }).toString();
        return json
          ? Response.json(target.pathname + target.hash, { headers: cors })
          : previewRedirect(target);
      }
      if (json) {
        const status = result.kind === "login" ? 401 : result.kind === "denied" ? 403 : 404;
        return new Response(null, { headers: cors, status });
      }
      if (result.kind === "login") {
        const id = previewReturnGeneration(result.returnPath);
        const login = new URL("/admin/login", access.adminOrigin);
        login.searchParams.set("previewReturn", `/view/${id}`);
        if (isPreviewFrameRequest(request)) {
          const headers = privatePreviewHeaders();
          headers.set("content-type", "text/html; charset=utf-8");
          headers.set(
            "content-security-policy",
            `default-src 'none'; frame-ancestors ${access.adminOrigin}; base-uri 'none'`,
          );
          return new Response(
            `<!doctype html><meta charset="utf-8"><title>Preview sign-in</title><p><a href="${login.href}" target="_blank" rel="noopener noreferrer">Sign in to open preview</a></p>`,
            { status: 401, headers },
          );
        }
        return previewRedirect(login);
      }
      return result.kind === "denied" ? previewResponse(403) : previewUnavailable();
    },
    callback() {
      const headers = privatePreviewHeaders();
      const nonce = crypto.randomUUID();
      headers.set("content-type", "text/html; charset=utf-8");
      headers.set(
        "content-security-policy",
        `default-src 'none'; script-src 'nonce-${nonce}'; connect-src 'self'; frame-ancestors ${access.adminOrigin}; base-uri 'none'`,
      );
      return new Response(
        `<!doctype html><meta charset="utf-8"><title>Opening preview</title><p id="status">Opening preview…</p>
        <a id="fallback" hidden target="_blank" rel="noopener noreferrer">Open preview in a new tab</a>
        <script nonce="${nonce}">
        ${previewFrameSignal(access.adminOrigin)}
        const data = new URLSearchParams(location.hash.slice(1));
        const generation = data.get("generation");
        const body = new URLSearchParams({flow: data.get("flow") || "", code: data.get("code") || ""}).toString();
        history.replaceState(null, "", location.pathname);
        const denied = () => {
          document.getElementById("status").textContent = "This preview could not be opened here.";
          if (generation && /^[A-Za-z0-9_-]{1,128}(?![\\s\\S])/.test(generation)) {
            const link = document.getElementById("fallback");
            link.href = "/access/start?return=" + encodeURIComponent("/view/" + generation);
            link.hidden = false;
            notify(generation, "unavailable");
          }
        };
        fetch(location.pathname, {method: "POST", headers: {"Content-Type": "application/x-www-form-urlencoded"}, body})
          .then(response => {
            const target = response.headers.get("Location");
            if (!response.ok || !target) return denied();
            if (target === location.origin + "/p/" + generation + "/") notify(generation, "ready");
            location.replace(target);
          }, denied);
        </script>`,
        { headers },
      );
    },
    async redeem(request: Request) {
      if (request.headers.get("origin") !== access.previewOrigin) return previewResponse(403);
      if (request.headers.get("content-type") !== "application/x-www-form-urlencoded")
        return previewResponse(415);
      const body = request.body?.getReader();
      if (!body) return previewResponse(400);
      const decoder = new TextDecoder();
      let text = "";
      let bytes = 0;
      try {
        for (;;) {
          const chunk = await body.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > 160) {
            await body.cancel();
            return previewResponse(413);
          }
          text += decoder.decode(chunk.value, { stream: true });
        }
      } finally {
        body.releaseLock();
      }
      const params = new URLSearchParams(text + decoder.decode());
      if (
        params.size !== 2 ||
        params.getAll("flow").length !== 1 ||
        params.getAll("code").length !== 1
      )
        return previewResponse(400);
      const id = params.get("flow") ?? "";
      if (!isPreviewAccessToken(id)) return previewResponse(401);
      const result = await access.redeem(
        id,
        params.get("code") ?? "",
        previewCookie(request, nonceCookie(id)),
      );
      if (!result || !previewReturnGeneration(result.returnPath)) return previewResponse(401);
      const expires = new Date(result.expiresAt).toUTCString();
      const headers = privatePreviewHeaders();
      headers.set("location", new URL(result.returnPath, access.previewOrigin).href);
      headers.append("set-cookie", `${nonceCookie(id)}=; ${cookieScope}; Max-Age=0`);
      headers.append(
        "set-cookie",
        `${PREVIEW_COOKIE}=${result.value}; ${cookieScope}; Expires=${expires}`,
      );
      return new Response(null, { status: 204, headers });
    },
  };
}
