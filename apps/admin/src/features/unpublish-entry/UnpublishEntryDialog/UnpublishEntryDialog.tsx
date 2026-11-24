import { resolveModelKind, type ResolvedModelKind } from "@lacecms/content";
import {
  useLinkImpactReview,
  LinkImpactReview,
  isLinkImpactChanged,
  isReferenceImpactChanged,
  ReferenceImpactReview,
  useReferenceImpactReview,
} from "../../../entities/content/index.js";
import type { ContentModelDto, UnpublishContentEntryResultDto } from "@lacecms/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { RefObject } from "react";
import { ulid } from "ulid";
import {
  AdminClientError,
  adminQueryKeys,
  errorDescription,
  technicalDetails,
  useAdminClient,
  type AdminClient,
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
type UnpublishAttempt = Parameters<AdminClient["unpublishEntry"]>;

function consequence(
  family: ResolvedModelKind["publicFamily"],
  publicPath: string | undefined,
): string {
  if (family === "records")
    return "The entry disappears from the pages that list it after the next site build.";
  if (family === "globals")
    return "Pages that show this content fall back to their defaults after the next site build.";
  if (family === "pages")
    return publicPath === undefined
      ? "The page will return 404 after the next site build."
      : `The page's fixed path ${publicPath} will return 404 after the next site build.`;
  return publicPath === undefined
    ? "The entry leaves the site after the next site build."
    : `Its public path ${publicPath} stops working after the next site build.`;
}

const subject = {
  pages: "page",
  collections: "entry",
  records: "entry",
  globals: "site content",
} as const;

/**
 * Confirms removing the displayed publication. The draft, including unsaved
 * changes, stays. One idempotency key covers an attempt: a retry after a
 * network failure reuses it, and a terminal server response retires it.
 */
export function UnpublishEntryDialog({
  entryId,
  expectedPublishedSnapshotId,
  model,
  onOpenChange,
  onReload,
  onUnpublished,
  open,
  publicPath,
  returnFocus,
}: {
  readonly entryId: string;
  readonly expectedPublishedSnapshotId: string;
  readonly model: Pick<ContentModelDto, "kind" | "route">;
  readonly onOpenChange: (open: boolean) => void;
  readonly onReload: () => void;
  readonly onUnpublished: (result: UnpublishContentEntryResultDto) => void;
  readonly open: boolean;
  readonly publicPath?: string | undefined;
  readonly returnFocus?: RefObject<HTMLElement | null>;
}) {
  const { publicFamily } = resolveModelKind(model);
  const client = useAdminClient();
  const queryClient = useQueryClient();
  const impact = useLinkImpactReview(entryId, "unpublish", open);
  const references = useReferenceImpactReview(entryId, "unpublish", open);
  const unpublish = useMutation({
    mutationFn: (attempt: UnpublishAttempt) => client.unpublishEntry(...attempt),
    onError: (error) => {
      if (isLinkImpactChanged(error)) impact.refresh();
      if (isReferenceImpactChanged(error)) references.refresh();
    },
    onSuccess: (result) => {
      onOpenChange(false);
      void queryClient.invalidateQueries({ queryKey: adminQueryKeys.references });
      onUnpublished(result);
    },
  });
  const stale =
    unpublish.error instanceof AdminClientError &&
    unpublish.error.code !== undefined &&
    staleCodes.has(unpublish.error.code);
  const retry =
    unpublish.isError &&
    unpublish.variables[0] === entryId &&
    !(unpublish.error instanceof AdminClientError && unpublish.error.status !== undefined) &&
    !isLinkImpactChanged(unpublish.error) &&
    !isReferenceImpactChanged(unpublish.error)
      ? unpublish.variables
      : undefined;
  const canSubmit =
    open &&
    !unpublish.isPending &&
    !stale &&
    (retry !== undefined || (impact.ready && references.ready));
  return (
    <Dialog
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) unpublish.reset();
      }}
      open={open}
    >
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocus?.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Unpublish this {subject[publicFamily]}?</DialogTitle>
          <DialogDescription>
            {`${consequence(publicFamily, publicPath)} The draft and any unsaved changes are kept; publishing again makes the current draft public.`}
          </DialogDescription>
        </DialogHeader>
        {unpublish.error === null ? undefined : (
          <ErrorState
            description={errorDescription(unpublish.error)}
            technicalDetails={technicalDetails(unpublish.error)}
          />
        )}
        <LinkImpactReview review={impact} />
        <ReferenceImpactReview
          review={references}
          onNavigate={() => {
            onOpenChange(false);
            unpublish.reset();
          }}
        />
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
            disabled={!canSubmit}
            onClick={() => {
              if (!canSubmit) return;
              if (retry) {
                unpublish.mutate(retry);
                return;
              }
              unpublish.mutate([
                entryId,
                {
                  expectedPublishedSnapshotId,
                  idempotencyKey: ulid(),
                  ...(impact.acknowledgment === undefined
                    ? {}
                    : { linkImpact: impact.acknowledgment }),
                },
              ]);
            }}
            variant="destructive"
          >
            {unpublish.isPending
              ? "Unpublishing…"
              : retry
                ? "Retry previous unpublish"
                : "Unpublish"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
