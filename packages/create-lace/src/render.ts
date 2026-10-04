import { SITE_MODES } from "./site.js";
import type { SiteMode, SiteSelection } from "./site.js";

export class TemplateError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "TemplateError";
  }
}

type MarkerFamily = "lace-site" | "lace-cloudflare";

/**
 * Marker comment syntax per template file type. Group 1 is content before a
 * trailing marker (formatters may move a comment onto the previous line).
 */
function markerPattern(path: string, family: MarkerFamily): RegExp {
  if (path.endsWith(".md"))
    return new RegExp(`^()\\s*<!--\\s*${family}:\\s*(.*?)\\s*-->\\s*$`, "u");
  if (path.endsWith(".jsonc"))
    return new RegExp(`^(.*?)\\s*\\/\\/\\s*${family}:\\s*(.*?)\\s*$`, "u");
  // \x23 is "#"; a bare "#" here stalls the boundary checker's TypeScript scanner.
  return new RegExp(`^(.*?)\\s*\\x23\\s*${family}:\\s*(.*?)\\s*$`, "u");
}

/**
 * Keeps `<family>: <tokens>` … `<family>: end` blocks whose token list is
 * selected, drops the others and removes every marker of that family. Blocks may
 * nest; a line is kept only when every enclosing block is selected. A blank line
 * that would double another at a removal seam is dropped, so formatter spacing
 * around markers does not leak. Unbalanced or unknown markers fail.
 */
function renderMarkers(
  text: string,
  path: string,
  family: MarkerFamily,
  known: readonly string[],
  selected: (tokens: readonly string[]) => boolean,
  single = false,
): string {
  const pattern = markerPattern(path, family);
  const output: string[] = [];
  const open: boolean[] = [];
  let seam = false;
  const keep = (line: string): void => {
    if (open.includes(false)) {
      seam = true;
      return;
    }
    if (seam && line.trim() === "" && (output.at(-1) ?? "").trim() === "") return;
    output.push(line);
    seam = false;
  };
  for (const [index, line] of text.split("\n").entries()) {
    const match = pattern.exec(line);
    if (match === null) {
      if (line.includes(`${family}:`))
        throw new TemplateError(`${path}:${index + 1}: malformed ${family} marker.`);
      keep(line);
      continue;
    }
    const [, content = "", marker = ""] = match;
    if (content.trim().length > 0) keep(content);
    seam = true;
    if (marker === "end") {
      if (open.pop() === undefined)
        throw new TemplateError(`${path}:${index + 1}: ${family} end without a block.`);
      continue;
    }
    const tokens = marker.split(/\s+/u);
    if (tokens.some((item) => !known.includes(item)) || (single && tokens.length !== 1))
      throw new TemplateError(
        `${path}:${index + 1}: unknown ${family} ${family === "lace-site" ? "mode" : "value"} in "${marker}".`,
      );
    open.push(selected(tokens));
  }
  if (open.length > 0) throw new TemplateError(`${path}: unterminated ${family} block.`);
  return output.join("\n");
}

/** Keeps `lace-site: <modes>` blocks that list the selected site mode. */
export function renderSiteMarkers(text: string, path: string, mode: SiteMode): string {
  return renderMarkers(text, path, "lace-site", SITE_MODES, (modes) => modes.includes(mode));
}

/** Keeps `lace-cloudflare: on` blocks with `--cloudflare` and `off` blocks without it. */
export function renderCloudflareMarkers(text: string, path: string, cloudflare: boolean): string {
  return renderMarkers(
    text,
    path,
    "lace-cloudflare",
    ["on", "off"],
    (tokens) => tokens[0] === (cloudflare ? "on" : "off"),
    true,
  );
}

function sitePath(site: SiteSelection): string {
  return site.mode === "existing" ? site.path : "site";
}

/** Root dependencies and scripts that only Cloudflare projects receive. */
const CLOUDFLARE_DEPENDENCIES = ["@lacecms/db", "@lacecms/platform-cloudflare"] as const;

/** Adjusts root scripts and Worker dependencies; key order follows the template. */
export function renderRootPackage(text: string, site: SiteSelection, cloudflare = false): string {
  const manifest = JSON.parse(text) as {
    scripts: Record<string, string>;
    dependencies: Record<string, string>;
  };
  if (!cloudflare) {
    for (const name of Object.keys(manifest.scripts))
      if (name.startsWith("cf:")) delete manifest.scripts[name];
    for (const name of CLOUDFLARE_DEPENDENCIES) delete manifest.dependencies[name];
  }
  if (site.mode === "existing") {
    manifest.scripts.dev = `pnpm --dir ${site.path} exec astro dev`;
    manifest.scripts.build = `pnpm --dir ${site.path} exec astro build`;
    delete manifest.scripts.typecheck;
  } else if (site.mode === "none") {
    for (const name of ["dev", "build", "typecheck"]) delete manifest.scripts[name];
  }
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

/** Only the starter is a workspace package; other modes keep the settings alone. */
export function renderWorkspace(text: string, site: SiteSelection): string {
  if (site.mode === "starter") return text;
  const rendered = text.replace(/^packages:\n(?: {2}- .*\n)*\n?/u, "");
  if (rendered === text)
    throw new TemplateError("pnpm-workspace.yaml: expected a leading packages list.");
  return rendered;
}

export type RenderKind = "markers" | "root-package" | "workspace";

/** Applies the Cloudflare and site-mode transforms for one template after name interpolation. */
export function renderForSite(
  text: string,
  path: string,
  kind: RenderKind,
  site: SiteSelection,
  cloudflare = false,
): string {
  if (kind === "root-package") return renderRootPackage(text, site, cloudflare);
  if (kind === "workspace") return renderWorkspace(text, site);
  return renderSiteMarkers(
    renderCloudflareMarkers(text, path, cloudflare),
    path,
    site.mode,
  ).replaceAll("{{SITE_PATH}}", sitePath(site));
}
