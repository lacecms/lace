import { readFile, realpath } from "node:fs/promises";
import { extname, join, relative, resolve, sep } from "node:path";
import type { BuiltAdminResponder } from "@lacecms/server";

const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

/** Serves only compiled admin files and falls back to its SPA entry for client routes. */
export function createNodeAdminAssets(root: string): BuiltAdminResponder {
  const base = resolve(root);
  return {
    async fetch(request) {
      const pathname = new URL(request.url).pathname;
      if (request.method !== "GET" && request.method !== "HEAD")
        return new Response(null, { status: 405 });
      if (pathname === "/admin") return Response.redirect(new URL("/admin/", request.url), 308);
      if (!pathname.startsWith("/admin/")) return new Response(null, { status: 404 });
      let suffix: string;
      try {
        suffix = decodeURIComponent(pathname.slice("/admin/".length));
      } catch {
        return new Response(null, { status: 400 });
      }
      if (suffix.includes("\\") || suffix.includes("\0"))
        return new Response(null, { status: 404 });
      const canonicalBase = await realpath(base);
      const candidate = resolve(canonicalBase, suffix);
      const inside = relative(canonicalBase, candidate);
      if (inside.startsWith(`..${sep}`) || inside === ".." || inside.startsWith(sep))
        return new Response(null, { status: 404 });
      const asset = extname(candidate) === "" ? join(canonicalBase, "index.html") : candidate;
      try {
        const real = await realpath(asset);
        const location = relative(canonicalBase, real);
        if (location.startsWith(`..${sep}`) || location === ".." || location.startsWith(sep))
          return new Response(null, { status: 404 });
        const body = await readFile(real);
        return new Response(request.method === "HEAD" ? null : body, {
          headers: {
            "content-type": contentTypes[extname(real)] ?? "application/octet-stream",
            "x-content-type-options": "nosniff",
          },
        });
      } catch {
        return new Response(null, { status: 404 });
      }
    },
  };
}
