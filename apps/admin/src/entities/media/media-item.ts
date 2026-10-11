import type { MediaDetailDto } from "@lacecms/contracts";
import { useQuery } from "@tanstack/react-query";
import { adminQueryKeys, useAdminClient } from "../../shared/api/index.js";

/**
 * One media item through the single-item read, sharing its cache entry with
 * every other reader of the same item; disabled without an identifier.
 */
export function useMediaItem(mediaId: string | undefined) {
  const client = useAdminClient();
  return useQuery<MediaDetailDto>({
    enabled: mediaId !== undefined,
    queryFn: () => client.getMedia(mediaId!),
    queryKey: adminQueryKeys.mediaDetail(mediaId ?? ""),
    retry: false,
  });
}
