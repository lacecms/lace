import type { Editor } from "@tiptap/core";
import { isSafeUrl } from "@lacecms/content";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "../../../shared/ui/Button/index.js";
import { Switch } from "../../../shared/ui/Switch/index.js";
import { Input } from "../../../shared/ui/Input/index.js";
import { fieldErrorClass } from "../../../shared/ui/layout/index.js";
import { Popover, PopoverContent, PopoverTrigger } from "../../../shared/ui/Popover/index.js";
import { LINK_URL_MESSAGE } from "../editor-form.js";

/**
 * Edits the link at the editor's selection. Only URLs the shared allowlist
 * permits are applied; closing always returns focus to the text.
 */
export function LinkPopover({
  children,
  editor,
  onOpenChange,
  open,
}: {
  readonly children: ReactNode;
  readonly editor: Editor;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
}) {
  const id = useId();
  const selection = useRef(editor.state.selection);
  const [newTab, setNewTab] = useState(false);
  const [nofollow, setNofollow] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string>();
  const [linked, setLinked] = useState(false);
  useEffect(() => {
    if (!open) return;
    selection.current = editor.state.selection;
    const attributes = editor.getAttributes("link");
    const href = attributes.href as unknown;
    setNewTab(attributes.target === "_blank");
    setNofollow(attributes.rel === "nofollow");
    setValue(typeof href === "string" ? href : "");
    setError(undefined);
    setLinked(editor.isActive("link"));
  }, [editor, open]);

  const apply = () => {
    const href = value.trim();
    if (!isSafeUrl(href)) {
      setError(LINK_URL_MESSAGE);
      return;
    }
    if (!editor.isEditable || editor.isActive("codeBlock")) return;
    editor.commands.setTextSelection({ from: selection.current.from, to: selection.current.to });
    const attrs = { href, target: newTab ? "_blank" : null, rel: nofollow ? "nofollow" : null };
    if (editor.state.selection.empty && !editor.isActive("link")) {
      editor
        .chain()
        .focus()
        .insertContent({ marks: [{ attrs, type: "link" }], text: href, type: "text" })
        .run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink(attrs).run();
    }
    onOpenChange(false);
  };
  const removeLink = () => {
    if (!editor.isEditable) return;
    editor.commands.setTextSelection({ from: selection.current.from, to: selection.current.to });
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    onOpenChange(false);
  };

  return (
    <Popover onOpenChange={onOpenChange} open={open}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align="start"
        aria-label="Link"
        className="grid gap-2"
        onCloseAutoFocus={(event) => {
          // Return to the text rather than the toolbar trigger.
          event.preventDefault();
          if (!editor.isDestroyed) editor.commands.focus();
        }}
      >
        <label className="text-sm font-medium" htmlFor={`${id}-url`}>
          Link URL
        </label>
        <Input
          aria-describedby={error === undefined ? undefined : `${id}-error`}
          aria-invalid={error === undefined ? undefined : true}
          id={`${id}-url`}
          inputMode="url"
          onChange={(event) => {
            setValue(event.currentTarget.value);
            setError(undefined);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            apply();
          }}
          placeholder="https://"
          value={value}
        />
        <label
          className="flex items-center justify-between gap-3 text-sm"
          htmlFor={`${id}-new-tab`}
        >
          Open in a new tab
          <Switch id={`${id}-new-tab`} checked={newTab} onCheckedChange={setNewTab} />
        </label>
        <label
          className="flex items-center justify-between gap-3 text-sm"
          htmlFor={`${id}-nofollow`}
        >
          nofollow
          <Switch id={`${id}-nofollow`} checked={nofollow} onCheckedChange={setNofollow} />
        </label>
        {error === undefined ? undefined : (
          <p className={`${fieldErrorClass} text-xs`} id={`${id}-error`} role="alert">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          {linked ? (
            <Button onClick={removeLink} size="sm" variant="ghost">
              Remove link
            </Button>
          ) : undefined}
          <Button onClick={apply} size="sm">
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
