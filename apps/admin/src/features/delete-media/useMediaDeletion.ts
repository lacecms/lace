import type { MediaMetadataDto } from "@lacecms/contracts";
import { runDetach, type ConfirmedEntry } from "./detach-sequence.js";
import type { Checkpoint } from "./detach-checkpoint.js";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AdminClientError,
  adminQueryKeys,
  errorDescription,
  useAdminClient,
} from "../../shared/api/index.js";

interface DeleteInput {
  id: string;
  retry: boolean;
  detach?: {
    key: string;
    confirmed: readonly ConfirmedEntry[];
    resume: Checkpoint | null;
    active: () => boolean;
    progress: (p: Checkpoint) => void;
    attempt: () => void;
  };
}
export function useMediaDeletion(onChanged: (item: MediaMetadataDto) => void) {
  const client = useAdminClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, retry, detach }: DeleteInput) =>
      detach
        ? runDetach({ client, id, ...detach })
        : retry
          ? client.retryMediaDeletion(id)
          : client.deleteMedia(id),
    onSuccess: (item) => onChanged(item),
    onSettled: async (_item, _error, { detach }) => {
      const entries = detach?.resume?.drafts ?? detach?.confirmed ?? [];
      await Promise.all([
        ...entries.map((entry) =>
          queryClient.invalidateQueries({ queryKey: adminQueryKeys.entry(entry.entryId) }),
        ),
        ...[...new Set(entries.map((entry) => entry.modelKey))].map((key) =>
          queryClient.invalidateQueries({ queryKey: adminQueryKeys.modelEntries(key) }),
        ),
        queryClient.invalidateQueries({ queryKey: adminQueryKeys.media }),
      ]);
    },
  });
}

/** Explains a refused deletion in terms the editor can act on. */
export function mediaDeletionDescription(
  error: unknown,
  options: { readonly detached?: boolean } = {},
): string {
  const description =
    error instanceof AdminClientError && error.code === "MEDIA_IN_USE"
      ? options.detached === true
        ? "Deletion was refused because content still uses this media: a published version, or an entry that started using it meanwhile. Reload the usage and try again."
        : "Deletion was refused because content still uses this media. Remove it from every entry, publish those entries, and try again."
      : error instanceof AdminClientError && error.code === "CONTENT_INVALID_STATE"
        ? "Deletion was refused because this media is no longer active. Refresh the library before retrying."
        : errorDescription(error);
  return options.detached === true
    ? `${description} Some drafts may already have changed.`
    : description;
}
