export const renderOrigin = "https://lace-preview.invalid";
const fileLike =
  /\.(?:avif|bmp|gif|ico|jpe?g|png|svg|webp|mp[34]|ogg|wav|webm|pdf|zip|woff2?|vtt)$/iu;

function stripBase(path: string, base: string): string {
  if (path === base.slice(0, -1)) return "/";
  return path.startsWith(base) ? `/${path.slice(base.length)}` : path;
}

export function previewUrls(
  prefix: string,
  siteUrl: string,
  documentPath: string,
  assets: ReadonlySet<string>,
  originals: ReadonlySet<string>,
  usedOriginals: Set<string>,
) {
  const site = new URL(siteUrl.endsWith("/") ? siteUrl : siteUrl + "/");
  const page = new URL(documentPath, renderOrigin);

  function parse(value: string): URL | undefined {
    try {
      return new URL(value, page);
    } catch {
      return undefined;
    }
  }

  function localPath(url: URL): string | undefined {
    if (url.origin === renderOrigin) {
      if (url.pathname.startsWith("/p/") && !url.pathname.startsWith(prefix))
        throw new Error(
          "PREVIEW_RENDER_FAILED: a resource points outside this preview generation.",
        );
      if (url.pathname.startsWith(prefix)) return url.pathname.slice(prefix.length);
      return stripBase(url.pathname, site.pathname).slice(1);
    }
    // An explicit public-site URL may point at the same site's static files.
    if (url.origin === site.origin && url.pathname.startsWith(site.pathname))
      return url.pathname.slice(site.pathname.length);
    return undefined;
  }

  function resource(value: string): string {
    const raw = value.trim();
    if (raw.length === 0 || raw.startsWith("#")) return value;
    const url = parse(raw);
    if (url === undefined || url.username !== "" || url.password !== "")
      throw new Error("PREVIEW_RENDER_FAILED: an asset URL is invalid.");
    const path = localPath(url);
    if (path === undefined) return value;
    if (originals.has(path)) usedOriginals.add(path);
    else if (!assets.has(path))
      throw new Error(
        "PREVIEW_RENDER_FAILED: a referenced local asset is missing. Check literal public asset paths.",
      );
    return prefix + path + url.search + url.hash;
  }

  return {
    resource,
    anchor(value: string, download: boolean): { readonly href: string; readonly page: boolean } {
      const raw = value.trim();
      if (raw.length === 0 || raw.startsWith("#")) return { href: value, page: false };
      const url = parse(raw);
      if (url === undefined || !["http:", "https:"].includes(url.protocol))
        return { href: value, page: false };
      if (url.username !== "" || url.password !== "")
        throw new Error("PREVIEW_RENDER_FAILED: a link URL contains credentials.");
      const path = localPath(url);
      if (download || fileLike.test(url.pathname) || (path !== undefined && assets.has(path))) {
        return { href: resource(raw), page: false };
      }
      if (url.origin !== renderOrigin) return { href: value, page: true };
      const logical =
        raw.startsWith("/") || raw.startsWith(renderOrigin)
          ? stripBase(stripBase(url.pathname, prefix), site.pathname)
          : url.pathname;
      return {
        href: new URL(logical.replace(/^\/+/u, "") + url.search + url.hash, site).href,
        page: true,
      };
    },
  };
}
