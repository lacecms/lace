import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useSessionRecovery } from "../../entities/session/index.js";
import { adminQueryKeys, errorDescription, useAdminClient } from "../../shared/api/index.js";
import { toast } from "../../shared/ui/Toaster/index.js";

/**
 * Duplicates a collection entry's saved draft, guarded by the revision the
 * caller displays, then opens the copy. There is no confirmation: the copy is
 * an unpublished draft. Failures are announced without navigation.
 */
export function useDuplicateEntry(modelKey: string) {
  const client = useAdminClient();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const duplicate = useMutation({
    mutationFn: (input: { readonly entryId: string; readonly expectedRevision: number }) =>
      client.duplicateEntry(input.entryId, input.expectedRevision),
    onError: (error) => {
      toast.error(`Could not duplicate the entry. ${errorDescription(error)}`);
    },
    onSuccess: (copy) => {
      queryClient.setQueryData(adminQueryKeys.entry(copy.id), copy);
      void queryClient.invalidateQueries({ queryKey: adminQueryKeys.modelEntries(modelKey) });
      void queryClient.invalidateQueries({ queryKey: adminQueryKeys.models });
      toast.success(`Created “${copy.draft.title}”.`);
      // An unsaved editor may still ask to stay; the copy exists either way.
      void navigate({ params: { entryId: copy.id, modelKey }, to: "/content/$modelKey/$entryId" });
    },
  });
  useSessionRecovery(duplicate.error);
  return duplicate;
}
