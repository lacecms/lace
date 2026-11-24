import { screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { renderInRouter, stubClient } from "../../../app/testing/index.js";
import { useMediaBrowser } from "../media-browser.js";
import { MediaResults } from "./index.js";

function EmptyResults() {
  const browser = useMediaBrowser({});
  return (
    <MediaResults {...browser} items={[]}>
      {null}
    </MediaResults>
  );
}

test("a final empty batch focuses the count when it removes the continuation", async () => {
  const user = userEvent.setup();
  const listMedia = vi.fn(async (cursor?: string) =>
    cursor === undefined ? { items: [], nextCursor: "next" } : { items: [] },
  );
  renderInRouter(<EmptyResults />, { client: stubClient({ listMedia }) });
  await user.click(await screen.findByRole("button", { name: "Load more media" }));
  const status = screen.getByRole("status", { name: "Media results" });
  await waitFor(() => expect(status).toHaveFocus());
  expect(status).toHaveTextContent("0 items added. Showing 0 items");
  expect(screen.queryByRole("button", { name: "Load more media" })).toBeNull();
  expect(listMedia).toHaveBeenLastCalledWith("next", { limit: 24 });
});
