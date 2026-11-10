import { useEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { cn, REVEAL_CONTROL_EVENT } from "../../../shared/lib/index.js";
import { Button } from "../../../shared/ui/Button/index.js";
import { fieldErrorClass } from "../../../shared/ui/layout/index.js";
import { useCompositeEditing } from "../EditorContext/index.js";
import { Chevron, errorMessage, hasProblems } from "../FieldNode/index.js";

/** Disclosures register a synchronous reveal listener while keeping descendants mounted. */
export function Disclosure({
  children,
  label,
  id,
  description,
  guidance,
  required,
  error,
  suffix,
}: {
  readonly children: ReactNode;
  readonly label: string;
  readonly id: string;
  readonly description?: string | undefined;
  readonly guidance?: string | undefined;
  readonly required?: boolean;
  readonly error?: unknown;
  readonly suffix?: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const { readOnly } = useCompositeEditing();
  const ref = useRef<HTMLFieldSetElement>(null);
  useEffect(() => {
    const element = ref.current;
    const reveal = () => flushSync(() => setOpen(true));
    element?.addEventListener(REVEAL_CONTROL_EVENT, reveal);
    return () => element?.removeEventListener(REVEAL_CONTROL_EVENT, reveal);
  }, []);
  return (
    <fieldset
      aria-describedby={
        [
          description ? `${id}:description` : undefined,
          guidance ? `${id}:guidance` : undefined,
          errorMessage(error) ? `${id}:error` : undefined,
        ]
          .filter(Boolean)
          .join(" ") || undefined
      }
      className="grid min-w-0 gap-2 rounded-md border border-border p-3"
      id={id}
      ref={ref}
      tabIndex={-1}
    >
      <legend className="px-1 text-sm font-medium">
        {label}
        {required ? (
          <span aria-hidden="true" className="ml-1 text-xs text-muted-foreground">
            Required
          </span>
        ) : null}
      </legend>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          aria-controls={`${id}:body`}
          aria-expanded={open}
          aria-label={`${open ? "Collapse" : "Expand"} ${label}`}
          onClick={() => setOpen(!open)}
          size="icon-sm"
          variant="ghost"
        >
          <Chevron open={open} />
        </Button>
        {suffix}
        {hasProblems(error) ? <span className="text-xs text-destructive">Has problems</span> : null}
      </div>
      {description ? (
        <small className="text-muted-foreground" id={`${id}:description`}>
          {description}
        </small>
      ) : null}
      {guidance ? (
        <small
          className={cn("text-muted-foreground", !readOnly && !hasProblems(error) && "sr-only")}
          id={`${id}:guidance`}
        >
          {guidance}
        </small>
      ) : null}
      {errorMessage(error) ? (
        <p className={fieldErrorClass} id={`${id}:error`} role="alert">
          {errorMessage(error)}
        </p>
      ) : null}
      <div className="grid min-w-0 gap-3" hidden={!open} id={`${id}:body`}>
        {children}
      </div>
    </fieldset>
  );
}
