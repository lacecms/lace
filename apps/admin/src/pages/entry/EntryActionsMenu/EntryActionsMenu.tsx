import type {
  AdminContentEntryDto,
  ContentModelDto,
  UnpublishContentEntryResultDto,
} from "@lacecms/contracts";
import { CopyIcon, EyeOffIcon, MoreHorizontalIcon, RotateCcwIcon, Trash2Icon } from "lucide-react";
import { useRef, useState } from "react";
import {
  entryActions,
  entryStatus,
  hasEntryActions,
  resolvedPublicPath,
} from "../../../entities/content/index.js";
import { DeleteEntryDialog } from "../../../features/delete-entry/index.js";
import { RevertEntryDialog } from "../../../features/revert-entry/index.js";
import { UnpublishEntryDialog } from "../../../features/unpublish-entry/index.js";
import { Button } from "../../../shared/ui/Button/index.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../../shared/ui/DropdownMenu/index.js";

type ConfirmedAction = "delete" | "revert" | "unpublish";

/**
 * The editor header's entry actions menu. It offers only what the permissions
 * and entry state allow, and opens each confirmation after the menu has closed
 * so focus can return to the menu button when the dialog is dismissed.
 */
export function EntryActionsMenu({
  busy,
  canPublish,
  canWrite,
  entry,
  model,
  onDeleted,
  onDiscardUnsaved,
  onDuplicate,
  onReload,
  onReverted,
  onUnpublished,
  unsavedChanges,
}: {
  readonly busy: boolean;
  readonly canPublish: boolean;
  readonly canWrite: boolean;
  readonly entry: AdminContentEntryDto;
  readonly model: ContentModelDto;
  readonly onDeleted: () => void;
  readonly onDiscardUnsaved: () => void;
  readonly onDuplicate: () => void;
  readonly onReload: () => void;
  readonly onReverted: (entry: AdminContentEntryDto) => void;
  readonly onUnpublished: (result: UnpublishContentEntryResultDto) => void;
  readonly unsavedChanges: boolean;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const selected = useRef<ConfirmedAction | undefined>(undefined);
  const [open, setOpen] = useState<ConfirmedAction | undefined>(undefined);
  const savedChanges = entryStatus(entry) === "changed";
  const actions = entryActions({
    canPublish,
    canWrite,
    kind: model.kind,
    published: entry.published !== undefined,
    savedChanges,
    unsavedChanges,
  });
  // The button stays while the user may act, so focus has a home after an action empties it.
  if (!canWrite && !canPublish) return null;
  const openAfterMenu = (action: ConfirmedAction) => () => {
    selected.current = action;
  };
  const dialogState = (action: ConfirmedAction) => ({
    onOpenChange: (next: boolean) => setOpen(next ? action : undefined),
    open: open === action,
    returnFocus: trigger,
  });
  return (
    <>
      {/* Non-modal: a modal menu hides the page with aria-hidden while its controls stay focusable. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label="Entry actions"
            disabled={busy}
            ref={trigger}
            size="icon"
            variant="outline"
          >
            <MoreHorizontalIcon aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          onCloseAutoFocus={(event) => {
            const action = selected.current;
            selected.current = undefined;
            if (action === undefined) return;
            event.preventDefault();
            setOpen(action);
          }}
        >
          {hasEntryActions(actions) ? undefined : (
            <DropdownMenuItem disabled>No actions available for this entry</DropdownMenuItem>
          )}
          {actions.duplicate ? (
            <DropdownMenuItem onSelect={onDuplicate}>
              <CopyIcon aria-hidden />
              Duplicate
            </DropdownMenuItem>
          ) : undefined}
          {actions.revert ? (
            <DropdownMenuItem onSelect={openAfterMenu("revert")}>
              <RotateCcwIcon aria-hidden />
              Revert to published
            </DropdownMenuItem>
          ) : undefined}
          {actions.unpublish ? (
            <DropdownMenuItem onSelect={openAfterMenu("unpublish")}>
              <EyeOffIcon aria-hidden />
              Unpublish
            </DropdownMenuItem>
          ) : undefined}
          {actions.delete ? (
            <>
              {actions.duplicate || actions.revert || actions.unpublish ? (
                <DropdownMenuSeparator />
              ) : undefined}
              <DropdownMenuItem onSelect={openAfterMenu("delete")} variant="destructive">
                <Trash2Icon aria-hidden />
                Delete
              </DropdownMenuItem>
            </>
          ) : undefined}
        </DropdownMenuContent>
      </DropdownMenu>
      {actions.revert ? (
        <RevertEntryDialog
          {...dialogState("revert")}
          entryId={entry.id}
          expectedRevision={entry.draft.revision}
          onDiscardUnsaved={onDiscardUnsaved}
          onReverted={onReverted}
          savedChanges={savedChanges}
          unsavedChanges={unsavedChanges}
        />
      ) : undefined}
      {actions.unpublish && entry.published !== undefined ? (
        <UnpublishEntryDialog
          {...dialogState("unpublish")}
          entryId={entry.id}
          expectedPublishedSnapshotId={entry.published.id}
          kind={model.kind}
          onReload={onReload}
          onUnpublished={onUnpublished}
          publicPath={resolvedPublicPath(model, entry)}
        />
      ) : undefined}
      {actions.delete ? (
        <DeleteEntryDialog
          {...dialogState("delete")}
          entryId={entry.id}
          expectedRevision={entry.draft.revision}
          modelKey={model.key}
          onDeleted={onDeleted}
          published={entry.published !== undefined}
          title={entry.draft.title}
        />
      ) : undefined}
    </>
  );
}
