import { SITE_MODES } from "./site.js";
import type { SiteMode, SiteSelection } from "./site.js";

export class TemplateError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "TemplateError";
  }
}

/**
 * Marker comment syntax per template file type. Group 1 is content before a
 * trailing marker (formatters may move a comment onto the previous line).
 */
function markerPattern(path: string): RegExp {
  if (path.endsWith(".md")) return /^()\s*<!--\s*lace-site:\s*(.*?)\s*-->\s*$/u;
  if (path.endsWith(".jsonc")) return /^(.*?)\s*\/\/\s*lace-site:\s*(.*?)\s*$/u;
  // \x23 is "#"; a bare "#" here stalls the boundary checker's TypeScript scanner.
  return /^(.*?)\s*\x23\s*lace-site:\s*(.*?)\s*$/u;
}

/**
 * Keeps `lace-site: <modes>` … `lace-site: end` blocks whose mode list contains
 * the selected mode, drops the others and removes every marker. Blocks may nest;
 * a line is kept only when every enclosing block includes the mode. A blank line
 * that would double another at a removal seam is dropped, so formatter spacing
 * around markers does not leak. Unbalanced or unknown markers fail.
 */
export function renderSiteMarkers(text: string, path: string, mode: SiteMode): string {
  const pattern = markerPattern(path);
  const output: string[] = [];
  const open: (readonly string[])[] = [];
  let seam = false;
  const keep = (line: string): void => {
    if (open.some((modes) => !modes.includes(mode))) {
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
      if (line.includes("lace-site:"))
        throw new TemplateError(`${path}:${index + 1}: malformed lace-site marker.`);
      keep(line);
      continue;
    }
    const [, content = "", marker = ""] = match;
    if (content.trim().length > 0) keep(content);
    seam = true;
    if (marker === "end") {
      if (open.pop() === undefined)
        throw new TemplateError(`${path}:${index + 1}: lace-site end without a block.`);
      continue;
    }
    const modes = marker.split(/\s+/u);
    if (modes.some((item) => !SITE_MODES.includes(item as SiteMode)))
      throw new TemplateError(`${path}:${index + 1}: unknown lace-site mode in "${marker}".`);
    open.push(modes);
  }
  if (open.length > 0) throw new TemplateError(`${path}: unterminated lace-site block.`);
  return output.join("\n");
}

function sitePath(site: SiteSelection): string {
  return site.mode === "existing" ? site.path : "site";
}

/** Adjusts root scripts; starter output equals the committed template bytes. */
export function renderRootPackage(text: string, site: SiteSelection): string {
  const manifest = JSON.parse(text) as { scripts: Record<string, string> };
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

/** Applies the site-mode transform for one template after name interpolation. */
export function renderForSite(
  text: string,
  path: string,
  kind: RenderKind,
  site: SiteSelection,
): string {
  if (kind === "root-package") return renderRootPackage(text, site);
  if (kind === "workspace") return renderWorkspace(text, site);
  return renderSiteMarkers(text, path, site.mode).replaceAll("{{SITE_PATH}}", sitePath(site));
}
