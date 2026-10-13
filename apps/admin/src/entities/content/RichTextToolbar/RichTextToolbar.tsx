import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import {
  BoldIcon,
  CodeIcon,
  SquareCodeIcon,
  MinusIcon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  QuoteIcon,
  StrikethroughIcon,
  type LucideIcon,
} from "lucide-react";
import { useRef, useState, type KeyboardEvent, type ReactElement, type RefObject } from "react";
import { isApplePlatform } from "../../../shared/lib/index.js";
import { Button } from "../../../shared/ui/Button/index.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../shared/ui/Select/index.js";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../../shared/ui/Tooltip/index.js";
import { LinkPopover } from "../LinkPopover/index.js";
import { HEADING_LEVELS, type HeadingLevel } from "../rich-text-extensions.js";

/** One keyboard shortcut as its visible hint and its `aria-keyshortcuts` value. */
interface Shortcut {
  readonly aria: string;
  readonly label: string;
}

/** Formats `Mod`-based key chords for the current platform (⌘⇧8 or Ctrl+Shift+8). */
export function formatShortcut(
  chords: readonly (readonly string[])[],
  apple: boolean = isApplePlatform(),
): Shortcut {
  const symbol: Readonly<Record<string, string>> = { Alt: "⌥", Mod: "⌘", Shift: "⇧" };
  const name: Readonly<Record<string, string>> = { Mod: apple ? "Meta" : "Control" };
  return {
    aria: chords.map((keys) => keys.map((key) => name[key] ?? key).join("+")).join(" "),
    label: chords
      .map((keys) =>
        apple
          ? keys.map((key) => symbol[key] ?? key).join("")
          : keys.map((key) => (key === "Mod" ? "Ctrl" : key)).join("+"),
      )
      .join(", "),
  };
}

export type Toggle =
  | "codeBlock"
  | "blockquote"
  | "bold"
  | "bulletList"
  | "code"
  | "italic"
  | "orderedList"
  | "strike";

export const richTextToggles: readonly {
  readonly icon: LucideIcon;
  readonly keys: readonly string[];
  readonly label: string;
  readonly name: Toggle;
  readonly run: (editor: Editor) => void;
}[] = [
  {
    icon: BoldIcon,
    keys: ["Mod", "B"],
    label: "Bold",
    name: "bold",
    run: (editor) => editor.chain().focus().toggleBold().run(),
  },
  {
    icon: ItalicIcon,
    keys: ["Mod", "I"],
    label: "Italic",
    name: "italic",
    run: (editor) => editor.chain().focus().toggleItalic().run(),
  },
  {
    icon: StrikethroughIcon,
    keys: ["Mod", "Shift", "S"],
    label: "Strike",
    name: "strike",
    run: (editor) => editor.chain().focus().toggleStrike().run(),
  },
  {
    icon: CodeIcon,
    keys: ["Mod", "E"],
    label: "Code",
    name: "code",
    run: (editor) => editor.chain().focus().toggleCode().run(),
  },
  {
    icon: ListIcon,
    keys: ["Mod", "Shift", "8"],
    label: "Bulleted list",
    name: "bulletList",
    run: (editor) => editor.chain().focus().toggleBulletList().run(),
  },
  {
    icon: ListOrderedIcon,
    keys: ["Mod", "Shift", "7"],
    label: "Numbered list",
    name: "orderedList",
    run: (editor) => editor.chain().focus().toggleOrderedList().run(),
  },
  {
    icon: QuoteIcon,
    keys: ["Mod", "Shift", "B"],
    label: "Quote",
    name: "blockquote",
    run: (editor) => editor.chain().focus().toggleBlockquote().run(),
  },
  {
    icon: SquareCodeIcon,
    keys: ["Mod", "Alt", "C"],
    label: "Code block",
    name: "codeBlock",
    run: (editor) => editor.chain().focus().toggleCodeBlock().run(),
  },
];

type TextStyle = "paragraph" | `heading-${HeadingLevel}`;

function readToolbarState(editor: Editor) {
  const level = HEADING_LEVELS.find((candidate) =>
    editor.isActive("heading", { level: candidate }),
  );
  return {
    active: Object.fromEntries(
      richTextToggles.map(({ name }) => [name, editor.isActive(name)]),
    ) as Record<Toggle, boolean>,
    link: editor.isActive("link"),
    plainCode: editor.isActive("codeBlock"),
    textStyle: (level === undefined ? "paragraph" : `heading-${level}`) as TextStyle,
  };
}

function ToolbarTooltip({
  children,
  shortcut,
  text,
}: {
  readonly children: ReactElement;
  readonly shortcut: Shortcut;
  readonly text: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>
        {text} <kbd className="font-sans opacity-70">{shortcut.label}</kbd>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * The fixed formatting toolbar of one rich-text field. It is a single tab
 * stop: arrow keys, Home, and End move between controls, and Escape returns
 * to the text.
 */
export function RichTextToolbar({
  editor,
  focusRef,
  label,
  linkOpen,
  onLinkOpenChange,
}: {
  readonly editor: Editor;
  /** Receives a function that focuses the toolbar's current control. */
  readonly focusRef: RefObject<(() => void) | undefined>;
  readonly label: string;
  readonly linkOpen: boolean;
  readonly onLinkOpenChange: (open: boolean) => void;
}) {
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => readToolbarState(current),
  });
  const items = useRef<(HTMLElement | null)[]>([]);
  const [current, setCurrent] = useState(0);
  const apple = isApplePlatform();
  focusRef.current = () => items.current[current]?.focus();
  const count = richTextToggles.length + 3;
  const item = (index: number) => ({
    onFocus: () => setCurrent(index),
    ref: (element: HTMLElement | null) => {
      items.current[index] = element;
    },
    tabIndex: index === current ? 0 : -1,
  });
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Keys from the link popover bubble through React's tree but not the DOM.
    if (!event.currentTarget.contains(event.target as Node)) return;
    const next =
      event.key === "ArrowRight"
        ? (current + 1) % count
        : event.key === "ArrowLeft"
          ? (current - 1 + count) % count
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? count - 1
              : undefined;
    if (next !== undefined) {
      let target = next;
      const direction = event.key === "ArrowLeft" || event.key === "End" ? -1 : 1;
      while (items.current[target]?.hasAttribute("disabled"))
        target = (target + direction + count) % count;
      event.preventDefault();
      setCurrent(target);
      items.current[target]?.focus();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      editor.commands.focus();
    }
  };
  const styleShortcut = formatShortcut(
    [["Mod", "Alt", "0"], ...HEADING_LEVELS.map((level) => ["Mod", "Alt", String(level)])],
    apple,
  );
  const linkShortcut = formatShortcut([["Mod", "K"]], apple);
  const setTextStyle = (value: string) => {
    const level = HEADING_LEVELS.find((candidate) => value === `heading-${candidate}`);
    if (level === undefined) editor.chain().focus().setParagraph().run();
    else editor.chain().focus().setHeading({ level }).run();
  };

  return (
    <TooltipProvider delayDuration={400}>
      <div
        aria-label={`${label} formatting`}
        className="flex flex-wrap items-center gap-0.5 border-b border-border pb-2"
        onKeyDown={onKeyDown}
        role="toolbar"
      >
        <Select onValueChange={setTextStyle} value={state.textStyle}>
          <ToolbarTooltip shortcut={styleShortcut} text="Text style">
            <SelectTrigger
              aria-keyshortcuts={styleShortcut.aria}
              aria-label="Text style"
              className="w-32 border-transparent shadow-none"
              size="sm"
              {...item(0)}
            >
              <SelectValue />
            </SelectTrigger>
          </ToolbarTooltip>
          <SelectContent
            onCloseAutoFocus={(event) => {
              // Continue in the text after choosing a style.
              event.preventDefault();
              editor.commands.focus();
            }}
          >
            <SelectItem value="paragraph">Paragraph</SelectItem>
            {HEADING_LEVELS.map((level) => (
              <SelectItem key={level} value={`heading-${level}`}>
                Heading {level}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span aria-hidden className="mx-1 h-5 w-px bg-border" />
        {richTextToggles.map((toggle, index) => {
          const shortcut = formatShortcut([toggle.keys], apple);
          const Icon = toggle.icon;
          return (
            <ToolbarTooltip key={toggle.name} shortcut={shortcut} text={toggle.label}>
              <Button
                aria-keyshortcuts={shortcut.aria}
                aria-label={toggle.label}
                aria-pressed={state.active[toggle.name]}
                disabled={
                  state.plainCode && ["bold", "italic", "strike", "code"].includes(toggle.name)
                }
                className="aria-pressed:bg-accent aria-pressed:text-accent-foreground"
                onClick={() => toggle.run(editor)}
                size="icon-sm"
                variant="ghost"
                {...item(index + 1)}
              >
                <Icon aria-hidden />
              </Button>
            </ToolbarTooltip>
          );
        })}
        <Button
          aria-label="Insert horizontal rule"
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          size="icon-sm"
          variant="ghost"
          {...item(count - 2)}
        >
          <MinusIcon aria-hidden />
        </Button>
        <Tooltip>
          <LinkPopover editor={editor} onOpenChange={onLinkOpenChange} open={linkOpen}>
            <TooltipTrigger asChild>
              <Button
                aria-keyshortcuts={linkShortcut.aria}
                aria-label="Link"
                aria-pressed={state.link}
                disabled={state.plainCode}
                className="aria-pressed:bg-accent aria-pressed:text-accent-foreground"
                size="icon-sm"
                variant="ghost"
                {...item(count - 1)}
              >
                <LinkIcon aria-hidden />
              </Button>
            </TooltipTrigger>
          </LinkPopover>
          <TooltipContent>
            Link <kbd className="font-sans opacity-70">{linkShortcut.label}</kbd>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
