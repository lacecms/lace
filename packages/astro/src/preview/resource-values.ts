/** Map URLs in a srcset without splitting the comma inside a data URL. */
export function rewriteSrcset(value: string, rewrite: (url: string) => string): string {
  const candidates: string[] = [];
  let remaining = value;
  while ((remaining = remaining.replace(/^[\t\n\f\r ,]+/u, "")) !== "") {
    const src = /^[^\t\n\f\r ]+/u.exec(remaining)?.[0];
    if (src === undefined) break;
    remaining = remaining.slice(src.length);
    if (src.endsWith(",")) {
      candidates.push(rewrite(src.replace(/,+$/u, "")));
      continue;
    }
    const descriptors = /^(?:[^,(]|\([^)]*\))*/u.exec(remaining)?.[0] ?? "";
    candidates.push(rewrite(src) + descriptors.trimEnd());
    remaining = remaining.slice(descriptors.length);
    // Malformed descriptor input is left for the browser, but always make progress.
    if (remaining !== "" && !remaining.startsWith(",")) return value;
  }
  return candidates.join(", ");
}

// Skip comments and quoted CSS strings, and resolve literal url() and quoted @import values.
const cssToken =
  /\/\*[\s\S]*?\*\/|(?:\burl\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)|@import\s+(?:"([^"]*)"|'([^']*)'))|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/giu;

export function rewriteCssUrls(value: string, rewrite: (url: string) => string): string {
  return value.replace(cssToken, (token, double, single, unquoted, importDouble, importSingle) => {
    const url: string | undefined = double ?? single ?? unquoted ?? importDouble ?? importSingle;
    if (url === undefined) return token;
    const mapped = rewrite(url);
    if (mapped === url) return token;
    const quoted = `"${mapped.replace(/[\\"]/gu, "\\$&")}"`;
    return token.startsWith("@") ? `@import ${quoted}` : `url(${quoted})`;
  });
}
