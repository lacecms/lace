import type { MediaListDto } from "@lacecms/contracts";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { useSessionRecovery } from "../../entities/session/index.js";
import { adminQueryKeys, useAdminClient } from "../../shared/api/index.js";
import type { CanonicalMediaQuery } from "./library-query.js";

const pageSize = 24;

/** Keep appended pages within the current library visit, picker opening and effective query. */
export function useMediaBrowser(query: CanonicalMediaQuery) {
  const browser = useId();
  const client = useAdminClient();
  const request = {
    limit: pageSize,
    ...(query.q === undefined ? {} : { q: query.q }),
    ...(query.sort === undefined ? {} : { sort: query.sort }),
    ...(query.tag === undefined ? {} : { tags: query.tag }),
    ...(query.type === undefined ? {} : { type: query.type }),
  };
  const listKey = adminQueryKeys.mediaList(request);
  const filter = JSON.stringify(listKey);
  const [state, setState] = useState({ filter, revision: 0 });
  const revision = state.filter === filter ? state.revision : state.revision + 1;
  if (state.filter !== filter) setState({ filter, revision });
  const scope = `${browser}-${revision}`;
  const media = useInfiniteQuery({
    getNextPageParam: (page: MediaListDto) => page.nextCursor,
    initialPageParam: undefined as string | undefined,
    placeholderData: keepPreviousData,
    queryFn: ({ pageParam }) => client.listMedia(pageParam, request),
    queryKey: [...listKey, scope],
  });
  useSessionRecovery(media.error);
  return { media, scope };
}
