import { useInfiniteQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { AdminClientError } from "./admin-transport.js";

function invalidContinuation(error: unknown): boolean {
  return (
    error instanceof AdminClientError &&
    error.status === 422 &&
    error.code === "VALIDATION_FAILED" &&
    error.issues?.some((issue) => issue.path === "/after") === true
  );
}

export function useCursorList<Page extends { nextCursor?: string | undefined }>(
  queryKey: QueryKey,
  load: (after?: string) => Promise<Page>,
  options: { enabled?: boolean; pollInterval?: number } = {},
) {
  const queryClient = useQueryClient();
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => load(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor,
    enabled: options.enabled ?? true,
    refetchInterval: (current) =>
      invalidContinuation(current.state.error) ? false : (options.pollInterval ?? false),
  });
  return {
    query,
    invalidCursor: invalidContinuation(query.error),
    restart: () => queryClient.resetQueries({ exact: true, queryKey }),
  };
}
