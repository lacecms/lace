import { Editor } from "@tiptap/core";
import { validateRichTextDocument } from "@lacecms/content";
import { afterEach, expect, test, vi } from "vitest";
import { richTextDocument, richTextExtensions } from "./rich-text-extensions.js";

const editors: Editor[] = [];

function createEditor(content: string | object) {
  const handlers = { current: { focusToolbar: vi.fn(), openLink: vi.fn() } };
  const editor = new Editor({ content, extensions: richTextExtensions(handlers) });
  editors.push(editor);
  return { editor, handlers };
}

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});

test("every toolbar action produces a document the shared validator accepts", () => {
  const { editor } = createEditor("<p>Hello world</p>");
  const actions: ((chain: ReturnType<Editor["chain"]>) => ReturnType<Editor["chain"]>)[] = [
    (chain) => chain.toggleBold(),
    (chain) => chain.toggleItalic(),
    (chain) => chain.toggleStrike(),
    (chain) => chain.toggleCode(),
    (chain) => chain.setLink({ href: "https://example.com" }),
    (chain) => chain.setHeading({ level: 1 }),
    (chain) => chain.setHeading({ level: 3 }),
    (chain) => chain.setParagraph(),
    (chain) => chain.toggleBulletList(),
    (chain) => chain.toggleOrderedList(),
    (chain) => chain.toggleBlockquote(),
    (chain) => chain.setHardBreak(),
  ];
  for (const action of actions) {
    editor.commands.selectAll();
    action(editor.chain()).run();
    expect(() => validateRichTextDocument(richTextDocument(editor.getJSON()))).not.toThrow();
  }
});

test("links carry supported options and ordered lists carry no attributes", () => {
  const { editor } = createEditor(
    '<p><a class="x" href="https://example.com" target="_blank" title="t">Link</a></p><ol start="3" type="a"><li><p>Item</p></li></ol>',
  );
  const json = richTextDocument(editor.getJSON());
  expect(json.content?.[0]?.content?.[0]?.marks).toEqual([
    { attrs: { href: "https://example.com", target: "_blank" }, type: "link" },
  ]);
  expect(json.content?.[1]).not.toHaveProperty("attrs");
  expect(() => validateRichTextDocument(json)).not.toThrow();
});

test("pasted HTML is reduced to the allowlist and unsafe links are dropped", () => {
  const { editor } = createEditor(
    '<h4 style="color:red">Deep</h4><p onclick="x()"><a href="javascript:alert(1)">bad</a> <img src="x"><u>under</u></p>',
  );
  const json = richTextDocument(editor.getJSON());
  expect(JSON.stringify(json)).not.toContain("javascript");
  expect(() => validateRichTextDocument(json)).not.toThrow();
});

test("undo and redo restore earlier documents", () => {
  const { editor } = createEditor("<p>One</p>");
  editor.chain().selectAll().toggleBold().run();
  expect(editor.isActive("bold")).toBe(true);
  editor.commands.undo();
  expect(JSON.stringify(richTextDocument(editor.getJSON()))).not.toContain("bold");
  editor.commands.redo();
  expect(JSON.stringify(richTextDocument(editor.getJSON()))).toContain("bold");
});

test("editor shortcuts call their handlers", () => {
  const { editor, handlers } = createEditor("<p>One</p>");
  const press = (key: string, init: KeyboardEventInit) =>
    editor.view.someProp("handleKeyDown", (handler) =>
      handler(editor.view, new KeyboardEvent("keydown", { key, ...init })),
    );
  press("k", { ctrlKey: true });
  press("F10", { altKey: true });
  expect(handlers.current.openLink).toHaveBeenCalled();
  expect(handlers.current.focusToolbar).toHaveBeenCalled();
});

test.each([{}, { target: "_blank" }, { rel: "nofollow" }, { target: "_blank", rel: "nofollow" }])(
  "expanded documents round-trip without losing content: %j",
  (options) => {
    const document = {
      type: "doc",
      content: [
        ...[1, 2, 3, 4].map((level) => ({
          type: "heading",
          attrs: { level },
          content: [{ type: "text", text: `Heading ${level}` }],
        })),
        { type: "horizontalRule" },
        { type: "codeBlock" },
        { type: "codeBlock", content: [{ type: "text", text: "\t  <example> &\n  next\n" }] },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Link",
              marks: [{ type: "link", attrs: { href: "/docs", ...options } }],
            },
          ],
        },
      ],
    };
    const { editor } = createEditor(document);
    expect(richTextDocument(editor.getJSON())).toEqual(document);
    expect(() => validateRichTextDocument(richTextDocument(editor.getJSON()))).not.toThrow();
    editor.commands.setTextSelection(2);
    editor.commands.setHeading({ level: 4 });
    editor.commands.undo();
    expect(richTextDocument(editor.getJSON())).toEqual(document);
    editor.commands.redo();
    expect(richTextDocument(editor.getJSON()).content?.[0]?.attrs).toEqual({ level: 4 });
  },
);

test("new nodes have no forbidden attributes and plain code rejects marks", () => {
  const { editor } = createEditor(
    '<pre class="language-js"><code><b>  &lt;x&gt;\n\tline</b></code></pre><hr class="x"><h4>Title</h4>',
  );
  const json = richTextDocument(editor.getJSON());
  expect(json.content?.[0]).toEqual({
    type: "codeBlock",
    content: [{ type: "text", text: "  <x>\n\tline" }],
  });
  expect(json.content?.[1]).toEqual({ type: "horizontalRule" });
  expect(json.content?.[2]?.attrs).toEqual({ level: 4 });
  editor.commands.setTextSelection({ from: 1, to: 4 });
  expect(editor.commands.toggleBold()).toBe(false);
  expect(editor.commands.setLink({ href: "/docs" })).toBe(false);
  expect(() => validateRichTextDocument(richTextDocument(editor.getJSON()))).not.toThrow();
  editor.commands.toggleCodeBlock();
  editor.commands.setHorizontalRule();
  expect(() => validateRichTextDocument(richTextDocument(editor.getJSON()))).not.toThrow();
});

test("serialization removes only absent link options and preserves invalid present values", () => {
  const json = richTextDocument({
    type: "text",
    text: "Link",
    marks: [{ type: "link", attrs: { href: "/", target: null, rel: undefined } }],
  });
  expect(json.marks?.[0]?.attrs).toEqual({ href: "/" });
  const invalid = richTextDocument({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "bad",
            marks: [{ type: "link", attrs: { href: "/", target: "_self", rel: "noopener" } }],
          },
        ],
      },
    ],
  });
  expect(() => validateRichTextDocument(invalid)).toThrow();
});
