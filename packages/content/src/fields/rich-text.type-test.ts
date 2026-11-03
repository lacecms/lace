import { field } from "../index.js";
import type { SafeRichTextDocument } from "../index.js";

const expandedRichText: SafeRichTextDocument = {
  content: [
    { attrs: { level: 4 }, type: "heading" },
    { type: "horizontalRule" },
    { content: [{ text: "\tcode\n", type: "text" }], type: "codeBlock" },
    {
      content: [
        {
          marks: [{ attrs: { href: "/", target: "_blank", rel: "nofollow" }, type: "link" }],
          text: "link",
          type: "text",
        },
      ],
      type: "paragraph",
    },
  ],
  type: "doc",
};
field.richText({ defaultValue: expandedRichText });
const invalidRichText: SafeRichTextDocument = {
  content: [
    // @ts-expect-error unsupported heading level
    { attrs: { level: 5 }, type: "heading" },
    // @ts-expect-error plain code has no language attribute
    { attrs: { language: "js" }, type: "codeBlock" },
    // @ts-expect-error code children have no marks
    { content: [{ marks: [], text: "x", type: "text" }], type: "codeBlock" },
    {
      content: [
        {
          marks: [
            // @ts-expect-error renderer safety tokens are not stored rel values
            { attrs: { href: "/", rel: "noopener" }, type: "link" },
            // @ts-expect-error current-context links omit target
            { attrs: { href: "/", target: "_self" }, type: "link" },
          ],
          text: "x",
          type: "text",
        },
      ],
      type: "paragraph",
    },
  ],
  type: "doc",
};
void invalidRichText;
