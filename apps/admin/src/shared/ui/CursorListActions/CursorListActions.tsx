import { errorDescription, technicalDetails } from "../../api/index.js";
import { Button } from "../Button/index.js";
import { ErrorState } from "../ErrorState/index.js";

export function CursorListActions({
  list,
  label,
  errorTitle,
}: {
  readonly list: {
    readonly invalidCursor: boolean;
    readonly restart: () => Promise<unknown>;
    readonly query: {
      readonly error: unknown;
      readonly hasNextPage: boolean;
      readonly isFetching: boolean;
      readonly isFetchingNextPage: boolean;
      readonly isFetchNextPageError: boolean;
      readonly fetchNextPage: () => Promise<unknown>;
      readonly refetch: () => Promise<unknown>;
    };
  };
  readonly label: string;
  readonly errorTitle?: string;
}) {
  const { query, invalidCursor, restart } = list;
  if (invalidCursor) {
    return (
      <div className="grid justify-items-start gap-2" role="alert">
        <p className="m-0 text-sm">The continuation expired. Restart to refresh this list.</p>
        <Button disabled={query.isFetching} variant="outline" onClick={() => void restart()}>
          Restart list
        </Button>
      </div>
    );
  }
  if (query.error) {
    return (
      <ErrorState
        {...(errorTitle === undefined ? {} : { title: errorTitle })}
        description={errorDescription(query.error)}
        onRetry={() => void (query.isFetchNextPageError ? query.fetchNextPage() : query.refetch())}
        retrying={query.isFetching}
        technicalDetails={technicalDetails(query.error)}
      />
    );
  }
  return query.hasNextPage ? (
    <div>
      <Button
        disabled={query.isFetching}
        variant="outline"
        onClick={() => void query.fetchNextPage()}
      >
        {query.isFetchingNextPage ? "Loading more…" : label}
      </Button>
    </div>
  ) : null;
}
