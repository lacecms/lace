import type { ContentModelDto } from "@lacecms/contracts";
import type { ComponentType } from "react";

export type FieldDefinition = ContentModelDto["fields"][string];

/** Everything a field control needs; the surrounding label, help, and error are shared. */
export interface FieldRendererProps {
  readonly definition: FieldDefinition;
  readonly describedBy: string | undefined;
  readonly fieldKey: string;
  readonly id: string;
  /** Whether the field currently has an error; controls mark themselves invalid. */
  readonly invalid: boolean;
  readonly label: string;
  readonly onBlur: () => void;
  readonly onChange: (value: unknown) => void;
  /** Text shown while the field is empty, such as an inherited value; text controls apply it. */
  readonly placeholder?: string | undefined;
  /** Whether the editor is view only; native controls are also disabled by a fieldset. */
  readonly readOnly: boolean;
  readonly value: unknown;
}

/**
 * Maps field types to their controls. Higher layers provide renderers that need
 * their own data or actions (the media picker) through `FieldRendererProvider`.
 */
export type FieldRendererRegistry = Partial<
  Record<FieldDefinition["type"], ComponentType<FieldRendererProps>>
>;

/** The DOM id of the control for a model or block field's form name. */
export function fieldControlId(
  name:
    | `blocks.${number}.${"anchor" | "className"}`
    | `blocks.${number}.${"data" | "settings"}.${string}`
    | `fields.${string}`,
): string {
  return `field-${name.replaceAll(".", "-")}`;
}
