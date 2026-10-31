import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { mediaItem } from "../../../app/testing/index.js";
import { MediaListTable } from "./index.js";

test("rows show media facts without raw user IDs and open details from the filename", async () => {
  const user = userEvent.setup();
  const onOpen = vi.fn();
  render(
    <MediaListTable
      items={[
        { ...mediaItem, height: 600, size: 2048, usageCount: 2, width: 800 },
        {
          ...mediaItem,
          filename: "odd.webp",
          id: "media-2",
          mimeType: "image/webp",
          tags: [],
          usageCount: 1,
        },
      ]}
      label="Media library"
      onOpen={onOpen}
    />,
  );
  const table = screen.getByRole("table", { name: "Media library" });
  const [header, first, second] = within(table).getAllByRole("row");
  expect(header).toHaveTextContent("FilenameTypeDimensionsSizeUploaded byUploadedUsed in");
  expect(first).toHaveTextContent("cover.png");
  expect(first).toHaveTextContent("PNG");
  expect(first).toHaveTextContent("800 × 600 px");
  expect(first).toHaveTextContent("2 KB");
  expect(first).toHaveTextContent("editor@lace.test");
  expect(first).toHaveTextContent(/Sep (19|20), 2026/u);
  expect(first).toHaveTextContent("2 entries");
  expect(second).toHaveTextContent("Unknown");
  expect(second).toHaveTextContent("1 entry");
  expect(table).not.toHaveTextContent("editor-1");
  await user.click(within(second as HTMLElement).getByRole("button", { name: "odd.webp" }));
  expect(onOpen).toHaveBeenCalledWith(
    expect.objectContaining({ id: "media-2" }),
    expect.anything(),
  );
});
