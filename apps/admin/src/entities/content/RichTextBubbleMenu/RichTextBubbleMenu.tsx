import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { LinkIcon } from "lucide-react";
import { useCallback, useEffect, useId, useRef } from "react";
import { Button } from "../../../shared/ui/Button/index.js";
import { richTextToggles } from "../RichTextToolbar/index.js";

/** Selection actions supplement the complete keyboard route in the fixed toolbar. */
export function RichTextBubbleMenu({
  editor,
  label,
  onLink,
}: {
  readonly editor: Editor;
  readonly label: string;
  readonly onLink: () => void;
}) {
  const pluginKey = useId();
  const menu = useRef<HTMLDivElement>(null);
  const dismissed = useRef(false);
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      active: richTextToggles.map(({ name }) => current.isActive(name)),
      link: current.isActive("link"),
    }),
  });
  useEffect(() => {
    const reset = () => {
      dismissed.current = false;
    };
    editor.on("selectionUpdate", reset);
    return () => {
      editor.off("selectionUpdate", reset);
    };
  }, [editor]);
  useEffect(() => {
    const element = menu.current;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      dismissed.current = true;
      editor.commands.focus();
      editor.view.dispatch(editor.state.tr.setMeta(pluginKey, "hide"));
    };
    element?.addEventListener("keydown", dismiss);
    return () => element?.removeEventListener("keydown", dismiss);
  }, [editor, pluginKey]);
  const shouldShow = useCallback<
    NonNullable<import("@tiptap/react/menus").BubbleMenuProps["shouldShow"]>
  >(
    ({ view, state: current, from, to }) =>
      !dismissed.current &&
      editor.isEditable &&
      !editor.isActive("codeBlock") &&
      !current.selection.empty &&
      !!current.doc.textBetween(from, to) &&
      !view.dom.closest("[hidden], [aria-hidden=true]") &&
      (view.hasFocus() || !!menu.current?.contains(document.activeElement)),
    [editor],
  );
  return (
    <BubbleMenu
      editor={editor}
      pluginKey={pluginKey}
      tabIndex={-1}
      ref={menu}
      updateDelay={0}
      aria-label={`${label} selection formatting`}
      role="toolbar"
      className="flex items-center gap-0.5 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
      shouldShow={shouldShow}
    >
      {richTextToggles.slice(0, 4).map((toggle, index) => {
        const Icon = toggle.icon;
        return (
          <Button
            key={toggle.name}
            aria-label={toggle.label}
            aria-pressed={state.active[index]}
            className="aria-pressed:bg-accent aria-pressed:text-accent-foreground"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => toggle.run(editor)}
            size="icon-sm"
            variant="ghost"
          >
            <Icon aria-hidden />
          </Button>
        );
      })}
      <Button
        aria-label="Link"
        aria-pressed={state.link}
        onMouseDown={(event) => event.preventDefault()}
        onClick={onLink}
        size="icon-sm"
        variant="ghost"
      >
        <LinkIcon aria-hidden />
      </Button>
    </BubbleMenu>
  );
}
