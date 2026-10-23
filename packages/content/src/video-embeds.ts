/** Providers accepted by portable embed URL fields. */
export type EmbedProvider = "youtube" | "vimeo";

export interface VideoEmbedDescription {
  readonly provider: EmbedProvider;
  readonly videoId: string;
  readonly src: string;
  readonly privacyHash?: string;
}

/** Parses only known HTTPS video paths; never follows redirects or calls providers. */
export function parseVideoEmbed(value: unknown): VideoEmbedDescription | undefined {
  if (typeof value !== "string" || !/^https:\/\//iu.test(value) || /[\s\\]/u.test(value))
    return undefined;
  const parts = new RegExp(
    String.raw`^https://([^/?#]+)([^?#]*)(?:\?([^#]*))?(?:#.*)?$`,
    "iu",
  ).exec(value);
  if (!parts) return undefined;
  const host = parts[1]!.toLowerCase().replace(/:443$/u, "");
  if (!/^[a-z0-9.-]+$/u.test(host)) return undefined;
  const parameters = new Map<string, string[]>();
  try {
    for (const pair of (parts[3] ?? "").split("&")) {
      if (!pair) continue;
      const split = pair.indexOf("=");
      const key = decodeURIComponent(
        (split < 0 ? pair : pair.slice(0, split)).replace(/\+/gu, " "),
      );
      const val = decodeURIComponent((split < 0 ? "" : pair.slice(split + 1)).replace(/\+/gu, " "));
      parameters.set(key, [...(parameters.get(key) ?? []), val]);
    }
  } catch {
    return undefined;
  }
  if ((parameters.get("v")?.length ?? 0) > 1 || (parameters.get("h")?.length ?? 0) > 1)
    return undefined;
  const path = parts[2]!.replace(/\/$/u, "");
  let videoId: string | undefined;
  if (["youtube.com", "www.youtube.com", "m.youtube.com"].includes(host)) {
    videoId =
      path === "/watch"
        ? parameters.get("v")?.[0]
        : /^\/(?:embed|shorts)\/([^/]+)$/u.exec(path)?.[1];
  } else if (host === "youtu.be") {
    videoId = /^\/([^/]+)$/u.exec(path)?.[1];
  } else if (host === "www.youtube-nocookie.com") {
    videoId = /^\/embed\/([^/]+)$/u.exec(path)?.[1];
  }
  if (videoId !== undefined) {
    if (!/^[A-Za-z0-9_-]{11}$/u.test(videoId)) return undefined;
    return Object.freeze({
      provider: "youtube",
      videoId,
      src: `https://www.youtube-nocookie.com/embed/${videoId}`,
    });
  }
  const match = ["vimeo.com", "www.vimeo.com"].includes(host)
    ? /^\/([1-9][0-9]*)(?:\/([A-Za-z0-9]+))?$/u.exec(path)
    : host === "player.vimeo.com"
      ? /^\/video\/([1-9][0-9]*)$/u.exec(path)
      : null;
  if (!match) return undefined;
  const queryHash = parameters.get("h")?.[0] ?? null;
  const pathHash = match[2];
  if (queryHash !== null && !/^[A-Za-z0-9]+$/u.test(queryHash)) return undefined;
  if (pathHash !== undefined && queryHash !== null && pathHash !== queryHash) return undefined;
  const privacyHash = pathHash ?? queryHash ?? undefined;
  videoId = match[1]!;
  return Object.freeze({
    provider: "vimeo",
    videoId,
    ...(privacyHash === undefined ? {} : { privacyHash }),
    src: `https://player.vimeo.com/video/${videoId}${privacyHash === undefined ? "" : `?h=${privacyHash}`}`,
  });
}
