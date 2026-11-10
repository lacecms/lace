import type { ReactNode } from "react";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "../../../shared/lib/index.js";
import type { FieldDefinition } from "../field-types.js";

export type Errors = Record<string, unknown> | undefined;
export function errorMessage(error: unknown): string | undefined {
  return error !== null &&
    typeof error === "object" &&
    typeof (error as Record<string, unknown>).message === "string"
    ? ((error as Record<string, unknown>).message as string)
    : undefined;
}
export function hasProblems(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    (typeof (error as Record<string, unknown>).message === "string" ||
      Object.values(error).some(hasProblems))
  );
}

/** The disclosure toggle icon shared with block cards: pointing down while open. */
export function Chevron({ open }: { readonly open: boolean }) {
  return (
    <ChevronDownIcon
      aria-hidden
      className={cn(
        "transition-transform duration-(--duration-fast) ease-standard",
        !open && "-rotate-90",
      )}
    />
  );
}

export interface NodeProps {
  readonly definition: FieldDefinition;
  readonly name: string;
  readonly fieldKey: string;
  readonly value: unknown;
  readonly onChange: (value: unknown) => void;
  readonly onBlur: () => void;
  readonly errors?: Errors;
  readonly onErrors?: ((errors: Errors) => void) | undefined;
  readonly item?: boolean;
  readonly annotation?: string | undefined;
  readonly notice?: ReactNode;
  readonly placeholder?: string | undefined;
}
