import type { ComponentType } from "react";
import type { FieldDefinition } from "../../shared/editor-contract/index.js";
export type {
  FieldDefinition,
  FieldPreview,
  FieldPreviewProps,
  FieldPreviewRegistry,
  ItemPreview,
} from "../../shared/editor-contract/index.js";

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
