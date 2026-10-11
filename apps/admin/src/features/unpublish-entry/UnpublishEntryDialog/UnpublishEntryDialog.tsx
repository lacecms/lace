import type { ContentModelDto, UnpublishContentEntryResultDto } from "@lacecms/contracts";
import { useMutation } from "@tanstack/react-query";
import { type RefObject, useRef } from "react";
import { ulid } from "ulid";
import {
  AdminClientError,
  errorDescription,
  technicalDetails,
  useAdminClient,
} from "../../../shared/api/index.js";
import { Button } from "../../../shared/ui/Button/index.js";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../shared/ui/Dialog/index.js";
import { ErrorState } from "../../../shared/ui/ErrorState/index.js";

const staleCodes = new Set(["CONTENT_NOT_PUBLISHED", "CONTENT_REVISION_CONFLICT"]);

function consequence(kind: ContentModelDto["kind"], publicPath: string | undefined): string {
  if (kind === "global")
    return "Pages that show this content fall back to their defaults after the next site build.";
  if (kind === "page")
    return publicPath === undefined
      ? "The page will return 404 after the next site build."
      : `The page's fixed path ${publicPath} will return 404 after the next site build.`;
  return publicPath === undefined
    ? "The entry leaves the site after the next site build."
    : `Its public path ${publicPath} stops working after the next site build.`;
}

/**
 * Confirms removing the displayed publication. The draft, including unsaved
 * changes, stays. One idempotency key covers an attempt: a retry after a
 * network failure reuses it, and a terminal server response retires it.
 */
export function UnpublishEntryDialog({
  entryId,
  expectedPublishedSnapshotId,
  kind,
  onOpenChange,
  onReload,
  onUnpublished,
  open,
  publicPath,
  returnFocus,
}: {
  readonly entryId: string;
  readonly expectedPublishedSnapshotId: string;
  readonly kind: ContentModelDto["kind"];
  readonly onOpenChange: (open: boolean) => void;
  readonly onReload: () => void;
  readonly onUnpublished: (result: UnpublishContentEntryResultDto) => void;
  readonly open: boolean;
  readonly publicPath?: string | undefined;
  readonly returnFocus?: RefObject<HTMLElement | null>;
}) {
  const client = useAdminClient();
  const attemptKey = useRef<string | undefined>(undefined);
  const unpublish = useMutation({
    mutationFn: (idempotencyKey: string) =>
      client.unpublishEntry(entryId, { expectedPublishedSnapshotId, idempotencyKey }),
    onError: (error) => {
      if (error instanceof AdminClientError && error.status !== undefined)
        attemptKey.current = undefined;
    },
    onSuccess: (result) => {
      attemptKey.current = undefined;
      onOpenChange(false);
      onUnpublished(result);
    },
  });
  const stale =
    unpublish.error instanceof AdminClientError &&
    unpublish.error.code !== undefined &&
    staleCodes.has(unpublish.error.code);
  return (
    <Dialog
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) unpublish.reset();
      }}
      open={open}
    >
      <DialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocus?.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {kind === "page"
              ? "Unpublish this page?"
              : kind === "global"
                ? "Unpublish this site content?"
                : "Unpublish this entry?"}
          </DialogTitle>
          <DialogDescription>
            {`${consequence(kind, publicPath)} The draft and any unsaved changes are kept; publishing again makes the current draft public.`}
          </DialogDescription>
        </DialogHeader>
        {unpublish.error === null ? undefined : (
          <ErrorState
            description={errorDescription(unpublish.error)}
            technicalDetails={technicalDetails(unpublish.error)}
          />
        )}
        <DialogFooter>
          {stale ? (
            <Button
              onClick={() => {
                onOpenChange(false);
                unpublish.reset();
                onReload();
              }}
              variant="outline"
            >
              Reload entry
            </Button>
          ) : (
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
          )}
          <Button
            disabled={unpublish.isPending || stale}
            onClick={() => {
              attemptKey.current ??= ulid();
              unpublish.mutate(attemptKey.current);
            }}
            variant="destructive"
          >
            {unpublish.isPending ? "Unpublishing…" : "Unpublish"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
