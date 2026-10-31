import type { ContentModelDto } from "@lacecms/contracts";
import type { ComponentType, ReactNode } from "react";

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

/**
 * The media picker in multiple mode, provided by a higher layer so eligible
 * media lists can add several items at once. It hands over the selected media
 * identifiers in selection order; the list closes it.
 */
export interface MediaListPickerProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** The list's label, naming the dialog and media already in the list. */
  readonly label: string;
  /** At most this many items can be selected (at least one). */
  readonly capacity: number;
  /** Names the limit that stops the selection at `capacity`. */
  readonly limitMessage: string;
  readonly existingIds: ReadonlySet<string>;
  readonly onConfirm: (ids: readonly string[]) => void;
  /** Receives the dialog's close focus event; prevent it to focus elsewhere. */
  readonly onCloseAutoFocus: (event: Event) => void;
}

/** What a leaf contributes to the collapsed row of the list item that contains it. */
export interface ItemPreview {
  /** Leading visual, such as a thumbnail; the item's position is shown without one. */
  readonly visual?: ReactNode;
  /** Names the value, such as a filename; used when the item has no text summary. */
  readonly title?: string | undefined;
  /** Describes the value, such as type and dimensions; shown under a preview title. */
  readonly detail?: string | undefined;
  /** Advisory notes that never block saving, such as missing alt text. */
  readonly indicators?: readonly string[];
}

/** A leaf preview hands its parts to the row through `children`, so it may use hooks. */
export interface FieldPreviewProps {
  readonly definition: FieldDefinition;
  readonly value: unknown;
  /** The group item containing the leaf, for previews that consider sibling values. */
  readonly group:
    | {
        readonly definition: Extract<FieldDefinition, { type: "group" }>;
        readonly value: unknown;
      }
    | undefined;
  readonly children: (preview: ItemPreview) => ReactNode;
}

/**
 * Maps field types to the previews of collapsed list items. Like renderers,
 * higher layers provide previews that need their own data (media thumbnails).
 */
export type FieldPreviewRegistry = Partial<
  Record<FieldDefinition["type"], ComponentType<FieldPreviewProps>>
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
