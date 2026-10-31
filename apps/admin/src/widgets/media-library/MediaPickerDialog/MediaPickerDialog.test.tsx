import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { mediaItem, renderInRouter, stubClient } from "../../../app/testing/index.js";
import type { AdminClient } from "../../../shared/api/index.js";
import { MediaPickerDialog } from "./index.js";

async function mount(
  client: Partial<AdminClient>,
  session: { readonly id: string; readonly role: "admin" | "editor" | "viewer" } = {
    id: "editor-1",
    role: "editor",
  },
) {
  const onChoose = vi.fn();
  renderInRouter(
    <MediaPickerDialog
      currentId={undefined}
      label="Hero"
      onChoose={onChoose}
      onCloseAutoFocus={undefined}
      onOpenChange={vi.fn()}
      open
    />,
    { client: stubClient(client), session },
  );
  return {
    dialog: await screen.findByRole("dialog", { name: "Choose media for Hero" }),
    onChoose,
  };
}

test("activating a tile reports the chosen item", async () => {
  const user = userEvent.setup();
  const { dialog, onChoose } = await mount({ listMedia: async () => ({ items: [mediaItem] }) });
  await user.click(await within(dialog).findByRole("button", { name: "cover.png" }));
  expect(onChoose).toHaveBeenCalledWith(mediaItem);
  expect(within(dialog).getByText("Showing 1 item")).toBeInTheDocument();
});

test("a page of items pending deletion does not claim the library is empty", async () => {
  const user = userEvent.setup();
  const listMedia = vi.fn(async (cursor?: string) =>
    cursor === undefined
      ? { items: [{ ...mediaItem, status: "deleting" as const }], nextCursor: "next" }
      : { items: [{ ...mediaItem, filename: "later.png", id: "media-2" }] },
  );
  const { dialog } = await mount({ listMedia });
  const more = await within(dialog).findByRole("button", { name: "Load more media" });
  expect(within(dialog).queryByText("No media yet")).not.toBeInTheDocument();
  await user.click(more);
  expect(await within(dialog).findByRole("button", { name: "later.png" })).toBeInTheDocument();
});

test("empty and no-match states are distinguished and filters can be cleared", async () => {
  const user = userEvent.setup();
  const listMedia = vi.fn(async () => ({ items: [] }));
  const { dialog } = await mount({ listMedia });
  expect(await within(dialog).findByText("No media yet")).toBeInTheDocument();
  await user.click(within(dialog).getByRole("button", { name: "JPEG" }));
  expect(await within(dialog).findByText("No matching media")).toBeInTheDocument();
  await user.click(within(dialog).getAllByRole("button", { name: "Clear filters" })[0]!);
  await waitFor(() => expect(listMedia).toHaveBeenLastCalledWith(undefined, {}));
  expect(await within(dialog).findByText("No media yet")).toBeInTheDocument();
});

test("a viewer can browse the picker without upload controls", async () => {
  const { dialog } = await mount(
    { listMedia: async () => ({ items: [mediaItem] }) },
    { id: "viewer-1", role: "viewer" },
  );
  expect(await within(dialog).findByRole("button", { name: "cover.png" })).toBeInTheDocument();
  expect(within(dialog).queryByRole("button", { name: "Upload images" })).not.toBeInTheDocument();
  expect(within(dialog).queryByLabelText("Upload images")).not.toBeInTheDocument();
});

test("picker tiles show each item's alt text", async () => {
  const { dialog } = await mount({
    listMedia: async () => ({
      items: [
        { ...mediaItem, alt: "Red bicycle" },
        { ...mediaItem, filename: "plain.png", id: "media-2" },
      ],
    }),
  });
  expect(
    await within(dialog).findByRole("button", { name: "cover.png" }),
  ).toHaveAccessibleDescription("Red bicycle");
  expect(within(dialog).getByRole("button", { name: "plain.png" })).toHaveAccessibleDescription(
    "No alt text",
  );
});

test("the picker filters by tag from the first page", async () => {
  const user = userEvent.setup();
  const listMedia = vi.fn(async () => ({ items: [mediaItem] }));
  const { dialog } = await mount({ listMedia });
  await within(dialog).findByRole("button", { name: "cover.png" });
  await user.type(
    within(dialog).getByRole("combobox", { name: "Filter by tags (all must match)" }),
    "project-2026{Enter}",
  );
  await waitFor(() =>
    expect(listMedia).toHaveBeenLastCalledWith(undefined, { tags: ["project-2026"] }),
  );
  expect(
    within(dialog).getByRole("button", { name: "Remove tag project-2026" }),
  ).toBeInTheDocument();
});

test("Escape in open tag suggestions keeps the picker open", async () => {
  const user = userEvent.setup();
  const { dialog } = await mount({
    listMedia: async () => ({ items: [mediaItem] }),
    listMediaTags: async () => ({ items: [{ count: 2, tag: "cover" }] }),
  });
  const input = within(dialog).getByRole("combobox", { name: "Filter by tags (all must match)" });
  await user.click(input);
  await within(dialog).findByRole("option", { name: "cover, 2 items" });
  await user.keyboard("{Escape}");
  expect(input).toHaveAttribute("aria-expanded", "false");
  expect(screen.getByRole("dialog", { name: "Choose media for Hero" })).toBeInTheDocument();
});

test("files dropped into a tag-filtered picker carry the filter tags", async () => {
  const user = userEvent.setup();
  const uploadMedia = vi.fn(async () => mediaItem);
  const { dialog } = await mount({ listMedia: async () => ({ items: [mediaItem] }), uploadMedia });
  await user.type(
    within(dialog).getByRole("combobox", { name: "Filter by tags (all must match)" }),
    "cover{Enter}",
  );
  expect(within(dialog).getByText("New uploads are tagged cover.")).toBeInTheDocument();
  const file = new File(["png"], "fresh.png", { type: "image/png" });
  const dataTransfer = {
    files: [file],
    items: [{ getAsFile: () => file, kind: "file", type: file.type }],
    types: ["Files"],
  };
  const target = within(dialog)
    .getByText(/Drop images here/)
    .closest("[tabindex], div") as HTMLElement;
  await act(async () => {
    fireEvent.drop(target, { dataTransfer });
  });
  await waitFor(() =>
    expect(uploadMedia).toHaveBeenCalledWith(file, expect.objectContaining({ tags: ["cover"] })),
  );
});
