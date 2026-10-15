import type { MediaMetadataDto, MediaUsageEntryDto } from "@lacecms/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AdminClientError,
  adminQueryKeys,
  errorDescription,
  useAdminClient,
} from "../../shared/api/index.js";

/** Entries whose drafts a detaching deletion changes. */
export type DetachedEntries = readonly Pick<MediaUsageEntryDto, "entryId" | "modelKey">[];

/**
 * Requests deletion of an active item, or retries a failed deletion. With
 * `detachFrom`, the server first removes the item from those entries' drafts,
 * whose cached state is then refreshed.
 */
export function useMediaDeletion(onChanged: (item: MediaMetadataDto) => void) {
  const client = useAdminClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      detachFrom,
      id,
      retry,
    }: {
      readonly detachFrom?: DetachedEntries;
      readonly id: string;
      readonly retry: boolean;
    }) =>
      retry
        ? client.retryMediaDeletion(id)
        : detachFrom === undefined
          ? client.deleteMedia(id)
          : client.deleteMedia(id, { detachDrafts: true }),
    onSettled: async (_item, _error, { detachFrom = [] }) => {
      // A refused detaching request may still have changed earlier drafts.
      await Promise.all(
        detachFrom.flatMap((entry) => [
          queryClient.invalidateQueries({ queryKey: adminQueryKeys.entry(entry.entryId) }),
          queryClient.invalidateQueries({ queryKey: adminQueryKeys.modelEntries(entry.modelKey) }),
        ]),
      );
    },
    onSuccess: async (item) => {
      onChanged(item);
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.media });
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
