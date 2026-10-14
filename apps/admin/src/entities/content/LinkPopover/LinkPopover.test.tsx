import { Editor } from "@tiptap/core";
import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, expect, test } from "vitest";
import { richTextDocument, richTextExtensions } from "../rich-text-extensions.js";
import { LinkPopover } from "./index.js";

const editors: Editor[] = [];

function createEditor(content: string) {
  const element = document.createElement("div");
  document.body.append(element);
  const editor = new Editor({
    content,
    element,
    extensions: richTextExtensions({
      current: { focusToolbar: () => undefined, openLink: () => undefined },
    }),
  });
  editors.push(editor);
  return editor;
}

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});

function Harness({ editor }: { readonly editor: Editor }) {
  const [open, setOpen] = useState(false);
  return (
    <LinkPopover editor={editor} onOpenChange={setOpen} open={open}>
      <button type="button">Link</button>
    </LinkPopover>
  );
}

test("links the selection with a safe URL and returns focus to the text", async () => {
  const user = userEvent.setup();
  const editor = createEditor("<p>Hello world</p>");
  editor.commands.setTextSelection({ from: 1, to: 6 });
  render(<Harness editor={editor} />);

  await user.click(screen.getByRole("button", { name: "Link" }));
  const input = await screen.findByLabelText("Link URL");
  expect(input).toHaveFocus();
  expect(input).toHaveValue("");
  expect(screen.queryByRole("button", { name: "Remove link" })).toBe(null);
  await user.type(input, "https://example.com{Enter}");

  expect(screen.queryByLabelText("Link URL")).toBe(null);
  expect(richTextDocument(editor.getJSON()).content?.[0]?.content?.[0]).toEqual({
    marks: [{ attrs: { href: "https://example.com" }, type: "link" }],
    text: "Hello",
    type: "text",
  });
  await waitFor(() => expect(editor.view.dom).toHaveFocus());
});

test("refuses an unsafe URL without changing the document", async () => {
  const user = userEvent.setup();
  const editor = createEditor("<p>Hello</p>");
  editor.commands.selectAll();
  const before = JSON.stringify(richTextDocument(editor.getJSON()));
  render(<Harness editor={editor} />);

  await user.click(screen.getByRole("button", { name: "Link" }));
  await user.type(await screen.findByLabelText("Link URL"), "javascript:alert(1)");
  await user.click(screen.getByRole("button", { name: "Apply" }));

  expect(screen.getByRole("alert")).toHaveTextContent(
    "Links must start with https://, http://, mailto:, tel:, / or #.",
  );
  expect(screen.getByLabelText("Link URL")).toHaveAttribute("aria-invalid", "true");
  expect(JSON.stringify(richTextDocument(editor.getJSON()))).toBe(before);
});

test("inserts the URL as linked text when nothing is selected", async () => {
  const user = userEvent.setup();
  const editor = createEditor("<p>See</p>");
  editor.commands.setTextSelection(4);
  render(<Harness editor={editor} />);

  await user.click(screen.getByRole("button", { name: "Link" }));
  await user.type(await screen.findByLabelText("Link URL"), "/docs");
  await user.click(screen.getByRole("button", { name: "Apply" }));

  expect(richTextDocument(editor.getJSON()).content?.[0]?.content).toEqual([
    { text: "See", type: "text" },
    { marks: [{ attrs: { href: "/docs" }, type: "link" }], text: "/docs", type: "text" },
  ]);
});

test("prefills the current link and removes it", async () => {
  const user = userEvent.setup();
  const editor = createEditor('<p><a href="https://old.example">Old</a> text</p>');
  editor.commands.setTextSelection(2);
  render(<Harness editor={editor} />);

  await user.click(screen.getByRole("button", { name: "Link" }));
  expect(await screen.findByLabelText("Link URL")).toHaveValue("https://old.example");
  await user.click(screen.getByRole("button", { name: "Remove link" }));

  expect(JSON.stringify(richTextDocument(editor.getJSON()))).not.toContain("link");
});

test("changes the whole existing link when the cursor is inside it", async () => {
  const user = userEvent.setup();
  const editor = createEditor('<p><a href="https://old.example">Old</a> text</p>');
  editor.commands.setTextSelection(2);
  render(<Harness editor={editor} />);

  await user.click(screen.getByRole("button", { name: "Link" }));
  const input = await screen.findByLabelText("Link URL");
  await user.clear(input);
  await user.type(input, "#section{Enter}");

  expect(richTextDocument(editor.getJSON()).content?.[0]?.content?.[0]).toEqual({
    marks: [{ attrs: { href: "#section" }, type: "link" }],
    text: "Old",
    type: "text",
  });
});

test("Escape closes without changing the document", async () => {
  const user = userEvent.setup();
  const editor = createEditor("<p>Hello</p>");
  editor.commands.selectAll();
  const before = JSON.stringify(richTextDocument(editor.getJSON()));
  render(<Harness editor={editor} />);

  await user.click(screen.getByRole("button", { name: "Link" }));
  await user.type(await screen.findByLabelText("Link URL"), "https://x.test");
  await user.keyboard("{Escape}");

  expect(screen.queryByLabelText("Link URL")).toBe(null);
  expect(JSON.stringify(richTextDocument(editor.getJSON()))).toBe(before);
  await waitFor(() => expect(editor.view.dom).toHaveFocus());
});

test.each([
  [false, false],
  [true, false],
  [false, true],
  [true, true],
])(
  "link switches round-trip and clear independently: new-tab %s, nofollow %s",
  async (newTab, nofollow) => {
    const user = userEvent.setup();
    const editor = createEditor("<p>Hello world</p>");
    editor.commands.setTextSelection({ from: 1, to: 6 });
    render(<Harness editor={editor} />);
    await user.click(screen.getByRole("button", { name: "Link" }));
    await user.type(await screen.findByLabelText("Link URL"), "/docs");
    if (newTab) await user.click(screen.getByRole("switch", { name: "Open in a new tab" }));
    if (nofollow) await user.click(screen.getByRole("switch", { name: "nofollow" }));
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(
      richTextDocument(editor.getJSON()).content?.[0]?.content?.[0]?.marks?.[0]?.attrs,
    ).toEqual({
      href: "/docs",
      ...(newTab ? { target: "_blank" } : {}),
      ...(nofollow ? { rel: "nofollow" } : {}),
    });
    await waitFor(() => expect(editor.view.dom).toHaveFocus());
    editor.commands.setTextSelection(2);
    await user.click(screen.getByRole("button", { name: "Link" }));
    expect(await screen.findByRole("switch", { name: "Open in a new tab" })).toHaveAttribute(
      "aria-checked",
      String(newTab),
    );
    expect(screen.getByRole("switch", { name: "nofollow" })).toHaveAttribute(
      "aria-checked",
      String(nofollow),
    );
    await user.click(screen.getByRole("switch", { name: "Open in a new tab" }));
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(
      richTextDocument(editor.getJSON()).content?.[0]?.content?.[0]?.marks?.[0]?.attrs,
    ).toEqual({
      href: "/docs",
      ...(!newTab ? { target: "_blank" } : {}),
      ...(nofollow ? { rel: "nofollow" } : {}),
    });
  },
);
