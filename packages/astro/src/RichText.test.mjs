import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { expect, test } from "vitest";
import RichText from "./RichText.astro";
import Override from "../test-fixtures/RichTextOverride.astro";

const text = (value, marks) => ({
  text: value,
  type: "text",
  ...(marks === undefined ? {} : { marks }),
});
const doc = (...content) => ({ content, type: "doc" });
const paragraph = (...content) => ({ content, type: "paragraph" });
async function render(document, props = {}) {
  const container = await AstroContainer.create();
  return container.renderToString(RichText, { props: { document, ...props } });
}

test("existing formatting and H1–H4 render through the validated description", async () => {
  const html = await render(
    doc(
      ...[1, 2, 3, 4].map((level) => ({
        attrs: { level },
        content: [text(`H${level}`)],
        type: "heading",
      })),
      paragraph(
        text("safe", [{ type: "bold" }, { type: "italic" }, { type: "strike" }, { type: "code" }]),
        { type: "hardBreak" },
      ),
      { content: [{ content: [paragraph(text("List"))], type: "listItem" }], type: "orderedList" },
      { content: [paragraph(text("Quote"))], type: "blockquote" },
    ),
  );
  expect(html).toBe(
    "<h1>H1</h1><h2>H2</h2><h3>H3</h3><h4>H4</h4><p><strong><em><s><code>safe</code></s></em></strong><br></p><ol><li><p>List</p></li></ol><blockquote><p>Quote</p></blockquote>",
  );
});

test.each([
  [{}, '<a href="/safe">Link</a>'],
  [{ rel: "nofollow" }, '<a href="/safe" rel="nofollow">Link</a>'],
  [{ target: "_blank" }, '<a href="/safe" target="_blank" rel="noopener noreferrer">Link</a>'],
  [
    { target: "_blank", rel: "nofollow" },
    '<a href="/safe" target="_blank" rel="noopener noreferrer nofollow">Link</a>',
  ],
])("renders independent new-tab/nofollow choices %#", async (attrs, expected) => {
  expect(
    await render(
      doc(paragraph(text("Link", [{ attrs: { href: "/safe", ...attrs }, type: "link" }]))),
    ),
  ).toBe(`<p>${expected}</p>`);
});

test("void rules and escaped code preserve exact whitespace including leading newlines", async () => {
  const code = '\n\t  <script>alert("x")</script> &\n  tail\n';
  const block = { content: [text(code)], type: "codeBlock" };
  expect(
    await render(
      doc(
        { type: "horizontalRule" },
        block,
        { type: "codeBlock" },
        { content: [], type: "codeBlock" },
      ),
    ),
  ).toBe(
    "<hr><pre><code>\n\t  &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp;\n  tail\n</code></pre><pre><code></code></pre><pre><code></code></pre>",
  );
  expect(
    await render(doc({ content: [{ type: "horizontalRule" }, block], type: "blockquote" })),
  ).toContain("<blockquote><hr><pre><code>\n\t  &lt;script&gt;");
});

test("overrides receive validated attributes and already-rendered escaped children", async () => {
  expect(
    await render(
      doc(
        paragraph(
          text("<Link>", [
            { attrs: { href: "/safe", target: "_blank", rel: "nofollow" }, type: "link" },
          ]),
        ),
      ),
      { components: { link: Override } },
    ),
  ).toBe(
    '<p><span data-source="link" data-tag="a" data-href="/safe" data-target="_blank" data-rel="noopener noreferrer nofollow">&lt;Link&gt;</span></p>',
  );
  expect(
    await render(doc({ content: [text("<x>\n")], type: "codeBlock" }), {
      components: { codeBlock: Override },
    }),
  ).toBe(
    '<span data-source="codeBlock" data-tag="pre"><span data-source="codeBlock" data-tag="code">&lt;x&gt;\n</span></span>',
  );
});

test.each([
  { attrs: { language: "js" }, type: "codeBlock" },
  { content: [text("x", [{ type: "bold" }])], type: "codeBlock" },
  { content: [], type: "horizontalRule" },
  ...[{ target: "_self" }, { rel: "noopener noreferrer" }, { href: "javascript:alert(1)" }].map(
    (attrs) => paragraph(text("Link", [{ attrs: { href: "/safe", ...attrs }, type: "link" }])),
  ),
])("unsafe expanded documents fail before rendering %#", async (node) => {
  await expect(render(doc(node), { context: { fieldPath: ["body"] } })).rejects.toMatchObject({
    code: "invalid_rich_text",
    fieldPath: expect.arrayContaining(["body", "content", 0]),
  });
});
