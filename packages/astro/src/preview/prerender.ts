import type { AstroPrerenderer } from "astro";
import { previewLogicalPath } from "@lacecms/sdk/preview";

export function singleRoutePrerenderer(
  base: AstroPrerenderer,
  target: string,
  prefix: string,
  rendered: () => void,
): AstroPrerenderer {
  return {
    ...base,
    name: "lace:preview",
    async getStaticPaths() {
      const result = await base.getStaticPaths();
      const paths = Array.isArray(result) ? result : result.paths;
      const selected = paths.filter(
        ({ pathname }) => previewLogicalPath(pathname, prefix) === target,
      );
      if (selected.length !== 1 || selected[0]?.route.type !== "page")
        throw new Error(
          "PREVIEW_ROUTE_CONFLICT: expected exactly one site page for the saved route.",
        );
      return Array.isArray(result) ? selected : { ...result, paths: selected };
    },
    async render(request, options) {
      const path = previewLogicalPath(new URL(request.url).pathname, prefix);
      if (path !== target)
        throw new Error("PREVIEW_ROUTE_CONFLICT: Astro selected a different route.");
      const result = await base.render(request, options);
      const response = result instanceof Response ? result : result.response;
      if (response.status !== 200 || !response.headers.get("content-type")?.startsWith("text/html"))
        throw new Error(
          "PREVIEW_RENDER_FAILED: the selected route must return HTML with HTTP 200.",
        );
      rendered();
      return result;
    },
  };
}
