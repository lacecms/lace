// @ts-nocheck
// TODO(rf2): Type recursive descriptor fixtures, malformed runtime inputs and table tuples.
import { describe, test, expect } from "vitest";
import { encodeEntryLink, decodeEntryLink } from "./internal-link-tokens.js";
import { isUrlFieldTarget, isSafeUrl, validateRichTextDocument } from "./rich-text.js";
import {
  validateFieldValue,
  validateModelFields,
  validateSnapshotListBudget,
} from "./validation.js";
import { field } from "./builders.js";
import { toFieldMetadata } from "./metadata.js";
import { ContentValidationError, FieldConfigurationError } from "../shared/errors.js";
import { defineBlock, validateBlockData } from "../blocks/definition.js";
import { issueFrom } from "../test-support/content-test-helpers.js";

describe("canonical internal URL targets", () => {
  test.each(["opaque-id", "a/b", "a?b#c%", "日本語 🧵", "a b", "x".repeat(255)])(
    "round-trips opaque ID %s without broadening href safety",
    (id) => {
      const token = encodeEntryLink(id);
      expect(decodeEntryLink(token)).toBe(id);
      expect(isUrlFieldTarget(token)).toBe(true);
      expect(isSafeUrl(token)).toBe(false);
      expect(validateFieldValue(field.url(), token)).toBe(token);
      expect(validateFieldValue(toFieldMetadata(field.url()), token)).toBe(token);
      expect(() =>
        validateFieldValue(field.url({ embedProviders: ["youtube", "vimeo"] }), token),
      ).toThrow();
      expect(() =>
        validateRichTextDocument({
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: "Link", marks: [{ type: "link", attrs: { href: token } }] },
              ],
            },
          ],
        }),
      ).toThrow();
    },
  );
  test.each(["", "x".repeat(256), "a\u0000b", "a\u0085b", "\ud800", "\udfff"])(
    "refuses invalid IDs",
    (id) => expect(() => encodeEntryLink(id)).toThrow(),
  );
  test.each([
    "entry:",
    "entry:%ZZ",
    "entry:%",
    "entry:%70ost-a",
    "entry:a%2fb",
    "entry:a/b",
    "entry:post-a#x",
    "entry:post-a?x",
    "entry:%ED%A0%80",
    "entry:%00",
    "entry:%C2%85",
    "entry:日本語",
  ])("refuses malformed or noncanonical token %s", (token) => {
    expect(decodeEntryLink(token)).toBeUndefined();
    expect(isUrlFieldTarget(token)).toBe(false);
    expect(() => validateFieldValue(field.url(), token)).toThrow();
  });
  test.each([
    "/about#team",
    "#section",
    "https://example.com/a?q=b",
    "mailto:hi@example.com",
    "tel:+123",
  ])("preserves manual URL %s", (value) => {
    expect(decodeEntryLink(value)).toBeUndefined();
    expect(validateFieldValue(field.url(), value)).toBe(value);
  });
});

test("allows only the confirmed rich-text grammar and URL policy", () => {
  const document = {
    content: [
      {
        attrs: { level: 2 },
        content: [
          {
            marks: [
              { type: "bold" },
              { type: "code" },
              { type: "italic" },
              { type: "strike" },
              { attrs: { href: "https://lacecms.dev" }, type: "link" },
            ],
            text: "Heading",
            type: "text",
          },
        ],
        type: "heading",
      },
      {
        content: [{ content: [{ text: "Item", type: "text" }], type: "paragraph" }],
        type: "blockquote",
      },
      {
        content: [
          {
            content: [{ content: [{ text: "Item", type: "text" }], type: "paragraph" }],
            type: "listItem",
          },
        ],
        type: "bulletList",
      },
      {
        content: [
          {
            content: [{ content: [{ text: "Item", type: "text" }], type: "paragraph" }],
            type: "listItem",
          },
        ],
        type: "orderedList",
      },
      { content: [{ text: "Line", type: "text" }, { type: "hardBreak" }], type: "paragraph" },
    ],
    type: "doc",
  };

  expect(validateRichTextDocument(document)).toEqual(document);
  expect(isSafeUrl("https://lacecms.dev/a")).toBe(true);
  expect(isSafeUrl("mailto:hello@lacecms.dev")).toBe(true);
  expect(isSafeUrl("tel:+3906123456")).toBe(true);
  expect(isSafeUrl("/about")).toBe(true);
  expect(isSafeUrl("#features")).toBe(true);
  expect(isSafeUrl("//lacecms.dev")).toBe(false);
  expect(isSafeUrl("javascript:alert(1)")).toBe(false);
  expect(() => validateRichTextDocument({ content: [{ type: "html" }], type: "doc" })).toThrow(
    /\$\.content\[0\]\.type/u,
  );
  expect(() =>
    validateRichTextDocument({
      content: [{ attrs: { style: "color:red" }, text: "bad", type: "text" }],
      type: "doc",
    }),
  ).toThrow(/\$\.content\[0\]\.attrs/u);
  expect(() =>
    validateRichTextDocument({
      content: [
        {
          marks: [{ attrs: { href: "javascript:alert(1)" }, type: "link" }],
          text: "bad",
          type: "text",
        },
      ],
      type: "doc",
    }),
  ).toThrow(/href/u);
});

const plainCode = {
  content: [{ text: "\t  <script>&\nline two\n", type: "text" }],
  type: "codeBlock",
};

const expandedDocument = {
  content: [
    ...[1, 2, 3, 4].map((level) => ({ attrs: { level }, type: "heading" })),
    { type: "horizontalRule" },
    plainCode,
    { type: "codeBlock" },
    { content: [], type: "codeBlock" },
    { content: [plainCode, { type: "horizontalRule" }], type: "blockquote" },
    {
      content: [{ content: [plainCode, { type: "horizontalRule" }], type: "listItem" }],
      type: "bulletList",
    },
    ...[{}, { target: "_blank" }, { rel: "nofollow" }, { rel: "nofollow", target: "_blank" }].map(
      (attrs) => ({
        content: [
          {
            marks: [{ attrs: { href: "/safe", ...attrs }, type: "link" }],
            text: "Link",
            type: "text",
          },
        ],
        type: "paragraph",
      }),
    ),
  ],
  type: "doc",
};

test("expanded and existing rich text keeps its exact content and all four link choices", () => {
  expect(validateRichTextDocument(expandedDocument)).toBe(expandedDocument);
});

const unsupportedRichNodes = [
  { attrs: { level: 5 }, type: "heading" },
  { attrs: { language: null }, type: "codeBlock" },
  { attrs: { language: "js" }, ...plainCode },
  { content: [{ marks: [], text: "x", type: "text" }], type: "codeBlock" },
  { content: [{ marks: [{ type: "bold" }], text: "x", type: "text" }], type: "codeBlock" },
  { content: [{ type: "hardBreak" }], type: "codeBlock" },
  { content: [{ type: "paragraph" }], type: "codeBlock" },
  { content: null, type: "codeBlock" },
  { content: [], type: "horizontalRule" },
  { attrs: {}, type: "horizontalRule" },
  { content: [plainCode], type: "paragraph" },
  ...[
    { target: "_self" },
    { target: null },
    { target: "" },
    { rel: null },
    { rel: "" },
    { rel: "noopener" },
    { rel: "noreferrer" },
    { rel: "nofollow noopener" },
    { onclick: "alert(1)" },
    { href: "javascript:alert(1)", target: "_blank", rel: "nofollow" },
  ].map((attrs) => ({
    content: [
      { marks: [{ attrs: { href: "/safe", ...attrs }, type: "link" }], text: "Link", type: "text" },
    ],
    type: "paragraph",
  })),
];

test.each(unsupportedRichNodes)("rejects unsupported expanded rich-text input %#", (node) => {
  const document = { content: [node], type: "doc" };
  expect(() => validateRichTextDocument(document)).toThrow(ContentValidationError);
  expect(() => field.richText({ defaultValue: document })).toThrow(FieldConfigurationError);
});

test.each(["draft", "publish"])(
  "expanded nested defaults and block data share %s validation",
  (mode) => {
    const input = structuredClone(expandedDocument);
    const body = field.richText({ defaultValue: input, required: true });
    input.content.length = 0;
    expect(body.defaultValue).toEqual(expandedDocument);
    expect(Object.isFrozen(body.defaultValue.content)).toBe(true);
    const fields = { sections: field.list({ item: field.group({ fields: { body } }) }) };
    const values = { sections: [{}] };
    const expected = { sections: [{ body: expandedDocument }] };
    expect(validateModelFields(fields, values, mode)).toEqual(expected);
    const definition = defineBlock({ fields, type: "expanded", version: 1 });
    expect(validateBlockData(definition, values, mode)).toEqual(expected);
    const unsafe = { content: [unsupportedRichNodes[1]], type: "doc" };
    expect(
      issueFrom(() => validateModelFields(fields, { sections: [{ body: unsafe }] }, mode)).path,
    ).toEqual(["sections", 0, "body"]);
  },
);

test("rich-text nodes do not consume composite list budget and required semantics stay unchanged", () => {
  const document = { content: Array(501).fill(plainCode), type: "doc" };
  const fields = {
    sections: field.list({
      item: field.group({ fields: { body: field.richText({ required: true }) } }),
    }),
  };
  const values = { sections: [{ body: document }] };
  expect(() => validateSnapshotListBudget(fields, values, [])).not.toThrow();
  expect(validateModelFields(fields, { sections: [{}] }, "draft")).toEqual({ sections: [{}] });
  expect(() => validateModelFields(fields, { sections: [{}] }, "publish")).toThrow(
    ContentValidationError,
  );
  expect(() =>
    validateModelFields(fields, { sections: Array(101).fill({ body: document }) }, "draft"),
  ).toThrow(ContentValidationError);
});
