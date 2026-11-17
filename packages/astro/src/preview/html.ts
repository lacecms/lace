import { parse, serialize } from "parse5";
import type { DefaultTreeAdapterTypes } from "parse5";
import { rewriteCssUrls, rewriteSrcset } from "./resource-values.js";
import type { previewUrls } from "./urls.js";

const sources = new Set([
  "audio",
  "embed",
  "frame",
  "iframe",
  "img",
  "input",
  "script",
  "source",
  "track",
  "video",
]);
const resourceRel = new Set([
  "apple-touch-icon",
  "icon",
  "manifest",
  "mask-icon",
  "modulepreload",
  "prefetch",
  "preload",
  "stylesheet",
]);

type Element = DefaultTreeAdapterTypes.Element;
type Node = DefaultTreeAdapterTypes.Node;

function setAttr(element: Element, name: string, value: string) {
  const attribute = element.attrs.find((item) => item.name === name);
  if (attribute === undefined) element.attrs.push({ name, value });
  else attribute.value = value;
}

function rewriteElement(element: Element, urls: ReturnType<typeof previewUrls>) {
  const { tagName, attrs } = element;
  if (tagName === "base")
    throw new Error(
      "PREVIEW_CONFIGURATION_UNAVAILABLE: remove the HTML base element from preview pages.",
    );
  if (
    tagName === "meta" &&
    attrs.some(
      ({ name, value }) => name === "http-equiv" && value.toLowerCase().trim() === "refresh",
    )
  )
    throw new Error("PREVIEW_RENDER_FAILED: the preview page must not redirect.");

  const get = (name: string) => attrs.find((attribute) => attribute.name === name);
  const href = get("href");
  const rel = get("rel")?.value.trim().split(/\s+/u).filter(Boolean) ?? [];
  if ((tagName === "a" || tagName === "area") && href !== undefined) {
    const result = urls.anchor(href.value, get("download") !== undefined);
    href.value = result.href;
    if (result.page) {
      const links = new Map(
        rel
          .filter((value) => value.toLowerCase() !== "opener")
          .map((value) => [value.toLowerCase(), value]),
      );
      links.set("noopener", "noopener");
      links.set("noreferrer", "noreferrer");
      setAttr(element, "rel", [...links.values()].join(" "));
      setAttr(element, "target", "_blank");
    }
  } else if (
    href !== undefined &&
    ((tagName === "link" && rel.some((item) => resourceRel.has(item.toLowerCase()))) ||
      ["image", "use", "feImage"].includes(tagName))
  )
    href.value = urls.resource(href.value);

  for (const attribute of attrs) {
    const { name, value } = attribute;
    if (
      (name === "src" && sources.has(tagName)) ||
      (name === "poster" && tagName === "video") ||
      (name === "background" && ["body", "table", "td"].includes(tagName)) ||
      (name === "data" && tagName === "object")
    )
      attribute.value = urls.resource(value);
    else if (name === "srcset" || name === "imagesrcset")
      attribute.value = rewriteSrcset(value, urls.resource);
    else if (name === "style") attribute.value = rewriteCssUrls(value, urls.resource);
  }
  if (tagName === "style") {
    for (const child of element.childNodes) {
      if ("value" in child) child.value = rewriteCssUrls(child.value, urls.resource);
    }
  }
}

/** Parse the real document tree, including inert template content and SVG resource links. */
export function transformPreviewHtml(html: string, urls: ReturnType<typeof previewUrls>): string {
  const document = parse(html, { scriptingEnabled: true });
  const nodes: Node[] = [document];
  for (let node = nodes.pop(); node !== undefined; node = nodes.pop()) {
    if ("tagName" in node) rewriteElement(node, urls);
    if ("content" in node) nodes.push(node.content as DefaultTreeAdapterTypes.DocumentFragment);
    if ("childNodes" in node) for (const child of node.childNodes) nodes.push(child);
  }
  return serialize(document);
}
