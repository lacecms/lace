import { Extension, mergeAttributes, type JSONContent, type Extensions } from "@tiptap/core";
import Blockquote from "@tiptap/extension-blockquote";
import Bold from "@tiptap/extension-bold";
import BulletList from "@tiptap/extension-bullet-list";
import CodeBlock from "@tiptap/extension-code-block";
import HorizontalRule from "@tiptap/extension-horizontal-rule";
import Code from "@tiptap/extension-code";
import Document from "@tiptap/extension-document";
import HardBreak from "@tiptap/extension-hard-break";
import Heading from "@tiptap/extension-heading";
import Italic from "@tiptap/extension-italic";
import Link from "@tiptap/extension-link";
import ListItem from "@tiptap/extension-list-item";
import OrderedList from "@tiptap/extension-ordered-list";
import Paragraph from "@tiptap/extension-paragraph";
import Strike from "@tiptap/extension-strike";
import Text from "@tiptap/extension-text";
import { Placeholder, UndoRedo } from "@tiptap/extensions";
import { isSafeUrl } from "@lacecms/content";

/** The placeholder of an empty paragraph, also exposed as `aria-placeholder`. */
export const RICH_TEXT_PLACEHOLDER = "Write something…";

/** The heading levels permitted by the shared rich-text allowlist. */
export const HEADING_LEVELS = [1, 2, 3, 4] as const;
export type HeadingLevel = (typeof HEADING_LEVELS)[number];

/** Only document attributes supported by the shared rich-text contract. */
const SafeLink = Link.extend({
  addAttributes() {
    return {
      href: { default: null, parseHTML: (element: HTMLElement) => element.getAttribute("href") },
      target: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("target") === "_blank" ? "_blank" : null,
      },
      rel: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          (element.getAttribute("rel") ?? "").split(/\s+/u).includes("nofollow")
            ? "nofollow"
            : null,
      },
    };
  },
}).configure({
  autolink: false,
  HTMLAttributes: { rel: null, target: null },
  isAllowedUri: (href) => isSafeUrl(href),
  linkOnPaste: false,
  openOnClick: false,
  protocols: ["http", "https", "mailto", "tel"],
});

/** Strip only editor-default absent attributes, never unsupported present values. */
export function richTextDocument(node: JSONContent): JSONContent {
  return {
    ...node,
    ...(node.content ? { content: node.content.map(richTextDocument) } : {}),
    ...(node.marks
      ? {
          marks: node.marks.map((mark) => {
            if (mark.type !== "link" || !mark.attrs) return mark;
            return {
              ...mark,
              attrs: Object.fromEntries(
                Object.entries(mark.attrs).filter(
                  ([key, value]) => !((key === "target" || key === "rel") && value == null),
                ),
              ),
            };
          }),
        }
      : {}),
  };
}

const SafeCodeBlock = CodeBlock.extend({
  addAttributes() {
    return {};
  },
});

/** An ordered list without the `start` and `type` attributes the allowlist forbids. */
const SafeOrderedList = OrderedList.extend({
  addAttributes() {
    return {};
  },
  renderHTML({ HTMLAttributes }) {
    return ["ol", mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
  },
});

/** Callbacks for editor shortcuts that open React-owned controls. */
export interface RichTextShortcutHandlers {
  readonly focusToolbar: () => void;
  readonly openLink: () => void;
}

function editorShortcuts(handlers: { readonly current: RichTextShortcutHandlers }) {
  return Extension.create({
    name: "laceEditorShortcuts",
    addKeyboardShortcuts() {
      return {
        "Alt-F10": () => {
          handlers.current.focusToolbar();
          return true;
        },
        "Mod-k": () => {
          if (!this.editor.isEditable || this.editor.isActive("codeBlock")) return false;
          handlers.current.openLink();
          return true;
        },
      };
    },
  });
}

/**
 * The editor schema: exactly the shared allowlist of nodes, marks, heading
 * levels, and link forms, plus history, placeholders, and Lace shortcuts.
 */
export function richTextExtensions(
  handlers: {
    readonly current: RichTextShortcutHandlers;
  },
  placeholder?: { readonly current: string | undefined },
): Extensions {
  return [
    Document,
    Paragraph,
    Text,
    Heading.configure({ levels: [...HEADING_LEVELS] }),
    BulletList,
    SafeOrderedList,
    ListItem,
    Blockquote,
    HardBreak,
    HorizontalRule,
    SafeCodeBlock,
    Bold,
    Italic,
    Strike,
    Code,
    SafeLink,
    UndoRedo,
    Placeholder.configure({
      placeholder: ({ node }) =>
        placeholder?.current ??
        (node.type.name === "heading"
          ? `Heading ${String(node.attrs.level)}`
          : RICH_TEXT_PLACEHOLDER),
    }),
    editorShortcuts(handlers),
  ];
}
