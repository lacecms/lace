import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
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
import { TextField } from "../../../shared/ui/TextField/index.js";

/** Creates a draft entry in a collection from its title and opens it in the editor. */
export function CreateEntryDialog({
  collectionLabel,
  modelKey,
}: {
  readonly collectionLabel?: string;
  readonly modelKey: string;
}) {
  const client = useAdminClient();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const trimmedTitle = title.trim();
  const create = useMutation({
    mutationFn: () => client.createEntry(modelKey, trimmedTitle),
    onSuccess: async (created) => {
      queryClient.setQueryData(adminQueryKeys.entry(created.id), created);
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.modelEntries(modelKey) });
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.models });
      changeOpen(false);
      await navigate({
        params: { entryId: created.id, modelKey },
        to: "/content/$modelKey/$entryId",
      });
    },
  });
  function changeOpen(next: boolean) {
    setOpen(next);
    if (!next) {
      setTitle("");
      create.reset();
    }
  }
  return (
    <Dialog onOpenChange={changeOpen} open={open}>
      <DialogTrigger asChild>
        <Button>
          <Plus aria-hidden="true" />
          Create entry
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create entry</DialogTitle>
          <DialogDescription>
            {`Add a draft to ${collectionLabel ?? modelKey}. You can set its slug and fields in the editor.`}
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (trimmedTitle.length > 0) create.mutate();
          }}
        >
          <TextField
            label="Title"
            maxLength={200}
            onChange={(event) => setTitle(event.currentTarget.value)}
            required
            value={title}
          />
          {create.error === null ? undefined : (
            <ErrorState
              description={errorDescription(create.error)}
              technicalDetails={technicalDetails(create.error)}
            />
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button disabled={trimmedTitle.length === 0 || create.isPending} type="submit">
              {create.isPending ? "Creating…" : "Create entry"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
