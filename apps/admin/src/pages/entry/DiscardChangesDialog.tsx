import { Button } from "../../shared/ui/Button/index.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../shared/ui/Dialog/index.js";

/** Modal leave-or-stay prompt for a dirty draft; dismissing it means stay. */
export function DiscardChangesDialog({
  onLeave,
  onStay,
  open,
}: {
  readonly onLeave: () => void;
  readonly onStay: () => void;
  readonly open: boolean;
}) {
  return (
    <Dialog
      onOpenChange={(next) => {
        if (!next) onStay();
      }}
      open={open}
    >
      <DialogContent role="alertdialog" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Discard unsaved changes?</DialogTitle>
          <DialogDescription>Your draft has not been saved.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={onLeave} variant="outline">
            Leave without saving
          </Button>
          <Button autoFocus onClick={onStay}>
            Stay
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
