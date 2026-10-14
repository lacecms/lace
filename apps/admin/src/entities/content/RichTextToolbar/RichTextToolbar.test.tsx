import type { Editor } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { useRef, useState } from "react";
import { expect, test } from "vitest";
import { richTextExtensions } from "../rich-text-extensions.js";
import { formatShortcut, RichTextToolbar } from "./index.js";

let current: Editor | null = null;

function Harness({ content }: { readonly content: string }) {
  const handlers = useRef({ focusToolbar: () => undefined, openLink: () => undefined });
  const editor = useEditor({ content, extensions: richTextExtensions(handlers) });
  const focusRef = useRef<(() => void) | undefined>(undefined);
  const [linkOpen, setLinkOpen] = useState(false);
  current = editor;
  if (editor === null) return null;
  return (
    <>
      <RichTextToolbar
        editor={editor}
        focusRef={focusRef}
        label="Body"
        linkOpen={linkOpen}
        onLinkOpenChange={setLinkOpen}
      />
      <EditorContent editor={editor} />
    </>
  );
}

function editor(): Editor {
  if (current === null) throw new Error("The editor has not rendered.");
  return current;
}

test("reflects the selection's marks and text style", async () => {
  render(<Harness content="<h2><strong>Bold</strong> plain</h2>" />);
  const toolbar = await screen.findByRole("toolbar", { name: "Body formatting" });
  expect(toolbar).toBeInTheDocument();
  editor().commands.setTextSelection(2);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "true"),
  );
  expect(screen.getByRole("button", { name: "Italic" })).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByRole("combobox", { name: "Text style" })).toHaveTextContent("Heading 2");
  editor().commands.setTextSelection(8);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "false"),
  );
});

test("toggles marks and changes the text style", async () => {
  const user = userEvent.setup();
  render(<Harness content="<p>Hello</p>" />);
  await screen.findByRole("toolbar", { name: "Body formatting" });
  editor().commands.selectAll();
  await user.click(screen.getByRole("button", { name: "Italic" }));
  expect(editor().getJSON().content?.[0]?.content?.[0]?.marks).toEqual([{ type: "italic" }]);
  // Tiptap focuses the text on the next animation frame; let that land before
  // moving focus to the style menu, or it would take focus back mid-test.
  await waitFor(() => expect(editor().view.dom).toHaveFocus());

  screen.getByRole("combobox", { name: "Text style" }).focus();
  await user.keyboard("{Enter}");
  await user.click(await screen.findByRole("option", { name: "Heading 1" }));
  expect(editor().getJSON().content?.[0]).toMatchObject({ attrs: { level: 1 }, type: "heading" });
  await waitFor(() => expect(editor().view.dom).toHaveFocus());
});

test("is one tab stop with arrow, Home, End, and Escape navigation", async () => {
  const user = userEvent.setup();
  render(<Harness content="<p>Hello</p>" />);
  const toolbar = await screen.findByRole("toolbar", { name: "Body formatting" });
  const style = screen.getByRole("combobox", { name: "Text style" });
  const tabbable = [...toolbar.querySelectorAll('[tabindex="0"]')];
  expect(tabbable).toEqual([style]);

  style.focus();
  await user.keyboard("{ArrowRight}");
  expect(screen.getByRole("button", { name: "Bold" })).toHaveFocus();
  await user.keyboard("{ArrowRight}");
  expect(screen.getByRole("button", { name: "Italic" })).toHaveFocus();
  expect(screen.getByRole("button", { name: "Italic" })).toHaveAttribute("tabindex", "0");
  await user.keyboard("{End}");
  expect(screen.getByRole("button", { name: "Link" })).toHaveFocus();
  await user.keyboard("{ArrowRight}");
  expect(style).toHaveFocus();
  await user.keyboard("{ArrowLeft}");
  expect(screen.getByRole("button", { name: "Link" })).toHaveFocus();
  await user.keyboard("{Home}");
  expect(style).toHaveFocus();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(editor().view.dom).toHaveFocus());
});

test("names each shortcut for the platform", async () => {
  const user = userEvent.setup();
  render(<Harness content="<p>Hello</p>" />);
  const bold = await screen.findByRole("button", { name: "Bold" });
  expect(bold).toHaveAttribute("aria-keyshortcuts", "Control+B");
  expect(screen.getByRole("button", { name: "Link" })).toHaveAttribute(
    "aria-keyshortcuts",
    "Control+K",
  );
  await user.hover(bold);
  expect(await screen.findByRole("tooltip")).toHaveTextContent("Bold Ctrl+B");
  expect(formatShortcut([["Mod", "Shift", "8"]], true)).toEqual({
    aria: "Meta+Shift+8",
    label: "⌘⇧8",
  });
  expect(
    formatShortcut(
      [
        ["Mod", "Alt", "0"],
        ["Mod", "Alt", "1"],
      ],
      false,
    ),
  ).toEqual({ aria: "Control+Alt+0 Control+Alt+1", label: "Ctrl+Alt+0, Ctrl+Alt+1" });
});

test("opens the link popover from the Link control", async () => {
  const user = userEvent.setup();
  render(<Harness content="<p>Hello</p>" />);
  await user.click(await screen.findByRole("button", { name: "Link" }));
  expect(await screen.findByLabelText("Link URL")).toHaveFocus();
  expect(screen.getByRole("button", { name: "Link" })).toHaveAttribute("aria-expanded", "true");
});

test("offers H4, attribute-free code and rules with plain-code marks disabled", async () => {
  const user = userEvent.setup();
  render(<Harness content="<h4>Hello</h4>" />);
  await screen.findByRole("toolbar", { name: "Body formatting" });
  editor().commands.setTextSelection(2);
  await waitFor(() =>
    expect(screen.getByRole("combobox", { name: "Text style" })).toHaveTextContent("Heading 4"),
  );
  await user.click(screen.getByRole("button", { name: "Code block" }));
  expect(editor().getJSON().content?.[0]?.type).toBe("codeBlock");
  await waitFor(() => expect(screen.getByRole("button", { name: "Bold" })).toBeDisabled());
  expect(screen.getByRole("button", { name: "Link" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Code block" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Bold" })).toBeEnabled());
  await user.click(screen.getByRole("button", { name: "Insert horizontal rule" }));
  expect(
    editor()
      .getJSON()
      .content?.some((node) => node.type === "horizontalRule"),
  ).toBe(true);
});
