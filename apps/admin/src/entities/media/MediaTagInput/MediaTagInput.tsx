import { normalizeMediaTag } from "@lacecms/contracts";
import { X } from "lucide-react";
import { type KeyboardEvent, useId, useRef, useState } from "react";
import { cn } from "../../../shared/lib/index.js";
import { Badge } from "../../../shared/ui/Badge/index.js";
import { Button } from "../../../shared/ui/Button/index.js";
import { Input } from "../../../shared/ui/Input/index.js";
import { useMediaTagSuggestions } from "../media-tag-suggestions.js";
import { sortedTags } from "../media-tags.js";

/** Explains the tag rule when typed text cannot be added. */
export const invalidTagMessage = "Use ASCII letters, digits, and hyphens, up to 40 characters.";

const TAG_INPUT_ATTRIBUTE = "data-media-tag-input";

/**
 * Whether an Escape keydown target is a tag input showing suggestions. The
 * surrounding dialog or panel then keeps itself open so Escape closes only
 * the suggestions.
 */
export function isOpenTagCombobox(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    target.hasAttribute(TAG_INPUT_ATTRIBUTE) &&
    target.getAttribute("aria-expanded") === "true"
  );
}

/**
 * Chosen media tags as removable chips followed by a combobox that suggests
 * catalog tags by prefix. Enter adds the active suggestion or the typed text,
 * a comma adds the typed text, and Backspace in an empty input removes the
 * last chip. Typed text is normalized like the API before it is added. At the
 * limit the input stays focusable for removal but accepts no more text.
 */
export function MediaTagInput({
  className,
  describedBy,
  disabled = false,
  error,
  label,
  limit,
  limitMessage,
  onChange,
  tags,
}: {
  readonly className?: string | undefined;
  /** Further descriptions of the input, such as a server error. */
  readonly describedBy?: string | undefined;
  readonly disabled?: boolean | undefined;
  /** Marks the input invalid, for example when the server rejected a tag. */
  readonly error?: boolean | undefined;
  readonly label: string;
  readonly limit: number;
  readonly limitMessage: string;
  readonly onChange: (tags: readonly string[]) => void;
  readonly tags: readonly string[];
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [active, setActive] = useState(-1);
  const [invalid, setInvalid] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const full = tags.length >= limit;
  const suggestions = useMediaTagSuggestions(text, focused && !full && !disabled);
  // Until the debounced request answers, narrow the previous answer to the typed prefix.
  const typed = text.trim() === "" ? "" : (normalizeMediaTag(text) ?? undefined);
  const options = (typed === undefined ? [] : (suggestions.data?.items ?? [])).filter(
    (item) => item.tag.startsWith(typed ?? "") && !tags.includes(item.tag),
  );
  const expanded = focused && !dismissed && !full && !disabled && options.length > 0;
  const activeOption = expanded && active >= 0 ? options[active] : undefined;
  const listId = `${id}-list`;
  const messageId = `${id}-message`;
  const limitId = `${id}-limit`;
  const statusId = `${id}-status`;
  const failed = suggestions.isError && !full;

  function changeText(next: string) {
    setText(next);
    setInvalid(false);
    setDismissed(false);
    setActive(-1);
  }

  function add(raw: string) {
    if (raw.trim() === "") return;
    const tag = normalizeMediaTag(raw);
    if (tag === undefined) {
      setInvalid(true);
      return;
    }
    changeText("");
    if (tags.includes(tag)) {
      setAnnouncement(`Tag ${tag} is already added.`);
      return;
    }
    if (full) return;
    onChange(sortedTags([...tags, tag]));
    setAnnouncement(`Added tag ${tag}.`);
  }

  function remove(tag: string) {
    onChange(tags.filter((item) => item !== tag));
    setAnnouncement(`Removed tag ${tag}.`);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp": {
        if (full || options.length === 0) return;
        event.preventDefault();
        setDismissed(false);
        const step = event.key === "ArrowDown" ? 1 : -1;
        setActive((current) =>
          current < 0 && step < 0
            ? options.length - 1
            : (current + step + options.length) % options.length,
        );
        return;
      }
      case "Enter":
        // Never submit a surrounding form from the tag input.
        event.preventDefault();
        add(activeOption?.tag ?? text);
        return;
      case ",":
        event.preventDefault();
        add(text);
        return;
      case "Backspace":
        if (text === "" && tags.length > 0) {
          event.preventDefault();
          remove(tags[tags.length - 1]!);
        }
        return;
      case "Escape":
        // The surrounding dialog consulted `isOpenTagCombobox` before this runs.
        if (expanded) {
          event.preventDefault();
          event.stopPropagation();
          setDismissed(true);
          setActive(-1);
        }
        return;
      default:
        return;
    }
  }

  const describedByIds = [
    invalid ? messageId : undefined,
    full ? limitId : undefined,
    failed ? statusId : undefined,
    describedBy,
  ].filter((value) => value !== undefined);

  return (
    <div className={cn("grid gap-1.5", className)}>
      <label className="text-sm font-medium" htmlFor={`${id}-input`}>
        {label}
      </label>
      {tags.length === 0 ? undefined : (
        <ul aria-label={`${label}: chosen tags`} className="m-0 flex list-none flex-wrap gap-1 p-0">
          {tags.map((tag) => (
            <li key={tag}>
              <Badge className="gap-0.5 py-0 pr-0.5 font-medium" variant="secondary">
                <span>{tag}</span>
                <Button
                  aria-label={`Remove tag ${tag}`}
                  disabled={disabled}
                  onClick={() => {
                    remove(tag);
                    input.current?.focus();
                  }}
                  size="icon-xs"
                  variant="ghost"
                >
                  <X aria-hidden="true" />
                </Button>
              </Badge>
            </li>
          ))}
        </ul>
      )}
      <div className="relative">
        <Input
          {...{ [TAG_INPUT_ATTRIBUTE]: "" }}
          aria-activedescendant={activeOption === undefined ? undefined : `${id}-option-${active}`}
          aria-autocomplete="list"
          aria-controls={listId}
          aria-describedby={describedByIds.length > 0 ? describedByIds.join(" ") : undefined}
          aria-expanded={expanded}
          aria-invalid={invalid || error === true ? true : undefined}
          autoComplete="off"
          disabled={disabled}
          id={`${id}-input`}
          onBlur={() => {
            setFocused(false);
            setActive(-1);
          }}
          onChange={(event) => changeText(event.currentTarget.value)}
          onFocus={() => {
            setFocused(true);
            setDismissed(false);
          }}
          onKeyDown={onKeyDown}
          placeholder={full ? undefined : "Add a tag"}
          readOnly={full}
          ref={input}
          role="combobox"
          spellCheck={false}
          value={text}
        />
        <ul
          className="absolute top-full right-0 left-0 z-50 m-0 mt-1 max-h-60 list-none overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
          hidden={!expanded}
          id={listId}
          // Keep focus in the input when a suggestion is clicked.
          onMouseDown={(event) => event.preventDefault()}
          role="listbox"
          aria-label={`${label} suggestions`}
          // The list is never a tab stop; focus stays in the input.
          tabIndex={-1}
        >
          {/* Options stay mounted while hidden: removing nodes during blur makes the
              surrounding focus trap pull focus back to its container. */}
          {options.map((option, index) => (
            <li
              aria-label={`${option.tag}, ${option.count} ${option.count === 1 ? "item" : "items"}`}
              aria-selected={index === active}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-3 rounded-sm px-2 py-1 text-sm",
                index === active ? "bg-accent text-accent-foreground" : undefined,
              )}
              id={`${id}-option-${index}`}
              key={option.tag}
              onClick={() => add(option.tag)}
              onMouseMove={() => setActive(index)}
              role="option"
            >
              <span>{option.tag}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{option.count}</span>
            </li>
          ))}
        </ul>
      </div>
      {invalid ? (
        <p className="m-0 text-xs text-destructive" id={messageId} role="alert">
          {invalidTagMessage}
        </p>
      ) : undefined}
      {full ? (
        <p className="m-0 text-xs text-muted-foreground" id={limitId}>
          {limitMessage}
        </p>
      ) : undefined}
      {failed ? (
        <p className="m-0 text-xs text-muted-foreground" id={statusId}>
          Suggestions are unavailable. You can still type a tag.
        </p>
      ) : undefined}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
