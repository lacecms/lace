/** Normalize hostnames for reservation, independently of port and DNS root dots. */
export function previewHostname(url: URL): string {
  return url.hostname.replace(/\.$/u, "");
}

function hostFromUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || /[\\\s]/u.test(value)) return undefined;
  try {
    const url = new URL(value);
    if (["https:", "http:"].includes(url.protocol) && !url.username && !url.password) {
      return previewHostname(url);
    }
  } catch {
    return undefined;
  }
}

export function reservedPreviewHostname(
  preview: unknown,
  cms: URL,
  site: unknown,
): string | undefined {
  const hostname = hostFromUrl(preview);
  if (hostname !== previewHostname(cms) && hostname !== hostFromUrl(site)) return hostname;
}
