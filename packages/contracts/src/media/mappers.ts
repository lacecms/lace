import { unixMilliseconds } from "@lacecms/domain";
import type { MediaFocalPoint, UnixMilliseconds } from "@lacecms/domain";
import { entityTagForVersion, versionFromEntityTag } from "../shared/preconditions.js";
import { toIsoTimestamp } from "../shared/primitives.js";
import type { EntityTag } from "../shared/primitives.js";
import type { MediaMetadataDto, MediaDetailDto, UpdateMediaMetadataResultDto } from "./metadata.js";

/** Maps metadata without exposing the private storage key. */
export interface MediaMetadataDtoSource {
  readonly tags: readonly string[];
  readonly alt?: string;
  readonly caption?: string;
  readonly createdAt: UnixMilliseconds;
  readonly createdBy: { readonly displayName: string; readonly id: string };
  readonly filename: string;
  readonly focalPoint?: MediaFocalPoint;
  readonly height?: number;
  readonly id: string;
  readonly mimeType: string;
  readonly sha256?: string;
  readonly size: number;
  readonly status: "active" | "delete_failed" | "deleting";
  readonly updatedAt: UnixMilliseconds;
  readonly usageCount: number;
  readonly width?: number;
}

export function toMediaMetadataDto(media: MediaMetadataDtoSource, url: string): MediaMetadataDto {
  return {
    tags: [...(media.tags ?? [])],
    ...(media.alt === undefined ? {} : { alt: media.alt }),
    ...(media.caption === undefined ? {} : { caption: media.caption }),
    createdAt: toIsoTimestamp(media.createdAt),
    createdBy: { displayName: media.createdBy.displayName, id: media.createdBy.id },
    filename: media.filename,
    ...(media.focalPoint === undefined
      ? {}
      : { focalPoint: { x: media.focalPoint.x, y: media.focalPoint.y } }),
    ...(media.height === undefined ? {} : { height: media.height }),
    id: media.id,
    mimeType: media.mimeType,
    ...(media.sha256 === undefined ? {} : { sha256: media.sha256 }),
    size: media.size,
    status: media.status,
    updatedAt: toIsoTimestamp(media.updatedAt),
    url,
    usageCount: media.usageCount,
    ...(media.width === undefined ? {} : { width: media.width }),
  };
}

export type MediaUsageLocationDtoSource =
  | {
      readonly field: string;
      readonly source: "field";
      readonly states: readonly ("draft" | "published")[];
    }
  | {
      readonly field: "image";
      readonly source: "seo";
      readonly states: readonly ("draft" | "published")[];
    }
  | {
      readonly blockKey: string;
      readonly blockType: string;
      readonly field: string;
      readonly source: "block";
      readonly states: readonly ("draft" | "published")[];
    };

export interface MediaDetailDtoSource extends MediaMetadataDtoSource {
  readonly usage: readonly {
    readonly entryId: string;
    readonly locations: readonly MediaUsageLocationDtoSource[];
    readonly modelKey: string;
    readonly slug?: string;
    readonly status: "changed" | "draft" | "published";
    readonly title: string;
  }[];
}

/** Maps a media item and its usage without exposing storage or snapshot identities. */
export function toMediaDetailDto(media: MediaDetailDtoSource, url: string): MediaDetailDto {
  return {
    ...toMediaMetadataDto(media, url),
    usage: media.usage.map((entry) => ({
      entryId: entry.entryId,
      locations: entry.locations.map((location) =>
        location.source === "field"
          ? { field: location.field, source: "field" as const, states: [...location.states] }
          : location.source === "seo"
            ? { field: "image" as const, source: "seo" as const, states: [...location.states] }
            : {
                blockKey: location.blockKey,
                blockType: location.blockType,
                field: location.field,
                source: "block" as const,
                states: [...location.states],
              },
      ),
      modelKey: entry.modelKey,
      ...(entry.slug === undefined ? {} : { slug: entry.slug }),
      status: entry.status,
      title: entry.title,
    })),
  };
}

/** Maps a metadata update and its independent build outcome. */
export function toUpdateMediaMetadataResultDto(
  input: {
    readonly build:
      | Readonly<{ readonly status: "queued"; readonly targetVersion: number }>
      | Readonly<{ readonly status: "not-dispatched" }>;
    readonly media: MediaMetadataDtoSource;
  },
  url: string,
): UpdateMediaMetadataResultDto {
  return {
    build:
      input.build.status === "queued"
        ? { status: "queued", targetVersion: input.build.targetVersion }
        : { status: input.build.status },
    media: toMediaMetadataDto(input.media, url),
  };
}

/** The strong media version tag: `updatedAt` in quoted Unix milliseconds. */
export function mediaEntityTag(updatedAt: UnixMilliseconds | number): EntityTag {
  return entityTagForVersion(updatedAt);
}

/**
 * Parses the required media `If-Match` precondition into the expected
 * `updatedAt`. Only one strong tag is accepted: absent, weak, `*`, list and
 * malformed values are refused.
 */
export function resolveMediaPrecondition(ifMatch: string | undefined): UnixMilliseconds {
  if (ifMatch === undefined) throw new TypeError("If-Match is required.");
  const value = ifMatch.trim();
  if (value.startsWith("W/")) throw new TypeError("If-Match requires a strong media tag.");
  if (!/^"[0-9]{1,16}"$/u.test(value)) {
    throw new TypeError("If-Match must be one strong media tag.");
  }
  return unixMilliseconds(versionFromEntityTag(value));
}

/** Produces the stable Lace media URL from configured public origin data only. */
export function mediaUrl(baseUrl: string, mediaId: string): string {
  if (!/^https?:\/\/[^\s]+\/$/u.test(baseUrl)) {
    throw new TypeError("Media base URL must be an absolute HTTP(S) URL ending in a slash.");
  }
  return `${baseUrl}api/v1/public/media/${encodeURIComponent(mediaId)}`;
}
