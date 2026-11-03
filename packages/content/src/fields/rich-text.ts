import { decodeEntryLink } from "./internal-link-tokens.js";
import type { ValidationPathSegment } from "../shared/errors.js";
import { invalid, assertExactKeys, ContentValidationError } from "../shared/errors.js";
import { isRecord } from "../shared/objects.js";

/** A mark permitted in Lace rich-text documents. */
export type SafeRichTextMark =
  | { readonly type: "bold" | "code" | "italic" | "strike" }
  | {
      readonly attrs: {
        readonly href: string;
        readonly target?: "_blank";
        readonly rel?: "nofollow";
      };
      readonly type: "link";
    };

/** A node permitted in Lace rich-text documents. */
export type SafeRichTextNode =
  | { readonly type: "hardBreak" | "horizontalRule" }
  | {
      readonly content?: readonly { readonly text: string; readonly type: "text" }[];
      readonly type: "codeBlock";
    }
  | { readonly marks?: readonly SafeRichTextMark[]; readonly text: string; readonly type: "text" }
  | { readonly content?: readonly SafeRichTextNode[]; readonly type: "paragraph" }
  | {
      readonly attrs: { readonly level: 1 | 2 | 3 | 4 };
      readonly content?: readonly SafeRichTextNode[];
      readonly type: "heading";
    }
  | { readonly content: readonly SafeRichTextNode[]; readonly type: "bulletList" | "orderedList" }
  | { readonly content: readonly SafeRichTextNode[]; readonly type: "listItem" }
  | { readonly content: readonly SafeRichTextNode[]; readonly type: "blockquote" };

/** The closed, safe Tiptap document representation supported by Lace. */
export interface SafeRichTextDocument {
  readonly content: readonly SafeRichTextNode[];
  readonly type: "doc";
}

/** Returns whether a URL is permitted as an href, including rich-text links. */
export function isSafeUrl(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    /\s/u.test(value) ||
    value.includes(String.fromCodePoint(0))
  ) {
    return false;
  }
  if (value.startsWith("#")) {
    return true;
  }
  if (value.startsWith("/")) {
    return !value.startsWith("//");
  }
  return /^(?:https?:\/\/[^/?#\s]+(?:[/?#][^\s]*)?|mailto:[^\s@]+@[^\s@]+|tel:\+?[0-9(). -]+)$/u.test(
    value,
  );
}

/** Ordinary URL fields support safe manual URLs and canonical entry tokens. */
export function isUrlFieldTarget(value: unknown): value is string {
  return isSafeUrl(value) || decodeEntryLink(value) !== undefined;
}

function assertMarks(value: unknown, path: readonly ValidationPathSegment[]): void {
  if (!Array.isArray(value)) {
    invalid(path, "invalid_marks", "must be an array.");
  }
  for (const [index, mark] of value.entries()) {
    const markPath = [...path, index];
    if (!isRecord(mark) || typeof mark.type !== "string") {
      invalid(markPath, "invalid_mark", "must be a mark object.");
    }
    if (mark.type === "link") {
      assertExactKeys(mark, ["attrs", "type"], [], markPath);
      if (!isRecord(mark.attrs)) {
        invalid([...markPath, "attrs"], "invalid_link_attributes", "must be an object.");
      }
      assertExactKeys(mark.attrs, ["href"], ["target", "rel"], [...markPath, "attrs"]);
      if (Object.hasOwn(mark.attrs, "target") && mark.attrs.target !== "_blank") {
        invalid([...markPath, "attrs", "target"], "invalid_link_target", 'must be "_blank".');
      }
      if (Object.hasOwn(mark.attrs, "rel") && mark.attrs.rel !== "nofollow") {
        invalid([...markPath, "attrs", "rel"], "invalid_link_rel", 'must be "nofollow".');
      }
      if (!isSafeUrl(mark.attrs.href)) {
        invalid([...markPath, "attrs", "href"], "unsafe_url", "must be an approved URL.");
      }
      continue;
    }
    if (
      mark.type === "bold" ||
      mark.type === "code" ||
      mark.type === "italic" ||
      mark.type === "strike"
    ) {
      assertExactKeys(mark, ["type"], [], markPath);
      continue;
    }
    invalid([...markPath, "type"], "unknown_mark", "is not permitted.");
  }
}

function assertRichTextChildren(
  value: unknown,
  path: readonly ValidationPathSegment[],
  allowed: readonly SafeRichTextNode["type"][],
): void {
  if (!Array.isArray(value)) {
    invalid(path, "invalid_content", "must be an array.");
  }
  for (const [index, child] of value.entries()) {
    assertRichTextNode(child, [...path, index]);
    if (!allowed.includes(child.type)) {
      invalid([...path, index, "type"], "invalid_child", "is not permitted in this node.");
    }
  }
}

function assertRichTextNode(
  value: unknown,
  path: readonly ValidationPathSegment[],
): asserts value is SafeRichTextNode {
  if (!isRecord(value) || typeof value.type !== "string") {
    invalid(path, "invalid_node", "must be a rich-text node object.");
  }

  if (value.type === "text") {
    assertExactKeys(value, ["text", "type"], ["marks"], path);
    if (typeof value.text !== "string") {
      invalid([...path, "text"], "invalid_text", "must be a string.");
    }
    if (Object.hasOwn(value, "marks")) {
      assertMarks(value.marks, [...path, "marks"]);
    }
    return;
  }

  if (value.type === "hardBreak" || value.type === "horizontalRule") {
    assertExactKeys(value, ["type"], [], path);
    return;
  }

  if (value.type === "codeBlock") {
    assertExactKeys(value, ["type"], ["content"], path);
    if (Object.hasOwn(value, "content")) {
      assertRichTextChildren(value.content, [...path, "content"], ["text"]);
      for (const [index, child] of (
        value.content as readonly Record<string, unknown>[]
      ).entries()) {
        assertExactKeys(child, ["type", "text"], [], [...path, "content", index]);
      }
    }
    return;
  }

  if (value.type === "paragraph") {
    assertExactKeys(value, ["type"], ["content"], path);
    if (Object.hasOwn(value, "content")) {
      assertRichTextChildren(value.content, [...path, "content"], ["hardBreak", "text"]);
    }
    return;
  }

  if (value.type === "heading") {
    assertExactKeys(value, ["attrs", "type"], ["content"], path);
    if (!isRecord(value.attrs)) {
      invalid([...path, "attrs"], "invalid_heading_attributes", "must be an object.");
    }
    assertExactKeys(value.attrs, ["level"], [], [...path, "attrs"]);
    if (
      value.attrs.level !== 1 &&
      value.attrs.level !== 2 &&
      value.attrs.level !== 3 &&
      value.attrs.level !== 4
    ) {
      invalid([...path, "attrs", "level"], "invalid_heading_level", "must be 1, 2, 3, or 4.");
    }
    if (Object.hasOwn(value, "content")) {
      assertRichTextChildren(value.content, [...path, "content"], ["hardBreak", "text"]);
    }
    return;
  }

  if (value.type === "bulletList" || value.type === "orderedList") {
    assertExactKeys(value, ["content", "type"], [], path);
    assertRichTextChildren(value.content, [...path, "content"], ["listItem"]);
    return;
  }

  if (value.type === "listItem") {
    assertExactKeys(value, ["content", "type"], [], path);
    assertRichTextChildren(
      value.content,
      [...path, "content"],
      ["bulletList", "orderedList", "paragraph", "horizontalRule", "codeBlock"],
    );
    return;
  }

  if (value.type === "blockquote") {
    assertExactKeys(value, ["content", "type"], [], path);
    assertRichTextChildren(
      value.content,
      [...path, "content"],
      ["bulletList", "orderedList", "paragraph", "horizontalRule", "codeBlock"],
    );
    return;
  }

  invalid([...path, "type"], "unknown_node", "is not permitted.");
}

/** Validates and returns a closed, safe rich-text document. */
export function validateRichTextDocument(value: unknown): SafeRichTextDocument {
  if (!isRecord(value) || value.type !== "doc") {
    invalid([], "invalid_document", "must be a doc node.");
  }
  assertExactKeys(value, ["content", "type"], [], []);
  assertRichTextChildren(
    value.content,
    ["content"],
    [
      "blockquote",
      "bulletList",
      "heading",
      "orderedList",
      "paragraph",
      "horizontalRule",
      "codeBlock",
    ],
  );
  return value as unknown as SafeRichTextDocument;
}

export function isSafeRichTextDocument(value: unknown): value is SafeRichTextDocument {
  try {
    validateRichTextDocument(value);
    return true;
  } catch (error) {
    if (error instanceof ContentValidationError) {
      return false;
    }
    throw error;
  }
}
