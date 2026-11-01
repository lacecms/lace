import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { useState } from "react";
import { expect, test, vi } from "vitest";
import { mediaItem, renderInRouter, stubClient } from "../../../app/testing/index.js";
import type { MediaMetadataDto } from "@lacecms/contracts";
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

test("Escape on the tag rule tooltip closes only the tooltip", async () => {
  const user = userEvent.setup();
  const { dialog } = await mount({ listMedia: async () => ({ items: [mediaItem] }) });
  const help = within(dialog).getByRole("button", { name: "About tag filters" });
  help.focus();
  expect(await screen.findByRole("tooltip")).toHaveTextContent("Items must have all tags");
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
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

const named = (name: string): MediaMetadataDto => ({
  ...mediaItem,
  filename: `${name}.jpg`,
  id: `media-${name}`,
});

/** Multiple mode around a Reopen button, so a test can close and open the picker again. */
function SelectionHarness({
  capacity,
  existingIds = new Set(),
  onConfirm,
}: {
  readonly capacity: number;
  readonly existingIds?: ReadonlySet<string> | undefined;
  readonly onConfirm: (items: readonly MediaMetadataDto[]) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button onClick={() => setOpen(true)} type="button">
        Reopen
      </button>
      <MediaPickerDialog
        label="Images"
        onCloseAutoFocus={undefined}
        onOpenChange={setOpen}
        open={open}
        selection={{
          capacity,
          existingIds,
          limitMessage: "Images allows at most 50 items.",
          onConfirm,
        }}
      />
    </>
  );
}

async function mountSelection(
  client: Partial<AdminClient>,
  { capacity = 10, existingIds }: { capacity?: number; existingIds?: ReadonlySet<string> } = {},
) {
  const onConfirm = vi.fn();
  renderInRouter(
    <SelectionHarness capacity={capacity} existingIds={existingIds} onConfirm={onConfirm} />,
    { client: stubClient(client) },
  );
  return {
    dialog: await screen.findByRole("dialog", { name: "Add media to Images" }),
    onConfirm,
  };
}

async function dropFiles(dialog: HTMLElement, files: readonly File[]) {
  const dataTransfer = {
    files,
    items: files.map((file) => ({ getAsFile: () => file, kind: "file", type: file.type })),
    types: ["Files"],
  };
  const target = within(dialog)
    .getByText(/Drop images here/)
    .closest("[tabindex], div") as HTMLElement;
  await act(async () => {
    fireEvent.drop(target, { dataTransfer });
  });
}

test("multiple mode builds an ordered selection and confirms it", async () => {
  const user = userEvent.setup();
  const items = ["a", "b", "c"].map(named);
  const { dialog, onConfirm } = await mountSelection({ listMedia: async () => ({ items }) });
  expect(
    within(dialog).getByText(
      "Activate images to select them. They are added in the order selected.",
    ),
  ).toBeInTheDocument();
  for (const name of ["c.jpg", "a.jpg", "b.jpg", "a.jpg"])
    await user.click(await within(dialog).findByRole("button", { name }));
  expect(within(dialog).getByRole("button", { name: "c.jpg" })).toHaveTextContent("1");
  expect(within(dialog).getByRole("button", { name: "b.jpg" })).toHaveTextContent("2");
  expect(within(dialog).getByRole("button", { name: "a.jpg" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  expect(within(dialog).getByRole("status")).toHaveTextContent(
    "2 items selected. 8 more can be selected.",
  );
  await user.click(within(dialog).getByRole("button", { name: "Add 2 images" }));
  expect(onConfirm).toHaveBeenCalledWith([items[2], items[1]]);
});

test("a keyboard user selects with Space and Enter without closing the picker", async () => {
  const user = userEvent.setup();
  const { dialog } = await mountSelection({
    listMedia: async () => ({ items: [named("a"), named("b")] }),
  });
  const a = await within(dialog).findByRole("button", { name: "a.jpg" });
  const b = within(dialog).getByRole("button", { name: "b.jpg" });
  a.focus();
  await user.keyboard(" ");
  b.focus();
  await user.keyboard("{Enter}");
  expect(a).toHaveAttribute("aria-pressed", "true");
  expect(b).toHaveAttribute("aria-pressed", "true");
  expect(b).toHaveFocus();
  expect(screen.getByRole("dialog", { name: "Add media to Images" })).toBeInTheDocument();
});

test("the selection survives tag filtering and includes hidden items", async () => {
  const user = userEvent.setup();
  const tagged = ["t1", "t2", "t3"].map(named);
  const listMedia = vi.fn(async (_cursor?: string, query?: { tags?: readonly string[] }) => ({
    items: query?.tags === undefined ? [named("a"), named("b")] : tagged,
  }));
  const { dialog, onConfirm } = await mountSelection({ listMedia });
  await user.click(await within(dialog).findByRole("button", { name: "a.jpg" }));
  await user.click(within(dialog).getByRole("button", { name: "b.jpg" }));
  await user.type(
    within(dialog).getByRole("combobox", { name: "Filter by tags (all must match)" }),
    "project-2026{Enter}",
  );
  for (const name of ["t1.jpg", "t2.jpg", "t3.jpg"])
    await user.click(await within(dialog).findByRole("button", { name }));
  expect(within(dialog).getByRole("status")).toHaveTextContent("5 items selected.");
  await user.click(within(dialog).getByRole("button", { name: "Add 5 images" }));
  expect(onConfirm).toHaveBeenCalledWith([named("a"), named("b"), ...tagged]);
});

test("the capacity stops further selection until an item is deselected", async () => {
  const user = userEvent.setup();
  const items = ["a", "b", "c", "d"].map(named);
  const { dialog } = await mountSelection({ listMedia: async () => ({ items }) }, { capacity: 3 });
  for (const name of ["a.jpg", "b.jpg", "c.jpg"])
    await user.click(await within(dialog).findByRole("button", { name }));
  expect(within(dialog).getByRole("status")).toHaveTextContent(
    "3 items selected. Limit reached: Images allows at most 50 items.",
  );
  const d = within(dialog).getByRole("button", { name: "d.jpg" });
  expect(d).toHaveAttribute("aria-disabled", "true");
  expect(d).toHaveAccessibleDescription("No alt text Images allows at most 50 items.");
  await user.click(d);
  expect(d).toHaveAttribute("aria-pressed", "false");
  await user.click(within(dialog).getByRole("button", { name: "a.jpg" }));
  expect(d).not.toHaveAttribute("aria-disabled");
  await user.click(d);
  expect(d).toHaveAttribute("aria-pressed", "true");
});

test("confirmed uploads join the selection in order", async () => {
  const user = userEvent.setup();
  const uploadMedia = vi.fn(async (file: File) => named(file.name.replace(".png", "")));
  const { dialog, onConfirm } = await mountSelection({
    listMedia: async () => ({ items: [named("a")] }),
    uploadMedia,
  });
  await user.click(await within(dialog).findByRole("button", { name: "a.jpg" }));
  await dropFiles(dialog, [
    new File(["png"], "one.png", { type: "image/png" }),
    new File(["png"], "two.png", { type: "image/png" }),
  ]);
  const confirm = await within(dialog).findByRole("button", { name: "Add 3 images" });
  expect(within(dialog).getByRole("button", { name: "Select one.png" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await user.click(confirm);
  expect(onConfirm).toHaveBeenCalledWith([named("a"), named("one"), named("two")]);
});

test("an upload that does not fit stays unselected until room is made", async () => {
  const user = userEvent.setup();
  const { dialog } = await mountSelection(
    {
      listMedia: async () => ({ items: [named("a")] }),
      uploadMedia: async () => named("fresh"),
    },
    { capacity: 1 },
  );
  await user.click(await within(dialog).findByRole("button", { name: "a.jpg" }));
  await dropFiles(dialog, [new File(["png"], "fresh.png", { type: "image/png" })]);
  const row = await within(dialog).findByRole("button", { name: "Select fresh.png" });
  expect(row).toHaveAttribute("aria-pressed", "false");
  expect(row).toHaveAccessibleDescription("Selection limit reached");
  await user.click(within(dialog).getByRole("button", { name: "a.jpg" }));
  await user.click(row);
  expect(row).toHaveAttribute("aria-pressed", "true");
  expect(within(dialog).getByRole("button", { name: "Add 1 image" })).toBeEnabled();
});

test("media already in the list is marked and selectable", async () => {
  const user = userEvent.setup();
  const { dialog } = await mountSelection(
    { listMedia: async () => ({ items: [named("hero")] }) },
    { existingIds: new Set(["media-hero"]) },
  );
  const tile = await within(dialog).findByRole("button", { name: "hero.jpg" });
  expect(tile).toHaveTextContent("Already in Images");
  await user.click(tile);
  expect(tile).toHaveAttribute("aria-pressed", "true");
});

test("Escape discards the selection and reopening starts empty", async () => {
  const user = userEvent.setup();
  const listMedia = vi.fn(async () => ({ items: [named("a")] }));
  const { dialog, onConfirm } = await mountSelection({ listMedia });
  await user.click(await within(dialog).findByRole("button", { name: "a.jpg" }));
  await user.keyboard("{Escape}");
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "Add media to Images" })).not.toBeInTheDocument(),
  );
  expect(onConfirm).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Reopen" }));
  const reopened = await screen.findByRole("dialog", { name: "Add media to Images" });
  expect(await within(reopened).findByRole("button", { name: "a.jpg" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  expect(within(reopened).getByRole("button", { name: "Add 0 images" })).toBeDisabled();
});

test("Cancel closes without confirming, and confirming needs a selection", async () => {
  const user = userEvent.setup();
  const { dialog, onConfirm } = await mountSelection({
    listMedia: async () => ({ items: [named("a")] }),
  });
  await within(dialog).findByRole("button", { name: "a.jpg" });
  expect(within(dialog).getByRole("status")).toHaveTextContent(
    "No items selected. You can select up to 10 items.",
  );
  expect(within(dialog).getByRole("button", { name: "Add 0 images" })).toBeDisabled();
  expect(within(dialog).queryByRole("button", { name: "Clear selection" })).not.toBeInTheDocument();
  await user.click(within(dialog).getByRole("button", { name: "a.jpg" }));
  await user.click(within(dialog).getByRole("button", { name: "Clear selection" }));
  expect(within(dialog).getByRole("button", { name: "a.jpg" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(onConfirm).not.toHaveBeenCalled();
});

test("multiple mode marks no current tile", async () => {
  const { dialog } = await mountSelection({ listMedia: async () => ({ items: [mediaItem] }) });
  expect(await within(dialog).findByRole("button", { name: "cover.png" })).not.toHaveAttribute(
    "aria-current",
  );
});
