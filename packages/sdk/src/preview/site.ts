import type { FrozenPreviewInput } from "@lacecms/contracts/preview";
import { normalizeSiteUrl } from "../site/seo.js";
import { assembleSiteView } from "../site/site-view.js";
import type { PublishedMedia, SiteView } from "../site/types.js";

export interface PreviewSite extends SiteView {
  readonly preview: true;
  readonly generationId: string;
  readonly logicalPath: string;
  readonly capturedAt: string;
  readonly revision: number;
}

export function previewLogicalPath(path: string, prefix: string): string {
  const logical =
    path === prefix.slice(0, -1)
      ? "/"
      : path.startsWith(prefix)
        ? `/${path.slice(prefix.length)}`
        : path;
  return logical.replace(/\/$/u, "") || "/";
}

export function createPreviewSite(
  input: FrozenPreviewInput,
  resolveMedia: (
    item: FrozenPreviewInput["context"]["media"][string],
  ) => Pick<PublishedMedia, "url" | "sourceUrl">,
): PreviewSite {
  const { context, generationId, revision, capturedAt, target, targetMedia } = input;
  const prefix = `/p/${generationId}/`;
  const site = assembleSiteView({
    exported: {
      ...context,
      entries: [...context.entries.filter((entry) => entry.id !== target.id), target],
    },
    media: Object.values({ ...context.media, ...targetMedia }).map((item) => ({
      ...item,
      ...resolveMedia(item),
    })),
    indexing: false,
    siteUrl: normalizeSiteUrl(input.siteUrl),
    missingMediaUrl() {
      throw new Error("Media is missing from the frozen Lace preview input.");
    },
    normalizePath: (path) => previewLogicalPath(path, prefix),
    failure: (message) => {
      throw new Error(message);
    },
  });
  return Object.freeze({
    ...site,
    preview: true,
    generationId,
    revision,
    capturedAt,
    logicalPath: target.path,
  });
}
