import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import { RichTextBubbleMenu } from "../RichTextBubbleMenu/index.js";
import { RichTextToolbar } from "../RichTextToolbar/index.js";
import {
  RICH_TEXT_PLACEHOLDER,
  richTextExtensions,
  richTextDocument,
  type RichTextShortcutHandlers,
} from "../rich-text-extensions.js";

const surfaceClass =
  "grid gap-2 rounded-lg border border-input bg-background p-2 has-[[aria-invalid=true]]:border-destructive";
const contentClass =
  "min-h-32 rounded-sm px-1 py-1 font-normal [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_code]:rounded-sm [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:text-base [&_h3]:font-semibold [&_h4]:text-sm [&_h4]:font-semibold [&_hr]:my-4 [&_hr]:border-border [&_pre]:whitespace-pre-wrap [&_pre]:rounded-sm [&_pre]:bg-muted [&_pre]:p-3 [&_a]:text-primary [&_a]:underline [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5";

function surfaceAttributes({
  describedBy,
  id,
  invalid,
  label,
  readOnly,
}: {
  readonly describedBy: string | undefined;
  readonly id: string;
  readonly invalid: boolean;
  readonly label: string;
  readonly readOnly: boolean;
}): Record<string, string> {
  return {
    "aria-label": label,
    "aria-multiline": "true",
    class: contentClass,
    id,
    role: "textbox",
    ...(describedBy === undefined ? {} : { "aria-describedby": describedBy }),
    ...(invalid ? { "aria-invalid": "true" } : {}),
    ...(readOnly ? { "aria-readonly": "true" } : { "aria-placeholder": RICH_TEXT_PLACEHOLDER }),
  };
}

/**
 * Edits one rich-text value as the shared safe document format. The text
 * surface carries the field's id, label, description, and invalid state.
 */
export function RichTextEditor({
  describedBy,
  id,
  invalid = false,
  label,
  onBlur,
  onChange,
  readOnly = false,
  value,
}: {
  readonly describedBy?: string;
  readonly id: string;
  readonly invalid?: boolean;
  readonly label: string;
  readonly onBlur: () => void;
  readonly onChange: (value: unknown) => void;
  readonly readOnly?: boolean;
  readonly value: unknown;
}) {
  const [linkOpen, setLinkOpen] = useState(false);
  const focusToolbar = useRef<(() => void) | undefined>(undefined);
  const handlers = useRef<RichTextShortcutHandlers>({
    focusToolbar: () => focusToolbar.current?.(),
    openLink: () => setLinkOpen(true),
  });
  const [extensions] = useState(() => richTextExtensions(handlers));
  const attributes = surfaceAttributes({ describedBy, id, invalid, label, readOnly });
  const editor = useEditor({
    content: value ?? { content: [{ type: "paragraph" }], type: "doc" },
    editable: !readOnly,
    editorProps: { attributes },
    extensions,
    immediatelyRender: false,
    onBlur,
    onUpdate: ({ editor: updated }) => onChange(richTextDocument(updated.getJSON())),
  });
  const attributesKey = JSON.stringify(attributes);
  useEffect(() => {
    if (editor === null || editor.isDestroyed) return;
    editor.setOptions({ editorProps: { attributes: JSON.parse(attributesKey) } });
  }, [attributesKey, editor]);
  useEffect(() => {
    if (editor === null || value === undefined) return;
    const next = JSON.stringify(value);
    if (JSON.stringify(richTextDocument(editor.getJSON())) !== next)
      editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);
  useEffect(() => {
    if (editor !== null && editor.isEditable === readOnly) editor.setEditable(!readOnly, false);
  }, [editor, readOnly]);
  if (editor === null) return <div aria-busy="true" className={surfaceClass} />;
  return (
    <div className={surfaceClass}>
      {readOnly ? undefined : (
        <>
          <RichTextBubbleMenu editor={editor} label={label} onLink={() => setLinkOpen(true)} />
          <RichTextToolbar
            editor={editor}
            focusRef={focusToolbar}
            label={label}
            linkOpen={linkOpen}
            onLinkOpenChange={setLinkOpen}
          />
        </>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
