import { Editor } from "@tiptap/core";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { richTextExtensions } from "../rich-text-extensions.js";
import { RichTextBubbleMenu } from "./index.js";

let editor: Editor;
afterEach(() => editor?.destroy());
function setup() {
  const element = document.createElement("div");
  document.body.append(element);
  editor = new Editor({
    element,
    content: "<p>Hello world</p>",
    extensions: richTextExtensions({ current: { focusToolbar() {}, openLink() {} } }),
  });
  const onLink = vi.fn();
  render(<RichTextBubbleMenu editor={editor} label="Body" onLink={onLink} />);
  return onLink;
}

test("selection actions preserve focus and Escape dismisses without changing content", async () => {
  const user = userEvent.setup();
  const link = setup();
  act(() => {
    editor.commands.setTextSelection({ from: 1, to: 6 });
    editor.view.focus();
    editor.view.dispatch(editor.state.tr);
  });
  const bubble = await screen.findByRole("toolbar", { name: "Body selection formatting" });
  expect(editor.view.dom).toHaveFocus();
  await user.click(within(bubble).getByRole("button", { name: "Bold" }));
  await waitFor(() =>
    expect(within(bubble).getByRole("button", { name: "Bold" })).toHaveAttribute(
      "aria-pressed",
      "true",
    ),
  );
  expect(editor.state.selection.from).toBe(1);
  expect(editor.state.selection.to).toBe(6);
  await user.click(within(bubble).getByRole("button", { name: "Link" }));
  expect(link).toHaveBeenCalledOnce();
  within(bubble).getByRole("button", { name: "Bold" }).focus();
  await user.keyboard("{Escape}");
  await waitFor(() =>
    expect(screen.queryByRole("toolbar", { name: "Body selection formatting" })).toBeNull(),
  );
});

test("collapsed, plain-code, hidden and read-only selections have no bubble", async () => {
  setup();
  const invisible = () =>
    expect(screen.queryByRole("toolbar", { name: "Body selection formatting" })).toBeNull();
  invisible();
  act(() => {
    editor.commands.toggleCodeBlock();
    editor.commands.setTextSelection({ from: 1, to: 6 });
    editor.view.focus();
    editor.view.dispatch(editor.state.tr);
  });
  invisible();
  act(() => {
    editor.commands.toggleCodeBlock();
    editor.setEditable(false);
  });
  await waitFor(invisible);
  act(() => {
    editor.setEditable(true);
    editor.view.dom.setAttribute("hidden", "");
    editor.view.dispatch(editor.state.tr);
  });
  await waitFor(invisible);
});
