import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseHTML } from "linkedom";
import { parse } from "yaml";
import catalog, { validateCatalog } from "../src/catalog.mjs";

export function files(root) {
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}
const kinds = new Set(["overview", "guide", "reference"]);

/** The release metadata whose versions a page may declare as verified against. */
export function readRelease(
  path = fileURLToPath(new URL("../../../release/alpha.json", import.meta.url)),
) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** Versions a page may name: the current release or a published non-alpha release. */
export function verifiableVersions(release) {
  return new Set([
    release.version,
    ...release.publishedVersions.filter((version) => !version.includes("-alpha.")),
  ]);
}

/** Second-level headings outside fenced code, with the text of each section. */
export function sections(body) {
  const result = [];
  let fence;
  let current = { heading: undefined, text: "" };
  for (const line of body.split("\n")) {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker && (!fence || (marker[0] === fence[0] && marker.length >= fence.length)))
      fence = fence ? undefined : marker;
    if (!fence && line.startsWith("## ")) {
      result.push(current);
      current = { heading: line.slice(3).trim(), text: "" };
    } else current.text += `${line}\n`;
  }
  result.push(current);
  return result;
}

function validateTemplate(relative, slug, data, body) {
  const kind = data.kind;
  if (!kinds.has(kind)) throw new Error(`${relative}: unknown kind ${JSON.stringify(kind)}`);
  const inReference = /^[^/]+\/[^/]+\/reference(?:\/|$)/.test(slug);
  if (kind === "reference" && !inReference)
    throw new Error(`${relative}: reference page outside the Reference section`);
  const [intro, ...parts] = sections(body);
  if (kind === "overview") {
    if (parts.length > 0) throw new Error(`${relative}: overview page has task sections`);
    if (!/\]\([^)]+\)/.test(intro.text))
      throw new Error(`${relative}: overview page links nothing`);
  }
  if (kind !== "guide") return;
  if (!intro.text.trim()) throw new Error(`${relative}: guide has no purpose paragraph`);
  if (parts[0]?.heading !== "Before you start")
    throw new Error(`${relative}: guide must open with "Before you start"`);
  if (parts.length < 3) throw new Error(`${relative}: guide has no task section`);
  const last = parts.at(-1);
  if (last.heading !== "Reference") throw new Error(`${relative}: guide must end with "Reference"`);
  if (!/\]\([^)]*reference\/[^)]*\)/.test(last.text))
    throw new Error(`${relative}: "Reference" links no Reference page`);
}

function validatePage(relative, slug, text, versions) {
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  const data = match ? (parse(match[1]) ?? {}) : {};
  if (!data.title || !data.description) throw new Error(`${relative}: missing title/description`);
  if (!versions.has(data.verifiedAgainst))
    throw new Error(
      `${relative}: verifiedAgainst ${JSON.stringify(data.verifiedAgainst)} is not the current or a published non-alpha release`,
    );
  validateTemplate(relative, slug, data, text.slice(match[0].length));
}

/** Validates every page and reports all page errors together, one per line. */
export function validateSources(root, definition = catalog, release = readRelease()) {
  validateCatalog(definition);
  const tracking = definition.versions[definition.defaultVersion];
  if (tracking.target !== release.version)
    throw new Error(
      `catalog target ${tracking.target} differs from release version ${release.version}`,
    );
  const versions = verifiableVersions(release);
  const slugs = new Set();
  const errors = [];
  for (const file of files(root).filter((path) => /\.mdx?$/.test(path))) {
    const relative = file.slice(root.length + 1).replaceAll("\\", "/");
    const [locale, version] = relative.replace(/\.mdx?$/, "").split("/");
    if (!definition.locales[locale] || !definition.versions[version])
      throw new Error(`${relative}: unknown locale/version`);
    const slug = relative.replace(/\.mdx?$/, "").replace(/\/index$/, "");
    if (slugs.has(slug)) throw new Error(`${relative}: duplicate route ${slug}`);
    slugs.add(slug);
    try {
      validatePage(relative, slug, readFileSync(file, "utf8"), versions);
    } catch (error) {
      errors.push(error.message);
    }
  }
  if (errors.length) throw new Error(errors.join("\n"));
  for (const locale of Object.keys(definition.locales))
    for (const version of Object.keys(definition.versions)) {
      if (!slugs.has(`${locale}/${version}`))
        throw new Error(`Missing landing page ${locale}/${version}`);
      for (const section of Object.keys(definition.sections))
        if (!slugs.has(`${locale}/${version}/${section}`))
          throw new Error(`Missing section ${locale}/${version}/${section}`);
    }
}
/** Every built page of the given section shows the verified-against footer line once. */
export function checkFooters(root) {
  for (const file of files(root).filter((path) => path.endsWith(".html"))) {
    const count = parseHTML(readFileSync(file, "utf8")).document.querySelectorAll(
      ".verified-against",
    ).length;
    if (count !== 1)
      throw new Error(`${file}: expected one verified-against footer, found ${count}`);
  }
}
export function checkOutput(root, base = "/lace/") {
  const html = new Map();
  const all = files(root);
  for (const file of all.filter((path) => path.endsWith(".html")))
    html.set(file, parseHTML(readFileSync(file, "utf8")).document);
  for (const [file, document] of html) {
    const route = base + file.slice(root.length + 1).replace(/index\.html$/, "");
    for (const element of document.querySelectorAll("a[href], link[href], img[src], script[src]")) {
      if (element.getAttribute("rel") === "canonical") continue;
      const raw = element.getAttribute("href") ?? element.getAttribute("src");
      const url = new URL(raw, `https://lacecms.github.io${route}`);
      if (url.origin !== "https://lacecms.github.io") continue;
      if (!url.pathname.startsWith(base)) throw new Error(`${file}: link escapes base: ${raw}`);
      const path = decodeURIComponent(url.pathname.slice(base.length));
      let target = resolve(root, path);
      if (existsSync(target) && statSync(target).isDirectory()) target = join(target, "index.html");
      if (!existsSync(target)) throw new Error(`${file}: missing local target ${raw}`);
      if (
        url.hash &&
        html.has(target) &&
        !html.get(target).getElementById(decodeURIComponent(url.hash.slice(1)))
      )
        throw new Error(`${file}: missing fragment ${raw}`);
    }
  }
  if (all.some((path) => /\/(?:docs|archive|openspec)\//.test(path.slice(root.length))))
    throw new Error("Internal documentation leaked into output");
  return html.size;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const app = fileURLToPath(new URL("../", import.meta.url));
  validateSources(join(app, "src/content/docs"));
  const count = checkOutput(join(app, "dist"));
  for (const locale of Object.keys(catalog.locales))
    for (const version of Object.keys(catalog.versions))
      checkFooters(join(app, "dist", locale, version));
  if (
    readFileSync(join(app, "dist/reference/openapi.json"), "utf8") !==
    readFileSync(join(app, "../api/openapi/api-v1.json"), "utf8")
  )
    throw new Error("OpenAPI copy differs");
  if (!existsSync(join(app, "dist/pagefind/pagefind.js"))) throw new Error("Missing search index");
  console.log(`Verified ${count} documentation pages, local links/fragments/resources and OpenAPI`);
}
