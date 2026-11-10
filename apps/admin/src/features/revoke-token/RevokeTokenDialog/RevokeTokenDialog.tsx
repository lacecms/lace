import type { BuildTokenDto, ImportTokenDto } from "@lacecms/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  adminQueryKeys,
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
  DialogTrigger,
} from "../../../shared/ui/Dialog/index.js";
import { ErrorState } from "../../../shared/ui/ErrorState/index.js";
import { toast } from "../../../shared/ui/Toaster/index.js";

/** Revokes a token after confirmation naming its effect. */
export function RevokeTokenDialog({
  kind,
  token,
}:
  | { readonly kind: "build"; readonly token: BuildTokenDto }
  | { readonly kind: "import"; readonly token: ImportTokenDto }) {
  const client = useAdminClient();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const revoke = useMutation({
    mutationFn: async () => {
      if (kind === "build") await client.revokeToken(token.id);
      else await client.revokeImportToken(token.id);
    },
    onSuccess: async () => {
      setOpen(false);
      toast.success(`Revoked ${token.name}.`);
      await queryClient.invalidateQueries({
        queryKey: kind === "build" ? adminQueryKeys.tokens : adminQueryKeys.importTokens,
      });
    },
  });
  return (
    <Dialog
      onOpenChange={(next) => {
        setOpen(next);
        revoke.reset();
      }}
      open={open}
    >
      <DialogTrigger asChild>
        <Button aria-label={`Revoke ${token.name}`} size="sm" variant="outline">
          Revoke
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Revoke {kind} token?</DialogTitle>
          <DialogDescription>
            {kind === "build"
              ? `Sites using “${token.name}” can no longer read published content, so their builds fail until they use a new token. This cannot be undone.`
              : `Imports using “${token.name}” stop at their next request. Content already imported stays. This cannot be undone.`}
          </DialogDescription>
        </DialogHeader>
        {revoke.error === null ? undefined : (
          <ErrorState
            description={errorDescription(revoke.error)}
            technicalDetails={technicalDetails(revoke.error)}
            title="Token not revoked"
          />
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button disabled={revoke.isPending} onClick={() => revoke.mutate()} variant="destructive">
            {revoke.isPending ? "Revoking…" : "Revoke token"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
