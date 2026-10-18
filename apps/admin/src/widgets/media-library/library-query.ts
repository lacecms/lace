import type { MediaMimeTypeDto, MediaSortDto } from "@lacecms/contracts";
import { DEFAULT_MEDIA_SORT } from "../../shared/api/index.js";

export type MediaView = "grid" | "list";

/** The search, type filter, sort, and view of the library, as carried in the URL. */
export type MediaLibraryQuery = {
  readonly q?: string | undefined;
  readonly sort?: MediaSortDto | undefined;
  readonly type?: MediaMimeTypeDto | undefined;
  readonly view?: "list" | undefined;
};

/** A library query without blank or default values. */
export type CanonicalMediaQuery = {
  readonly q?: string;
  readonly sort?: MediaSortDto;
  readonly type?: MediaMimeTypeDto;
  readonly view?: "list";
};

/** Drops blank and default values so equivalent libraries share one URL and cache entry. */
export function normalizedMediaQuery(query: MediaLibraryQuery): CanonicalMediaQuery {
  const q = query.q?.trim() ?? "";
  return {
    ...(q.length > 0 ? { q } : {}),
    ...(query.type === undefined ? {} : { type: query.type }),
    ...(query.sort === undefined || query.sort === DEFAULT_MEDIA_SORT ? {} : { sort: query.sort }),
    ...(query.view === "list" ? { view: "list" as const } : {}),
  };
}

export const mediaTypeOptions: readonly {
  readonly label: string;
  readonly value: MediaMimeTypeDto | undefined;
}[] = [
  { label: "All", value: undefined },
  { label: "JPEG", value: "image/jpeg" },
  { label: "PNG", value: "image/png" },
  { label: "GIF", value: "image/gif" },
  { label: "WebP", value: "image/webp" },
  { label: "AVIF", value: "image/avif" },
];

export const mediaSortOptions: readonly { readonly label: string; readonly value: MediaSortDto }[] =
  [
    { label: "Newest first", value: "-createdAt" },
    { label: "Oldest first", value: "createdAt" },
    { label: "Name A–Z", value: "filename" },
    { label: "Name Z–A", value: "-filename" },
    { label: "Largest first", value: "-size" },
    { label: "Smallest first", value: "size" },
  ];
