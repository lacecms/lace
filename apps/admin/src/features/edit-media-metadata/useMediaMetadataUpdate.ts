import type {
  MediaDetailDto,
  UpdateMediaMetadataRequestDto,
  UpdateMediaMetadataResultDto,
} from "@lacecms/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { adminQueryKeys, useAdminClient } from "../../shared/api/index.js";

/**
 * Saves descriptive metadata against the version the form edited. The returned
 * item replaces the cached detail (keeping its usage), so every reader of the
 * item, such as open block editors, sees it at once; lists are refreshed.
 */
export function useMediaMetadataUpdate(onSaved: (result: UpdateMediaMetadataResultDto) => void) {
  const client = useAdminClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      expectedUpdatedAt,
      mediaId,
      patch,
    }: {
      readonly expectedUpdatedAt: string;
      readonly mediaId: string;
      readonly patch: UpdateMediaMetadataRequestDto;
    }) => client.updateMediaMetadata(mediaId, patch, expectedUpdatedAt),
    onSuccess: async (result) => {
      queryClient.setQueryData<MediaDetailDto>(
        adminQueryKeys.mediaDetail(result.media.id),
        (current) => ({ ...result.media, usage: current?.usage ?? [] }),
      );
      onSaved(result);
      await queryClient.invalidateQueries({ queryKey: [...adminQueryKeys.media, "list"] });
    },
  });
}
