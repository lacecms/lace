import { useId, useRef, useState, type KeyboardEvent, type ReactElement } from "react";
import { Input } from "../../../shared/ui/Input/index.js";
import { Popover, PopoverContent, PopoverTrigger } from "../../../shared/ui/Popover/index.js";
import {
  blockIcon,
  blockLabel,
  matchesBlockFilter,
  type BlockDefinitionDto,
} from "../block-presentation.js";

/**
 * A filterable list of the model's allowed blocks. Choosing one hands it to
 * the caller, which inserts it and moves focus to the new block.
 */
export function AddBlockMenu({
  children,
  unavailable,
  definitions,
  onChoose,
}: {
  /** The trigger button; it receives the popover's open state and ARIA. */
  readonly unavailable?: (definition: BlockDefinitionDto) => string | undefined;
  readonly children: ReactElement;
  readonly definitions: readonly BlockDefinitionDto[];
  readonly onChoose: (definition: BlockDefinitionDto) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const chosen = useRef(false);
  const list = useRef<HTMLUListElement>(null);
  const matches = definitions.filter((definition) => matchesBlockFilter(definition, query));

  const choose = (definition: BlockDefinitionDto) => {
    if (unavailable?.(definition)) return;
    chosen.current = true;
    setOpen(false);
    onChoose(definition);
  };
  const options = () => [
    ...(list.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []),
  ];
  const onFilterKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      options()[0]?.focus();
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (matches.length === 1) choose(matches[0]!);
    }
  };
  const onListKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const buttons = options();
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "ArrowUp" && index <= 0) {
      document.getElementById(`${id}-filter`)?.focus();
      return;
    }
    const next = event.key === "ArrowDown" ? Math.min(index + 1, buttons.length - 1) : index - 1;
    buttons[next]?.focus();
  };

  return (
    <Popover
      onOpenChange={(next) => {
        if (next) {
          chosen.current = false;
          setQuery("");
        }
        setOpen(next);
      }}
      open={open}
    >
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align="start"
        aria-label="Add block"
        className="grid w-80 gap-2 p-2"
        onCloseAutoFocus={(event) => {
          if (chosen.current) event.preventDefault();
        }}
        role="dialog"
      >
        <label className="sr-only" htmlFor={`${id}-filter`}>
          Filter blocks
        </label>
        <Input
          autoComplete="off"
          id={`${id}-filter`}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onFilterKeyDown}
          placeholder="Filter blocks"
          type="search"
          value={query}
        />
        {matches.length === 0 ? (
          <p className="m-0 px-2 py-3 text-sm text-muted-foreground" role="status">
            No blocks match “{query.trim()}”.
          </p>
        ) : (
          <ul
            aria-label="Blocks"
            className="m-0 grid max-h-80 list-none gap-0.5 overflow-y-auto p-0"
            onKeyDown={onListKeyDown}
            ref={list}
          >
            {matches.map((definition) => {
              const Icon = blockIcon(definition.type);
              const optionId = `${id}-${definition.type}`;
              return (
                <li key={definition.type}>
                  <button
                    disabled={!!unavailable?.(definition)}
                    title={unavailable?.(definition)}
                    aria-describedby={
                      definition.description === undefined ? undefined : `${optionId}-description`
                    }
                    aria-labelledby={`${optionId}-label`}
                    className="flex w-full cursor-pointer items-start gap-3 rounded-md px-2 py-2 text-left outline-hidden hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground"
                    onClick={() => choose(definition)}
                    type="button"
                  >
                    <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground">
                      <Icon aria-hidden className="size-4" />
                    </span>
                    <span className="grid min-w-0 gap-0.5">
                      <span className="text-sm font-medium" id={`${optionId}-label`}>
                        {blockLabel(definition)}
                      </span>
                      {definition.description === undefined ? undefined : (
                        <span
                          className="text-xs text-muted-foreground"
                          id={`${optionId}-description`}
                        >
                          {definition.description}
                        </span>
                      )}
                      {unavailable?.(definition) ? (
                        <small className="text-muted-foreground">{unavailable(definition)}</small>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
