import { screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { mediaItem, renderInRouter, stubClient } from "../../../app/testing/index.js";
import { MediaListPicker } from "./index.js";

const later = { ...mediaItem, filename: "later.png", id: "media-2" };

function mount(role: "editor" | "viewer") {
  const onConfirm = vi.fn();
  renderInRouter(
    <>
      <p>Editor ready</p>
      <MediaListPicker
        capacity={5}
        existingIds={new Set()}
        label="Images"
        limitMessage="Images allows at most 50 items."
        onCloseAutoFocus={vi.fn()}
        onConfirm={onConfirm}
        onOpenChange={vi.fn()}
        open
      />
    </>,
    {
      client: stubClient({ listMedia: async () => ({ items: [mediaItem, later] }) }),
      session: { id: `${role}-1`, role },
    },
  );
  return onConfirm;
}

test("confirming hands over identifiers in selection order", async () => {
  const user = userEvent.setup();
  const onConfirm = mount("editor");
  const dialog = await screen.findByRole("dialog", { name: "Add media to Images" });
  await user.click(await within(dialog).findByRole("button", { name: "later.png" }));
  await user.click(within(dialog).getByRole("button", { name: "cover.png" }));
  await user.click(within(dialog).getByRole("button", { name: "Add 2 images" }));
  expect(onConfirm).toHaveBeenCalledWith(["media-2", mediaItem.id]);
});

test("viewers never get multiple mode", async () => {
  mount("viewer");
  await screen.findByText("Editor ready");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
