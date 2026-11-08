import type { BuiltAdminResponder } from "@lacecms/server";
import type { AssetsFetcher } from "./settings.js";

function hasExtension(path: string): boolean {
  const name = path.slice(path.lastIndexOf("/") + 1);
  return name.includes(".") && !name.startsWith(".");
}

function withNosniff(response: Response, head: boolean): Response {
  const headers = new Headers(response.headers);
  headers.set("x-content-type-options", "nosniff");
  return new Response(head ? null : response.body, { headers, status: response.status });
}

/**
 * Serves compiled admin files from the Workers static-assets binding under
 * `/admin/`, falling back to the SPA entry for extensionless client routes.
 */
export function createCloudflareAdminAssets(assets: AssetsFetcher): BuiltAdminResponder {
  return {
    async fetch(request) {
      const url = new URL(request.url);
      if (request.method !== "GET" && request.method !== "HEAD")
        return new Response(null, { status: 405 });
      if (url.pathname === "/admin") return Response.redirect(new URL("/admin/", url), 308);
      if (!url.pathname.startsWith("/admin/")) return new Response(null, { status: 404 });
      const suffix = url.pathname.slice("/admin/".length);
      if (suffix.includes("\\") || suffix.includes("%00") || suffix.split("/").includes(".."))
        return new Response(null, { status: 404 });
      const asset = hasExtension(suffix) ? `/${suffix}` : "/index.html";
      const response = await assets.fetch(
        new Request(new URL(asset, url.origin), { method: "GET" }),
      );
      if (!response.ok) return new Response(null, { status: 404 });
      return withNosniff(response, request.method === "HEAD");
    },
  };
}
