import type { ImportTokenCreatedDto } from "@lacecms/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { useId, useState } from "react";
import { useCan } from "../../../entities/session/index.js";
import {
  adminQueryKeys,
  errorDescription,
  technicalDetails,
  useAdminClient,
} from "../../../shared/api/index.js";
import { formatAbsoluteTime } from "../../../shared/lib/index.js";
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
import { checkboxClass, fieldClass } from "../../../shared/ui/layout/index.js";
import { OnceShownSecret } from "../../../shared/ui/OnceShownSecret/index.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../shared/ui/Select/index.js";
import { TextField } from "../../../shared/ui/TextField/index.js";

const expiryOptions = [
  { label: "1 day", value: "1" },
  { label: "3 days", value: "3" },
  { label: "7 days", value: "7" },
] as const;

/**
 * Issues a short-lived import token for `lace import`. Like build tokens, the
 * plaintext lives only in this component's state and is dropped when the dialog
 * closes or unmounts. Publishing is offered only to people who may publish.
 */
export function CreateImportTokenDialog() {
  const client = useAdminClient();
  const queryClient = useQueryClient();
  const canPublish = useCan("content:publish");
  const expiryId = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("1");
  const [allowPublish, setAllowPublish] = useState(false);
  const [issued, setIssued] = useState<ImportTokenCreatedDto>();
  const create = useMutation({
    mutationFn: async () => {
      setIssued(
        await client.createImportToken({
          allowPublish: canPublish && allowPublish,
          expiresInDays: Number(expiresInDays),
          name: name.trim(),
        }),
      );
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminQueryKeys.importTokens }),
  });
  function changeOpen(next: boolean) {
    setOpen(next);
    if (!next) {
      setName("");
      setExpiresInDays("1");
      setAllowPublish(false);
      setIssued(undefined);
      create.reset();
    }
  }
  return (
    <Dialog onOpenChange={changeOpen} open={open}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload aria-hidden="true" />
          Create import token
        </Button>
      </DialogTrigger>
      <DialogContent
        onInteractOutside={(event) => {
          if (issued !== undefined) event.preventDefault();
        }}
      >
        {issued === undefined ? (
          <>
            <DialogHeader>
              <DialogTitle>Create import token</DialogTitle>
              <DialogDescription>
                An import token lets lace import write drafts and media as you until it expires. It
                cannot delete, unpublish or manage users and settings.
              </DialogDescription>
            </DialogHeader>
            <form
              className="grid gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (name.trim().length > 0) create.mutate();
              }}
            >
              <TextField
                label="Token name"
                maxLength={120}
                onChange={(event) => setName(event.currentTarget.value)}
                placeholder="For example, Framer migration"
                required
                value={name}
              />
              <div className={fieldClass}>
                <span id={expiryId}>Expires after</span>
                <Select onValueChange={setExpiresInDays} value={expiresInDays}>
                  <SelectTrigger aria-labelledby={expiryId} className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {expiryOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {canPublish ? (
                <label className={`${checkboxClass} text-sm`}>
                  <input
                    checked={allowPublish}
                    className="size-3.5 accent-primary"
                    onChange={(event) => setAllowPublish(event.currentTarget.checked)}
                    type="checkbox"
                  />
                  Allow publishing
                </label>
              ) : undefined}
              {create.error === null ? undefined : (
                <ErrorState
                  description={errorDescription(create.error)}
                  technicalDetails={technicalDetails(create.error)}
                  title="Token not created"
                />
              )}
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    Cancel
                  </Button>
                </DialogClose>
                <Button disabled={name.trim().length === 0 || create.isPending} type="submit">
                  {create.isPending ? "Creating…" : "Create import token"}
                </Button>
              </DialogFooter>
            </form>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Copy your import token</DialogTitle>
              <DialogDescription>
                {`This is the only time “${issued.name}” is shown. It expires ${formatAbsoluteTime(issued.expiresAt)}. Pass it to lace import as LACE_IMPORT_TOKEN.`}
              </DialogDescription>
            </DialogHeader>
            <OnceShownSecret name="token" value={issued.token} valueTestId="issued-import-token" />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
