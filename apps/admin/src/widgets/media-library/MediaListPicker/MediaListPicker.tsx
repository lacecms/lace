import type { MediaListPickerProps } from "../../../entities/field-editor/index.js";
import { can, useSession } from "../../../entities/session/index.js";
import { MediaPickerDialog } from "../MediaPickerDialog/index.js";

/**
 * The media picker in multiple mode for an eligible media list: it hands over
 * the selected identifiers in selection order. Only content writers can add
 * list items, so nothing renders for other roles.
 */
export function MediaListPicker({
  capacity,
  existingIds,
  label,
  limitMessage,
  onCloseAutoFocus,
  onConfirm,
  onOpenChange,
  open,
}: MediaListPickerProps) {
  const session = useSession();
  if (!can(session, "content:write")) return null;
  return (
    <MediaPickerDialog
      label={label}
      onCloseAutoFocus={onCloseAutoFocus}
      onOpenChange={onOpenChange}
      open={open}
      selection={{
        capacity,
        existingIds,
        limitMessage,
        onConfirm: (items) => onConfirm(items.map((item) => item.id)),
      }}
    />
  );
}
