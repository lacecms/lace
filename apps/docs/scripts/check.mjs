import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseHTML } from "linkedom";
import catalog, { validateCatalog } from "../src/catalog.mjs";

export function files(root) {
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}
export function validateSources(root, definition = catalog) {
  validateCatalog(definition);
  const slugs = new Set();
  for (const file of files(root).filter((path) => /\.mdx?$/.test(path))) {
    const relative = file.slice(root.length + 1).replaceAll("\\", "/");
    const [locale, version] = relative.replace(/\.mdx?$/, "").split("/");
    if (!definition.locales[locale] || !definition.versions[version])
      throw new Error(`${relative}: unknown locale/version`);
    const slug = relative.replace(/\.mdx?$/, "").replace(/\/index$/, "");
    if (slugs.has(slug)) throw new Error(`${relative}: duplicate route ${slug}`);
    slugs.add(slug);
    const text = readFileSync(file, "utf8");
    if (!/^---\n[\s\S]*?title: .+\n[\s\S]*?description: .+\n[\s\S]*?---/.test(text))
      throw new Error(`${relative}: missing title/description`);
  }
  for (const locale of Object.keys(definition.locales))
    for (const version of Object.keys(definition.versions)) {
      if (!slugs.has(`${locale}/${version}`))
        throw new Error(`Missing landing page ${locale}/${version}`);
      for (const section of Object.keys(definition.sections))
        if (!slugs.has(`${locale}/${version}/${section}`))
          throw new Error(`Missing section ${locale}/${version}/${section}`);
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
  if (
    readFileSync(join(app, "dist/reference/openapi.json"), "utf8") !==
    readFileSync(join(app, "../api/openapi/api-v1.json"), "utf8")
  )
    throw new Error("OpenAPI copy differs");
  if (!existsSync(join(app, "dist/pagefind/pagefind.js"))) throw new Error("Missing search index");
  console.log(`Verified ${count} documentation pages, local links/fragments/resources and OpenAPI`);
}
