import { parseVideoEmbed } from "@lacecms/content";
import type { VideoEmbedDescription } from "@lacecms/content";
import { LaceRenderError } from "./errors.js";
import type { BlockContext } from "./errors.js";

/** Describes a provider video without network calls or raw HTML. */
export function describeVideoEmbed(url: string, context?: BlockContext): VideoEmbedDescription {
  const description = parseVideoEmbed(url);
  if (description === undefined)
    throw new LaceRenderError(
      "invalid_block_data",
      "must be a supported YouTube or Vimeo video URL.",
      { ...(context === undefined ? {} : { context }), fieldPath: ["url"] },
    );
  return description;
}
