import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { suggestSlug } from "../../../entities/content/index.js";
import { MAX_SLUG_LENGTH } from "@lacecms/content";
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
  const [manualSlug, setManualSlug] = useState("");
  const [automaticSlug, setAutomaticSlug] = useState(true);
  const slug = automaticSlug ? suggestSlug(title) : manualSlug;
  const trimmedTitle = title.trim();
  const create = useMutation({
    mutationFn: () => client.createEntry(modelKey, trimmedTitle, slug === "" ? undefined : slug),
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
      setManualSlug("");
      setAutomaticSlug(true);
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
            {`Add a draft to ${collectionLabel ?? modelKey}. Choose its slug here and edit its fields in the editor.`}
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
            disabled={create.isPending}
            maxLength={200}
            onChange={(event) => setTitle(event.currentTarget.value)}
            required
            value={title}
          />
          <TextField
            label="Slug"
            aria-describedby="create-slug-guidance"
            disabled={create.isPending}
            maxLength={MAX_SLUG_LENGTH}
            onChange={(event) => {
              setManualSlug(event.currentTarget.value);
              setAutomaticSlug(false);
            }}
            value={slug}
          />
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={automaticSlug}
              disabled={create.isPending}
              onChange={(event) => {
                setManualSlug(slug);
                setAutomaticSlug(event.currentTarget.checked);
              }}
            />
            Suggest from title
          </label>
          <p className="text-xs text-muted-foreground" id="create-slug-guidance">
            {slug === ""
              ? "Enter a slug manually if the title has no Latin letters or digits. You can also leave it empty for now."
              : "Use lowercase letters, digits and hyphens. Availability is checked by the server."}
          </p>
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
