/** Largest media upload the admin accepts before sending it to the API. */
export const maxMediaBytes = 10 * 1024 * 1024;

/** Image types the admin accepts for upload; the API verifies the content itself. */
export const mediaTypes: ReadonlySet<string> = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
]);

/** The `accept` attribute value for native file pickers. */
export const mediaAccept = [...mediaTypes].join(",");

/** People-facing wording of the upload constraints. */
export const mediaConstraintsText = "JPEG, PNG, GIF, WebP, or AVIF. Maximum 10 MiB.";

const extensions = /\.(?:avif|gif|jpe?g|png|webp)$/iu;

/**
 * Checks a file against the upload constraints before it is sent. A missing
 * browser MIME type falls back to the extension; the API still verifies bytes.
 */
export function validateMediaFile(file: Pick<File, "name" | "size" | "type">) {
  if (file.type === "" ? !extensions.test(file.name) : !mediaTypes.has(file.type)) return "type";
  if (file.size > maxMediaBytes) return "size";
  return undefined;
}

const typeLabels: Readonly<Record<string, string>> = {
  "image/avif": "AVIF",
  "image/gif": "GIF",
  "image/jpeg": "JPEG",
  "image/png": "PNG",
  "image/webp": "WebP",
};

/** A short type name for a media MIME type, e.g. "PNG"; unknown types stay as given. */
export function mediaTypeLabel(mimeType: string): string {
  return typeLabels[mimeType] ?? mimeType;
}

/** The authenticated admin preview path of a media item. */
export function mediaPreviewPath(mediaId: string): string {
  return `/api/v1/admin/media/${encodeURIComponent(mediaId)}/preview`;
}

/** Formats stored display dimensions, or marks them unknown when the item has none. */
export function formatMediaDimensions(item: {
  readonly height?: number | undefined;
  readonly width?: number | undefined;
}): string {
  return item.width === undefined || item.height === undefined
    ? "Unknown"
    : `${item.width} × ${item.height} px`;
}
