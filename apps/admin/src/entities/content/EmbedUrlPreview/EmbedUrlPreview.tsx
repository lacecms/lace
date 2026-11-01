import { parseVideoEmbed } from "@lacecms/content";
import { Video } from "lucide-react";
import type { FieldDefinition, FieldPreviewProps } from "../field-types.js";

const providerNames = { vimeo: "Vimeo video", youtube: "YouTube video" } as const;

/**
 * The collapsed-row preview of a URL restricted to video providers: a video
 * icon and the provider, read from the value alone without a network request.
 * A value that is not a supported provider URL leaves the row to the generic
 * summary.
 */
export function EmbedUrlPreview({ value, children }: FieldPreviewProps) {
  const embed = parseVideoEmbed(value);
  if (embed === undefined) return children({});
  return children({
    title: providerNames[embed.provider],
    visual: (
      <span className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-muted text-muted-foreground">
        <Video aria-hidden className="size-4" />
      </span>
    ),
  });
}

/** Only URL fields restricted to embed providers get the video preview. */
EmbedUrlPreview.appliesTo = (definition: FieldDefinition) =>
  definition.type === "url" && definition.embedProviders !== undefined;
