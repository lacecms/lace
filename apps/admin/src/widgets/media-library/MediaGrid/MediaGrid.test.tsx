import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { mediaItem } from "../../../app/testing/index.js";
import { MediaGrid } from "./index.js";

test("tiles show lazy thumbnails, filenames, and non-active status, and open details", async () => {
  const user = userEvent.setup();
  const onOpen = vi.fn();
  render(
    <MediaGrid
      items={[mediaItem, { ...mediaItem, filename: "old.png", id: "media-2", status: "deleting" }]}
      label="Media library"
      onOpen={onOpen}
    />,
  );
  const grid = screen.getByRole("list", { name: "Media library" });
  const tiles = within(grid).getAllByRole("button");
  expect(tiles.map((tile) => tile.textContent)).toEqual(["cover.png", "Deletion pendingold.png"]);
  expect(tiles[0]?.querySelector("img")).toHaveAttribute("loading", "lazy");
  expect(tiles[0]).toHaveAttribute("aria-haspopup", "dialog");
  await user.click(screen.getByRole("button", { name: "cover.png" }));
  expect(onOpen).toHaveBeenCalledWith(mediaItem, tiles[0]);
});

test("choose mode marks the current tile and does not announce a details popup", async () => {
  const user = userEvent.setup();
  const onOpen = vi.fn();
  const later = { ...mediaItem, filename: "later.png", id: "media-2" };
  render(
    <MediaGrid
      currentId="media-2"
      items={[mediaItem, later]}
      label="Media choices for Hero"
      mode="choose"
      onOpen={onOpen}
    />,
  );
  const current = screen.getByRole("button", { name: "later.png" });
  expect(current).toHaveAttribute("aria-current", "true");
  expect(current).not.toHaveAttribute("aria-haspopup");
  expect(screen.getByRole("button", { name: "cover.png" })).not.toHaveAttribute("aria-current");
  await user.click(screen.getByRole("button", { name: "cover.png" }));
  expect(onOpen).toHaveBeenCalledWith(mediaItem, expect.any(HTMLButtonElement));
});

test("choose mode describes each tile with its alt text", () => {
  render(
    <MediaGrid
      items={[
        { ...mediaItem, alt: "Red bicycle" },
        { ...mediaItem, id: "media-2" },
      ]}
      label="Media choices for Image"
      mode="choose"
      onOpen={vi.fn()}
    />,
  );
  const [described, bare] = within(
    screen.getByRole("list", { name: "Media choices for Image" }),
  ).getAllByRole("button");
  expect(described).toHaveAccessibleName("cover.png");
  expect(described).toHaveAccessibleDescription("Red bicycle");
  expect(within(described!).getByText("Red bicycle")).toHaveAttribute("title", "Red bicycle");
  expect(bare).toHaveAccessibleDescription("No alt text");
});

test("open mode leaves the library tiles without alt text", () => {
  render(
    <MediaGrid
      items={[{ ...mediaItem, alt: "Red bicycle" }]}
      label="Media library"
      onOpen={vi.fn()}
    />,
  );
  expect(screen.queryByText("Red bicycle")).toBeNull();
});
