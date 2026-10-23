import { useRef } from "react";

export interface CardChoice {
  readonly value: string;
  readonly label: string;
  readonly description?: string;
  readonly diagram?: {
    readonly cells: readonly {
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
    }[];
  };
}

/** One native radio tab stop, with decorative data-only composition diagrams. */
export function ChoiceCards({
  choices,
  describedBy,
  disabled = false,
  id,
  invalid,
  label,
  onBlur,
  onChange,
  value,
}: {
  readonly choices: readonly CardChoice[];
  readonly describedBy: string | undefined;
  readonly disabled?: boolean;
  readonly id: string;
  readonly invalid: boolean;
  readonly label: string;
  readonly onBlur: () => void;
  readonly onChange: (value: string) => void;
  readonly value: string | undefined;
}) {
  const radios = useRef<(HTMLInputElement | null)[]>([]);
  const selected = Math.max(
    0,
    choices.findIndex((choice) => choice.value === value),
  );
  return (
    <div
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      aria-label={label}
      className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))] gap-2"
      role="radiogroup"
    >
      {choices.map((choice, index) => (
        <label
          className="relative grid min-w-0 cursor-pointer content-start gap-2 rounded-md border border-input bg-background p-3 has-[:checked]:border-primary has-[:checked]:ring-1 has-[:checked]:ring-primary has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring has-[:disabled]:cursor-default has-[:disabled]:opacity-50"
          key={choice.value}
        >
          <span className="flex items-start gap-2">
            <input
              aria-describedby={
                [describedBy, choice.description ? `${id}-choice-${index}-description` : undefined]
                  .filter(Boolean)
                  .join(" ") || undefined
              }
              aria-invalid={invalid || undefined}
              aria-label={choice.label}
              checked={choice.value === value}
              className="mt-0.5 accent-primary"
              disabled={disabled}
              id={index === selected ? id : `${id}-choice-${index}`}
              name={id}
              onBlur={onBlur}
              onChange={() => onChange(choice.value)}
              onKeyDown={(event) => {
                if (event.currentTarget.disabled || event.currentTarget.matches(":disabled"))
                  return;
                let next: number;
                switch (event.key) {
                  case "ArrowRight":
                  case "ArrowDown":
                    next = (index + 1) % choices.length;
                    break;
                  case "ArrowLeft":
                  case "ArrowUp":
                    next = (index - 1 + choices.length) % choices.length;
                    break;
                  case "Home":
                    next = 0;
                    break;
                  case "End":
                    next = choices.length - 1;
                    break;
                  default:
                    return;
                }
                event.preventDefault();
                onChange(choices[next]!.value);
                radios.current[next]?.focus();
              }}
              ref={(element) => {
                radios.current[index] = element;
              }}
              tabIndex={index === selected ? 0 : -1}
              type="radio"
              value={choice.value}
            />
            <span className="min-w-0 text-sm font-medium wrap-anywhere">{choice.label}</span>
          </span>
          {choice.diagram ? (
            <span
              aria-hidden="true"
              className="relative mx-auto block aspect-square w-full max-w-24 rounded-sm bg-muted"
            >
              {choice.diagram.cells.map((cell, cellIndex) => (
                <span
                  className="absolute rounded-xs bg-muted-foreground/60"
                  key={cellIndex}
                  style={{
                    left: `${(cell.x / 12) * 100}%`,
                    top: `${(cell.y / 12) * 100}%`,
                    width: `${(cell.width / 12) * 100}%`,
                    height: `${(cell.height / 12) * 100}%`,
                  }}
                />
              ))}
            </span>
          ) : null}
          {choice.description ? (
            <span
              className="text-xs text-muted-foreground wrap-anywhere"
              id={`${id}-choice-${index}-description`}
            >
              {choice.description}
            </span>
          ) : null}
        </label>
      ))}
    </div>
  );
}
