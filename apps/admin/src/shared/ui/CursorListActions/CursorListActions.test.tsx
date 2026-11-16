import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { CursorListActions } from "./CursorListActions.js";

test("a temporary continuation error retries the next page", async () => {
  const fetchNextPage = vi.fn(async () => undefined);
  const refetch = vi.fn(async () => undefined);
  render(
    <CursorListActions
      label="Load more users"
      list={{
        invalidCursor: false,
        restart: async () => undefined,
        query: {
          error: new Error("Try again in a moment."),
          hasNextPage: true,
          isFetching: false,
          isFetchingNextPage: false,
          isFetchNextPageError: true,
          fetchNextPage,
          refetch,
        },
      }}
    />,
  );
  await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));
  expect(fetchNextPage).toHaveBeenCalledOnce();
  expect(refetch).not.toHaveBeenCalled();
});
