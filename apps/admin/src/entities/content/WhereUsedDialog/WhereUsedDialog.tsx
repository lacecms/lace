import { useRef, useState, type RefObject } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../shared/ui/Dialog/index.js";
import { Button } from "../../../shared/ui/Button/index.js";
import { ReferenceImpactReview, useReferenceImpactReview } from "../ReferenceImpactReview/index.js";

export function WhereUsedButton({
  entryId,
  title,
  disabled,
}: {
  readonly entryId: string;
  readonly title: string;
  readonly disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <Button
        aria-haspopup="dialog"
        disabled={disabled}
        onClick={() => setOpen(true)}
        ref={trigger}
        variant="outline"
      >
        Where used
      </Button>
      <WhereUsedDialog
        entryId={entryId}
        onOpenChange={setOpen}
        open={open}
        returnFocus={trigger}
        title={title}
      />
    </>
  );
}

export function WhereUsedDialog({
  entryId,
  onOpenChange,
  open,
  returnFocus,
  title,
}: {
  readonly entryId: string;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
  readonly returnFocus: RefObject<HTMLElement | null>;
  readonly title: string;
}) {
  const impact = useReferenceImpactReview(entryId, "delete", open);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocus.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Where used</DialogTitle>
          <DialogDescription>Entries that directly select “{title}”.</DialogDescription>
        </DialogHeader>
        <ReferenceImpactReview inspect review={impact} onNavigate={() => onOpenChange(false)} />
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
