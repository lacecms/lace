import type { ContentEntrySummaryDto } from "@lacecms/contracts";
import { Link } from "@tanstack/react-router";
import { CopyIcon, MoreHorizontalIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { useRef, useState } from "react";
import { entryActions } from "../../../entities/content/index.js";
import { DeleteEntryDialog } from "../../../features/delete-entry/index.js";
import { useDuplicateEntry } from "../../../features/duplicate-entry/index.js";
import { Button } from "../../../shared/ui/Button/index.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../../shared/ui/DropdownMenu/index.js";

/**
 * A collection row's labeled actions menu: Open, Duplicate and, where the
 * permissions and publication state allow, Delete. Delete opens after the menu
 * closes so a dismissed confirmation returns focus to the menu button.
 */
export function EntryRowActions({
  canPublish,
  entry,
  modelKey,
  onDeleted,
}: {
  readonly canPublish: boolean;
  readonly entry: ContentEntrySummaryDto;
  readonly modelKey: string;
  readonly onDeleted?: () => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const deleteSelected = useRef(false);
  const [deleting, setDeleting] = useState(false);
  const duplicate = useDuplicateEntry(modelKey);
  const published = entry.status !== "draft";
  const actions = entryActions({
    canPublish,
    canWrite: true,
    kind: "collection",
    published,
    savedChanges: entry.status === "changed",
    unsavedChanges: false,
  });
  return (
    <>
      {/* Non-modal: a modal menu hides the page with aria-hidden while its controls stay focusable. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={`Actions for ${entry.title}`}
            disabled={duplicate.isPending}
            ref={trigger}
            size="icon-sm"
            variant="ghost"
          >
            <MoreHorizontalIcon aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          onCloseAutoFocus={(event) => {
            if (!deleteSelected.current) return;
            deleteSelected.current = false;
            event.preventDefault();
            setDeleting(true);
          }}
        >
          <DropdownMenuItem asChild>
            <Link params={{ entryId: entry.id, modelKey }} to="/content/$modelKey/$entryId">
              <PencilIcon aria-hidden />
              Open
            </Link>
          </DropdownMenuItem>
          {actions.duplicate ? (
            <DropdownMenuItem
              onSelect={() =>
                duplicate.mutate({ entryId: entry.id, expectedRevision: entry.draftRevision })
              }
            >
              <CopyIcon aria-hidden />
              Duplicate
            </DropdownMenuItem>
          ) : undefined}
          {actions.delete ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => {
                  deleteSelected.current = true;
                }}
                variant="destructive"
              >
                <Trash2Icon aria-hidden />
                Delete
              </DropdownMenuItem>
            </>
          ) : undefined}
        </DropdownMenuContent>
      </DropdownMenu>
      {actions.delete ? (
        <DeleteEntryDialog
          entryId={entry.id}
          expectedRevision={entry.draftRevision}
          modelKey={modelKey}
          onOpenChange={setDeleting}
          open={deleting}
          published={published}
          returnFocus={trigger}
          title={entry.title}
          {...(onDeleted === undefined ? {} : { onDeleted })}
        />
      ) : undefined}
    </>
  );
}
