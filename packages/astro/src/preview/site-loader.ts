import { createPreviewSite } from "@lacecms/sdk/preview";
import type { PreviewSite } from "@lacecms/sdk/preview";
import type { PublishedSite } from "@lacecms/sdk";
import { createAstroSiteLoader } from "../server/site.js";
import type { AstroSiteLoaderOptions } from "../server/site.js";
import { environment } from "../server/environment.js";
import { originalPath } from "./originals.js";
import { mediaOriginSetting, previewInputFile, readPreviewBuildInput } from "./build-input.js";

export type AstroPreviewSite = PreviewSite | (PublishedSite & { readonly preview: false });

/** Opt-in counterpart to the published-only loader. */
export function createAstroPreviewSiteLoader(
  options: AstroSiteLoaderOptions = {},
): () => Promise<AstroPreviewSite> {
  const file = previewInputFile();
  if (file === undefined) {
    const published = createAstroSiteLoader(options);
    let wrapped: (PublishedSite & { readonly preview: false }) | undefined;
    let previous: PublishedSite | undefined;
    return async () => {
      const site = await published();
      if (wrapped === undefined || site !== previous) {
        previous = site;
        wrapped = Object.freeze({ ...site, preview: false });
      }
      return wrapped;
    };
  }
  let preview: PreviewSite | undefined;
  return async () => {
    if (preview === undefined) {
      const input = readPreviewBuildInput(file);
      const mediaSource = environment[mediaOriginSetting];
      preview = createPreviewSite(input, (item) => {
        const path = originalPath(item);
        return {
          url: `/p/${input.generationId}/${path}`,
          ...(mediaSource === undefined || options.optimizeImages === false
            ? {}
            : {
                sourceUrl: `${mediaSource}/${path}`,
              }),
        };
      });
      options.onLinkDiagnostics?.(preview.linkDiagnostics);
    }
    return preview;
  };
}
