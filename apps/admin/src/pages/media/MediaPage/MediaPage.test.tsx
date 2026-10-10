import { screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import {
  mediaItem,
  renderRoute,
  stubClient as client,
  staticSessionSource,
} from "../../../app/testing/index.js";
import { AdminClientError } from "../../../shared/api/index.js";

afterEach(() => {
  vi.restoreAllMocks();
});

const viewer = () => staticSessionSource({ id: "viewer-1", role: "viewer" });

test("media route shows a paged grid and details to a viewer without write controls", async () => {
  const user = userEvent.setup();
  const listMedia = vi.fn(async (cursor?: string) =>
    cursor === undefined
      ? { items: [mediaItem], nextCursor: "opaque+/=" }
      : {
          items: [
            {
              ...mediaItem,
              filename: "later.png",
              id: "media-2",
              status: "delete_failed" as const,
            },
          ],
        },
  );
  renderRoute("/media", viewer(), client({ listMedia }));
  expect(await screen.findByRole("heading", { name: "Media" })).toBeInTheDocument();
  const grid = await screen.findByRole("list", { name: "Media library" });
  expect(within(grid).getByRole("button", { name: "cover.png" })).toBeInTheDocument();
  expect(screen.queryByLabelText("Upload images")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Upload images" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Load more media" }));
  expect(await within(grid).findByRole("button", { name: /later\.png/ })).toHaveTextContent(
    "Deletion failed",
  );
  expect(listMedia).toHaveBeenLastCalledWith("opaque+/=", {});
  await user.click(within(grid).getByRole("button", { name: "cover.png" }));
  const panel = await screen.findByRole("dialog", { name: "cover.png" });
  expect(within(panel).getByRole("img", { name: "Preview of cover.png" })).toHaveAttribute(
    "src",
    "/api/v1/admin/media/media-1/preview",
  );
  expect(within(panel).queryByRole("button", { name: /Delete/ })).not.toBeInTheDocument();
});

test("media route distinguishes an empty library from a failed one", async () => {
  renderRoute("/media", viewer(), client());
  expect(await screen.findByRole("heading", { name: "No media yet" })).toBeInTheDocument();

  document.body.replaceChildren();
  renderRoute(
    "/media",
    viewer(),
    client({
      listMedia: async () => {
        throw new AdminClientError({ message: "Media unavailable" });
      },
    }),
  );
  expect(await screen.findByText("Media unavailable")).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "No media yet" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
});
