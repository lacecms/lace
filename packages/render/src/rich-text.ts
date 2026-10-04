import { ContentValidationError, isSafeUrl, validateRichTextDocument } from "@lacecms/content";
import type { SafeRichTextMark, SafeRichTextNode, ValidationPathSegment } from "@lacecms/content";
import { LaceRenderError } from "./errors.js";
import type { BlockContext } from "./errors.js";

/** Where a rich-text value comes from, for render failures. */
export interface RichTextContext {
  readonly block?: BlockContext;
  readonly fieldPath?: readonly ValidationPathSegment[];
}

/** The rich-text node and mark names that can originate an element. */
export type RichTextSource = Exclude<SafeRichTextNode["type"], "text"> | SafeRichTextMark["type"];

/** The fixed set of tags a rich-text description can contain. */
export type RichTextTag =
  | "a"
  | "blockquote"
  | "br"
  | "code"
  | "em"
  | "h1"
  | "h2"
  | "h3"
  | "li"
  | "ol"
  | "p"
  | "s"
  | "strong"
  | "ul";

/** Plain text that adapters must escape. */
export interface RichTextTextDescription {
  readonly kind: "text";
  readonly text: string;
}

/** An allowlisted element with only safe attributes. */
export interface RichTextElementDescription {
  readonly attributes: Readonly<{ href?: string }>;
  readonly children: readonly RichTextDescriptionNode[];
  readonly kind: "element";
  readonly source: RichTextSource;
  readonly tag: RichTextTag;
}

export type RichTextDescriptionNode = RichTextElementDescription | RichTextTextDescription;

const noAttributes: Readonly<{ href?: string }> = Object.freeze({});

function element(
  tag: RichTextTag,
  source: RichTextSource,
  children: readonly RichTextDescriptionNode[],
  attributes: Readonly<{ href?: string }> = noAttributes,
): RichTextElementDescription {
  return Object.freeze({
    attributes,
    children: Object.freeze([...children]),
    kind: "element",
    source,
    tag,
  });
}

function describeMarks(text: string, marks: readonly SafeRichTextMark[]): RichTextDescriptionNode {
  // The first mark is outermost, matching Tiptap's mark order.
  let node: RichTextDescriptionNode = Object.freeze({ kind: "text", text });
  for (const mark of [...marks].reverse()) {
    if (mark.type === "link") {
      if (!isSafeUrl(mark.attrs.href)) throw new TypeError("Unsafe link reached rendering.");
      node = element("a", "link", [node], Object.freeze({ href: mark.attrs.href }));
    } else if (mark.type === "bold") node = element("strong", "bold", [node]);
    else if (mark.type === "italic") node = element("em", "italic", [node]);
    else if (mark.type === "strike") node = element("s", "strike", [node]);
    else node = element("code", "code", [node]);
  }
  return node;
}

function describeNodes(nodes: readonly SafeRichTextNode[] | undefined): RichTextDescriptionNode[] {
  return (nodes ?? []).map(describeNode);
}

function describeNode(node: SafeRichTextNode): RichTextDescriptionNode {
  switch (node.type) {
    case "text":
      return describeMarks(node.text, node.marks ?? []);
    case "hardBreak":
      return element("br", "hardBreak", []);
    case "paragraph":
      return element("p", "paragraph", describeNodes(node.content));
    case "heading":
      return element(`h${node.attrs.level}`, "heading", describeNodes(node.content));
    case "bulletList":
      return element("ul", "bulletList", describeNodes(node.content));
    case "orderedList":
      return element("ol", "orderedList", describeNodes(node.content));
    case "listItem":
      return element("li", "listItem", describeNodes(node.content));
    case "blockquote":
      return element("blockquote", "blockquote", describeNodes(node.content));
  }
}

/**
 * Validates a rich-text document with the shared Lace allowlist and describes it
 * as allowlisted elements and text. No raw HTML is produced.
 */
export function describeRichText(
  value: unknown,
  context: RichTextContext = {},
): readonly RichTextDescriptionNode[] {
  let document;
  try {
    document = validateRichTextDocument(value);
  } catch (error) {
    if (error instanceof ContentValidationError) {
      const issue = error.issues[0];
      throw new LaceRenderError(
        "invalid_rich_text",
        issue === undefined ? error.message : issue.message,
        {
          cause: error,
          ...(context.block === undefined ? {} : { context: context.block }),
          fieldPath: [...(context.fieldPath ?? []), ...(issue?.path ?? [])],
        },
      );
    }
    throw error;
  }
  return Object.freeze(describeNodes(document.content));
}
